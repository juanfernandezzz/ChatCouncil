//! Importación del historial de la Unity (ADR-0006): copia conversaciones/*.jsonl de su carpeta a la de
//! la app nueva, solo si no existen ya. La carpeta de origen se abre solo para leer.

use std::fs::{self, File, OpenOptions};
use std::io;
use std::path::Path;

/// Copia los registros que faltan en `destino`; devuelve cuántos copió. Los que ya existen no se tocan.
pub fn importar(origen: &Path, destino: &Path) -> io::Result<usize> {
    let dir = match fs::read_dir(origen.join("conversaciones")) {
        Ok(d) => d,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(0),
        Err(e) => return Err(e),
    };
    let salida = destino.join("conversaciones");
    fs::create_dir_all(&salida)?;
    let mut copiados = 0;
    for entrada in dir {
        let entrada = entrada?;
        let nombre = entrada.file_name();
        if !nombre.to_string_lossy().ends_with(".jsonl") || !entrada.file_type()?.is_file() {
            continue;
        }
        let nuevo = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(salida.join(&nombre))
        {
            Ok(f) => f,
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        };
        let copia = (|| {
            let mut w = io::BufWriter::new(nuevo);
            io::copy(&mut File::open(entrada.path())?, &mut w)?;
            w.into_inner().map_err(|e| e.into_error())?.sync_all()
        })();
        // Un destino a medias se borra: si quedara, la importación siguiente lo daría por copiado
        // (revisión PART-003). Es un archivo que esta misma llamada creó con create_new.
        if let Err(e) = copia {
            let _ = fs::remove_file(salida.join(&nombre));
            return Err(e);
        }
        copiados += 1;
    }
    Ok(copiados)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::path::PathBuf;

    /// sha256 de una carpeta: nombres relativos y contenido de cada archivo, en orden.
    pub(crate) fn sha256_carpeta(raiz: &Path) -> String {
        fn recorrer(raiz: &Path, dir: &Path, h: &mut Sha256) {
            let mut entradas: Vec<PathBuf> = fs::read_dir(dir)
                .unwrap()
                .map(|e| e.unwrap().path())
                .collect();
            entradas.sort();
            for p in entradas {
                h.update(p.strip_prefix(raiz).unwrap().to_string_lossy().as_bytes());
                if p.is_dir() {
                    recorrer(raiz, &p, h);
                } else {
                    h.update(fs::read(&p).unwrap());
                }
            }
        }
        let mut h = Sha256::new();
        recorrer(raiz, raiz, &mut h);
        h.finalize().iter().map(|b| format!("{b:02x}")).collect()
    }

    #[test]
    fn importar_registros_copia_lo_que_falta_y_no_toca_el_origen() {
        let base = std::env::temp_dir().join(format!("cc-importar-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let (origen, destino) = (base.join("unity"), base.join("nueva"));
        fs::create_dir_all(origen.join("conversaciones")).unwrap();
        fs::write(
            origen.join("conversaciones/a.jsonl"),
            "{\"tipo\":\"conversacion\"}\n",
        )
        .unwrap();
        fs::write(origen.join("conversaciones/b.jsonl"), "línea b\n").unwrap();
        fs::write(origen.join("conversaciones/notas.txt"), "no se copia").unwrap();
        fs::create_dir_all(destino.join("conversaciones")).unwrap();
        fs::write(destino.join("conversaciones/b.jsonl"), "ya estaba\n").unwrap();

        let antes = sha256_carpeta(&origen);
        println!("sha256 origen antes:   {antes}");
        assert_eq!(importar(&origen, &destino).unwrap(), 1);
        assert_eq!(
            importar(&origen, &destino).unwrap(),
            0,
            "lo ya importado no se vuelve a copiar"
        );
        let despues = sha256_carpeta(&origen);
        println!("sha256 origen después: {despues}");
        assert_eq!(antes, despues);

        assert_eq!(
            fs::read(destino.join("conversaciones/a.jsonl")).unwrap(),
            fs::read(origen.join("conversaciones/a.jsonl")).unwrap()
        );
        assert_eq!(
            fs::read_to_string(destino.join("conversaciones/b.jsonl")).unwrap(),
            "ya estaba\n"
        );
        assert!(!destino.join("conversaciones/notas.txt").exists());
        assert_eq!(importar(&base.join("no-existe"), &destino).unwrap(), 0);
        fs::remove_dir_all(&base).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn una_copia_fallida_se_reintenta_en_la_importacion_siguiente() {
        // revisión PART-003: un destino a medias no puede quedar como ya importado.
        use std::os::windows::fs::OpenOptionsExt;
        let base = std::env::temp_dir().join(format!("cc-importar-falla-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let (origen, destino) = (base.join("unity"), base.join("nueva"));
        fs::create_dir_all(origen.join("conversaciones")).unwrap();
        let a = origen.join("conversaciones/a.jsonl");
        fs::write(&a, "{\"tipo\":\"conversacion\"}\n").unwrap();
        let bloqueo = OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&a)
            .unwrap();
        assert!(importar(&origen, &destino).is_err());
        drop(bloqueo);
        assert_eq!(importar(&origen, &destino).unwrap(), 1);
        assert_eq!(
            fs::read(destino.join("conversaciones/a.jsonl")).unwrap(),
            fs::read(&a).unwrap()
        );
        fs::remove_dir_all(&base).unwrap();
    }
}
