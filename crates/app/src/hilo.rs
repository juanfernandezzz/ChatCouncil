//! ADR-0010, punto 2: la Puerta se crea y vive en un hilo propio del núcleo, que recibe órdenes por
//! un canal y responde. La interfaz espera la respuesta sin bloquear el dibujo.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::thread::JoinHandle;
use std::time::SystemTime;

use nucleo::puerta::Puerta;
use nucleo::ronda::{self, RolesElegidos};
use paneles::{Respuesta, canal};

type Orden = Box<dyn FnOnce(&mut Puerta) + Send>;

pub struct HiloNucleo {
    ordenes: Option<mpsc::Sender<Orden>>,
    hilo: Option<JoinHandle<()>>,
    /// Por qué no se pudo crear el hilo; cada orden responde con esto.
    error: String,
}

impl HiloNucleo {
    /// El consejo por defecto: lo usan la autoprueba y las pruebas del hilo.
    pub fn iniciar(datos: PathBuf) -> HiloNucleo {
        let roles = RolesElegidos::por_defecto();
        let activos = ronda::CONOCIDOS.iter().map(|s| s.to_string()).collect();
        let pool = ronda::pool_de_investigadores(&ronda::CONOCIDOS, &roles);
        HiloNucleo::con_consejo(datos, activos, roles, pool)
    }

    /// ARR-002: el consejo de seleccion-proveedores.json; la Puerta restaura la ronda activa del registro.
    pub fn con_consejo(
        datos: PathBuf,
        activos: Vec<String>,
        roles: RolesElegidos,
        pool: Vec<String>,
    ) -> HiloNucleo {
        let (ordenes, recibir) = mpsc::channel::<Orden>();
        let hilo = std::thread::Builder::new()
            .name("nucleo".into())
            .spawn(move || {
                let mut puerta = Puerta::new(
                    datos,
                    Box::new(crate::nuevo_id),
                    Box::new(SystemTime::now),
                    activos,
                    roles,
                    pool,
                );
                puerta.restaurar_ronda_activa();
                for orden in recibir {
                    orden(&mut puerta);
                }
            });
        match hilo {
            Ok(hilo) => HiloNucleo {
                ordenes: Some(ordenes),
                hilo: Some(hilo),
                error: String::new(),
            },
            Err(e) => HiloNucleo {
                ordenes: None,
                hilo: None,
                error: format!("no se pudo crear el hilo del núcleo: {e}"),
            },
        }
    }

    /// Manda una orden a la Puerta. Si el hilo ya no está, la respuesta llega como error.
    pub fn pedir<T: Send + 'static>(
        &self,
        orden: impl FnOnce(&mut Puerta) -> T + Send + 'static,
    ) -> Respuesta<T> {
        let (enviar, respuesta) = canal();
        match &self.ordenes {
            // Si el hilo ya terminó, la orden se suelta sin correr y la respuesta llega como error.
            Some(ordenes) => {
                let _ = ordenes.send(Box::new(move |p| enviar.enviar(orden(p))));
            }
            None => enviar.fallar(self.error.clone()),
        }
        respuesta
    }
}

/// Se enciende justo antes de `process::exit`: Windows ya terminó los demás hilos cuando se destruye
/// lo que guarda el hilo principal, y esperar al del núcleo en ese momento aborta el proceso.
pub static SALIENDO: AtomicBool = AtomicBool::new(false);

impl Drop for HiloNucleo {
    fn drop(&mut self) {
        self.ordenes.take();
        if let Some(h) = self.hilo.take() {
            // Desde el propio hilo no se espera a sí mismo: termina solo al salir de la orden en curso.
            if h.thread().id() != std::thread::current().id() && !SALIENDO.load(Ordering::SeqCst) {
                let _ = h.join();
            }
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::sync::Arc;
    use std::task::{Context, Poll, Wake, Waker};

    struct Despertador(std::thread::Thread);
    impl Wake for Despertador {
        fn wake(self: Arc<Self>) {
            self.0.unpark();
        }
    }

    fn esperar<T>(mut r: paneles::Respuesta<T>) -> Result<T, String> {
        let waker = Waker::from(Arc::new(Despertador(std::thread::current())));
        let mut cx = Context::from_waker(&waker);
        loop {
            match std::pin::Pin::new(&mut r).poll(&mut cx) {
                Poll::Ready(v) => return v,
                Poll::Pending => std::thread::park(),
            }
        }
    }

    #[test]
    fn soltar_el_hilo_desde_el_mismo_hilo_no_lo_traba() {
        // Revisión PART-011, hallazgo 8: el join sobre sí mismo esperaba para siempre.
        let datos = std::env::temp_dir().join(format!("cc-hilo-drop-{}", std::process::id()));
        let compartido = Arc::new(std::sync::Mutex::new(Some(HiloNucleo::iniciar(
            datos.clone(),
        ))));
        let adentro = compartido.clone();
        let orden = compartido
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .pedir(move |_| {
                drop(adentro.lock().unwrap().take());
            });
        let r = esperar(orden.con_techo(std::time::Duration::from_secs(5), "se trabó".into()));
        assert_eq!(r, Ok(()));
        let _ = std::fs::remove_dir_all(&datos);
    }

    #[test]
    fn una_orden_va_al_hilo_del_nucleo_y_vuelve_y_escribe_en_la_carpeta_de_datos() {
        // ARR-001: las conversaciones van a <datos>/conversaciones.
        let datos = std::env::temp_dir().join(format!("cc-hilo-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&datos);
        let nucleo = HiloNucleo::iniciar(datos.clone());
        let etapa = esperar(nucleo.pedir(|p| {
            p.paso_siguiente()
                .map(|s| s.etapa)
                .map_err(|e| e.to_string())
        }));
        assert_eq!(etapa, Ok(Ok("pregunta")));
        let ronda =
            esperar(nucleo.pedir(|p| p.abrir_ronda("¿Una pregunta?").map_err(|e| e.to_string())));
        assert!(matches!(ronda, Ok(Ok(_))), "{ronda:?}");
        let archivos: Vec<_> = std::fs::read_dir(datos.join("conversaciones"))
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(archivos.len(), 1);
        assert!(archivos[0].ends_with(".jsonl"));
        drop(nucleo);
        std::fs::remove_dir_all(&datos).unwrap();
    }
}
