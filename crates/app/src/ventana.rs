//! La ventana de la app (PART-014): la misma estructura y los mismos textos que Ronda.uxml y
//! Configuracion.uxml, con los controles de Slint. Los textos que vienen de nucleo::ajustes los pone
//! interfaz.rs; acá quedan los literales del uxml.

/// D27, A3: el alto mínimo de la página del proveedor; el asa del campo no lo achica más.
pub const ALTO_MINIMO_PANEL: f32 = 200.0;

slint::slint! {
    import { Button, CheckBox, ComboBox, LineEdit, ScrollView, TextEdit, AboutSlint, Palette } from "std-widgets.slint";

    // ADR-0010, punto 11: «ChatCouncil (nueva)» hasta el relevo (E9).
    // ARR-007: con -autoprueba no se arma la interfaz; el panel va en una ventana sola.
    export component Lienzo inherits Window {
        title: "ChatCouncil (nueva)";
        width: 800px;
        height: 600px;
    }

    export struct Marca { id: string, nombre: string, marcado: bool }
    export struct Cuenta { id: string, nombre: string, estado: string }
    export struct Fila { id: string, nombre: string, estado: string, icono: string, rol: bool, visible: bool, actual: bool }
    export struct Anterior { id: string, pregunta: string, detalle: string, carpeta: string }
// D6, D7: un renglón del menú. El grupo va solo en el primero de cada grupo; el motivo, si está deshabilitado.
export struct Renglon { grupo: string, texto: string, motivo: string }

    // El foco visible de todos los controles: un borde de 2 px en #3A79E0 (WCAG 2.4.7).
    component Anillo inherits Rectangle {
        in property <bool> foco;
        border-width: foco ? 2px : 0px;
        border-color: #3A79E0;
        border-radius: 6px;
    }

    // Botón con 48 dp de alto mínimo (WCAG 2.5.8) y el foco en #3A79E0.
    component Boton inherits Rectangle {
        in property <string> text;
        in property <bool> primario;
        in property <bool> habilitado: true;
        // El nombre para el lector cuando el texto es un signo (‹ ›).
        in property <string> etiqueta;
        callback clicked;
        min-height: 48px;
        min-width: max(48px, b.min-width);
        preferred-width: b.preferred-width;
        horizontal-stretch: 0;
        forward-focus: b;
        b := Button {
            width: parent.width;
            height: parent.height;
            text: root.text;
            primary: root.primario;
            enabled: root.habilitado;
            accessible-label: root.etiqueta != "" ? root.etiqueta : root.text;
            clicked => { root.clicked(); }
        }
        Anillo { foco: b.has-focus; }
    }

    component Marcar inherits Rectangle {
        in property <string> text;
        in-out property <bool> checked;
        min-height: 48px;
        preferred-width: c.preferred-width;
        horizontal-stretch: 0;
        c := CheckBox {
            width: parent.width;
            height: parent.height;
            text: root.text;
            checked <=> root.checked;
        }
        Anillo { foco: c.has-focus; }
    }

    component Elegir inherits VerticalLayout {
        in property <string> etiqueta;
        in property <[string]> opciones;
        in-out property <int> indice;
        forward-focus: cb;
        spacing: 4px;
        Text { text: root.etiqueta; wrap: word-wrap; color: Palette.foreground; }
        Rectangle {
            min-height: 48px;
            cb := ComboBox {
                width: parent.width;
                height: parent.height;
                model: root.opciones;
                current-index <=> root.indice;
                accessible-label: root.etiqueta;
            }
            Anillo { foco: cb.has-focus; }
        }
    }

    component Parrafo inherits Text {
        wrap: word-wrap;
        color: Palette.foreground;
    }

    component Secundario inherits Text {
        wrap: word-wrap;
        color: Palette.foreground.transparentize(35%);
    }

    component TituloBloque inherits Text {
        font-weight: 600;
        font-size: 1.15rem;
        wrap: word-wrap;
        color: Palette.foreground;
    }

    // IFZ-023 (IconoEstado.cs): una forma por estado, así se distingue sin color (WCAG 1.4.1). Va siempre
    // junto a la palabra del estado, que es lo que lee el lector.
    component Icono inherits Rectangle {
        in property <string> estado;
        property <brush> tinta: Palette.foreground;
        property <brush> fondo: Palette.background;
        width: 16px;
        height: 16px;
        if root.estado != "problema" && root.estado != "" : Rectangle {
            width: 14px;
            height: 14px;
            border-radius: 7px;
            border-width: 2px;
            border-color: root.tinta;
            background: (root.estado == "terminado" || root.estado == "capturado") ? root.tinta : transparent;
        }
        if root.estado == "falta-enviar" : Rectangle { width: 5px; height: 5px; border-radius: 2.5px; background: root.tinta; }
        if root.estado == "respondiendo" : Path {
            width: 16px; height: 16px; viewbox-width: 16; viewbox-height: 16;
            fill: root.tinta;
            commands: "M 8 1 A 7 7 0 0 0 8 15 Z";
        }
        if root.estado == "capturado" : Path {
            width: 16px; height: 16px; viewbox-width: 16; viewbox-height: 16;
            stroke: root.fondo; stroke-width: 2px;
            commands: "M 4.8 8 L 7.3 10.5 L 11.2 5.5";
        }
        if root.estado == "problema" : Path {
            width: 16px; height: 16px; viewbox-width: 16; viewbox-height: 16;
            fill: root.tinta;
            commands: "M 8 1 L 15 15 L 1 15 Z";
        }
        if root.estado == "problema" : Path {
            width: 16px; height: 16px; viewbox-width: 16; viewbox-height: 16;
            stroke: root.fondo; stroke-width: 2px;
            commands: "M 8 6 L 8 10.5 M 8 12 L 8 13.5";
        }
    }

    // ESC-005 e IFZ-012: «Tu pregunta» con un asa debajo para fijar su alto arrastrando (Aplicacion.Asa).
    component CampoPregunta inherits VerticalLayout {
        in-out property <string> texto;
        in-out property <length> alto;
        // D27, A3: el tope del asa en la ventana actual.
        in property <length> maximo: 600px;
        property <length> alto-al-tomar;
        property <length> y-al-tomar;
        spacing: 2px;
        Text { text: "Tu pregunta"; color: Palette.foreground; }
        Rectangle {
            height: root.alto;
            campo := TextEdit {
                width: parent.width;
                height: parent.height;
                text <=> root.texto;
                wrap: word-wrap;
                accessible-label: "Tu pregunta";
            }
            Anillo { foco: campo.has-focus; }
        }
        Rectangle {
            height: 12px;
            Rectangle { width: 32px; height: 4px; border-radius: 2px; background: Palette.border; }
            ta := TouchArea {
                mouse-cursor: ns-resize;
                pointer-event(e) => {
                    if (e.kind == PointerEventKind.down) {
                        root.alto-al-tomar = root.alto;
                        root.y-al-tomar = self.absolute-position.y + self.mouse-y;
                    }
                }
                moved => {
                    if (self.pressed) {
                        root.alto = clamp(root.alto-al-tomar + self.absolute-position.y + self.mouse-y - root.y-al-tomar, 48px, max(48px, root.maximo));
                    }
                }
            }
        }
        Secundario {
            text: "Arrastra para cambiar el alto del campo";
            font-size: 0.85rem;
            visible: ta.has-hover || ta.pressed;
            height: (ta.has-hover || ta.pressed) ? self.preferred-height : 0px;
        }
    }

    // Una fila de la lista de paneles: enfocable y con Enter, como un botón (WCAG 2.1.1).
    component FilaPanel inherits Rectangle {
        in property <Fila> fila;
        callback activar();
        min-height: 48px;
        background: fila.actual ? Palette.selection-background.transparentize(70%) : transparent;
        border-radius: 6px;
        accessible-role: list-item;
        accessible-label: fila.nombre + ", " + fila.estado;
        accessible-item-selected: fila.actual;
        accessible-action-default => { root.activar(); }
        ta := TouchArea { clicked => { fs.focus(); root.activar(); } }
        fs := FocusScope {
            key-pressed(e) => {
                if (e.text == Key.Return || e.text == " ") { root.activar(); return accept; }
                reject
            }
        }
        HorizontalLayout {
            padding-left: 12px;
            padding-right: 12px;
            spacing: 8px;
            VerticalLayout { alignment: center; Icono { estado: fila.icono; } }
            Text { text: fila.nombre; font-weight: 600; vertical-alignment: center; color: Palette.foreground; }
            Text { text: fila.estado; vertical-alignment: center; horizontal-alignment: right; wrap: word-wrap; color: Palette.foreground.transparentize(35%); }
        }
        Anillo { foco: fs.has-focus; }
    }

    export component Ventana inherits Window {
        title: "ChatCouncil (nueva)";
        // main.rs abrir_maximizada usa este tamaño: si cambia, cambia allá también.
        preferred-width: 1280px;
        preferred-height: 800px;
        min-width: 360px;
        min-height: 480px;

        // ----- clases de ancho (D3), secciones (D2) y primer arranque (ARR-002)
        in property <bool> primer-arranque;
        in-out property <string> seccion: "ronda";
        // El ancho se copia con changed: atado directo a width, el riel cambia el mínimo de la ventana y forma un ciclo.
        property <length> ancho-visto: 1280px;
        init => { self.ancho-visto = self.width; }
        changed width => { self.ancho-visto = self.width; }
        out property <bool> ancha: root.ancho-visto >= 840px;
        out property <bool> compacta: root.ancho-visto < 600px;
        out property <bool> riel-visible: !root.primer-arranque && !root.compacta;
        in-out property <bool> cajon-abierto;
        // IFZ-013: el cajón aparta la página nativa, que va encima de todo lo que dibuja Slint.
        changed cajon-abierto => { root.area-cambio(); root.cuenta-area-cambio(); }
        callback seccion-cambiada(string);
        callback tecla(string);
        out property <bool> oscuro-aplicado: Palette.color-scheme == ColorScheme.dark;
        // D26: el contenido llena la ventana; la prueba de la interfaz lo mide.
        out property <length> ancho-contenido: contenido.width;
        out property <length> alto-contenido: contenido.height;

        // ----- Ronda (la mínima de PART-014; PART-015 la conecta)
        in property <[Fila]> filas;
        in property <string> titulo-investigadores;
        in property <bool> roles-visibles;
        in property <string> barra-titulo;
        in property <int> etapa-actual;
        in property <string> paso-texto;
        in property <bool> paso-habilitado;
        in property <string> frase;
        in property <string> contadores;
        in property <string> contadores-angosta;
        in property <string> resultado;
        in property <bool> resultado-problema;
        in property <string> cabecera-titulo;
        // ESC-005: la pregunta, en la guía (ancha) o abajo (angosta), solo en su etapa (D32).
        in-out property <string> pregunta;
        in property <bool> etapa-pregunta;
        // IFZ-012: el alto del campo, que fija el asa entre 48 y 600.
        in-out property <length> alto-pregunta: 96px;
        // IFZ-005 y IFZ-023: el panel a la vista.
        in property <string> icono-visible;
        in property <string> cabecera-problema;
        in property <string> selector-texto;
        in property <string> selector-problema;
        in property <string> accion-texto;
        in property <bool> ocupado;
        callback accion-panel();
        callback mover(int);
        // IFZ-024: el diálogo propio, con la página apartada mientras está abierto.
        in-out property <bool> capa-abierta;
        changed capa-abierta => { root.area-cambio(); }
        in property <string> dialogo-titulo;
        in property <string> dialogo-texto;
        in property <bool> dialogo-con-campo;
        in-out property <string> dialogo-campo;
        in property <string> dialogo-casilla-texto;
        in-out property <bool> dialogo-casilla;
        in property <string> dialogo-aceptar-texto;
        callback dialogo-aceptar();
        callback dialogo-cancelar();
        callback paso();
        // D6, D7: los menús. El origen es el botón que lo abrió, en coordenadas de la ventana.
        in property <[Renglon]> menu-items;
        in-out property <bool> menu-abierto;
        changed menu-abierto => { root.area-cambio(); }
        in-out property <length> menu-origen-x;
        in-out property <length> menu-origen-arriba;
        in-out property <length> menu-origen-abajo;
        callback abrir-menu(string);
        callback menu-item(int);
        in property <bool> investigadores-visibles: true;
        callback seleccionar(string);
        out property <length> area-x: pagina.absolute-position.x;
        out property <length> area-y: pagina.absolute-position.y;
        out property <length> area-ancho: pagina.width;
        out property <length> area-alto: pagina.height;
        callback area-cambio();

        // ----- Ajustes (Configuracion.uxml); los textos de nucleo::ajustes los pone la interfaz
        in property <string> titulo-ajustes;
        in property <string> bienvenida;
        in property <int> paso-guia;
        in property <string> texto-paso-guia;
        in property <[Marca]> marcas;
        in property <[string]> nombres;
        in-out property <int> idx-integrador;
        in-out property <int> idx-verificador1;
        in-out property <int> idx-verificador2;
        in-out property <int> idx-redactor;
        in property <[string]> etiquetas-rol;
        in property <string> aviso-reabrir;
        in property <string> mensaje;
        in property <bool> mensaje-problema;
        in property <string> texto-cuentas;
        in property <string> texto-entrar;
        in property <string> texto-ir-a-la-ronda;
        in property <[Cuenta]> cuentas;
        in property <bool> vista-cuenta;
        in property <string> cuenta-titulo;
        in property <string> cuenta-estado;
        out property <length> cuenta-x: cuenta-pagina.absolute-position.x;
        out property <length> cuenta-y: cuenta-pagina.absolute-position.y;
        out property <length> cuenta-ancho: cuenta-pagina.width;
        out property <length> cuenta-alto: cuenta-pagina.height;
        callback cuenta-area-cambio();
        in property <string> etiqueta-tema;
        in property <string> etiqueta-tamano;
        in property <[string]> nombres-tema;
        in property <[string]> nombres-tamano;
        in-out property <int> idx-tema;
        in-out property <int> idx-tamano;
        in property <string> mensaje-apariencia;
        in property <string> que-se-guarda;
        in property <string> ruta-datos;
        in property <string> texto-copiar;
        in property <string> texto-abrir;
        in property <bool> puede-abrir;
        in property <string> como-copiar;
        callback guardar();
        callback entrar(string);
        callback volver();
        callback comprobar();
        callback empezar();
        callback apariencia-elegida();
        callback copiar-ruta();
        callback abrir-carpeta();

        // ----- Historial y Ayuda
        in property <[Anterior]> anteriores;
        callback abrir-informe(string);
        in property <string> version;
        in property <string> licencias;
        callback ver-versiones();

        // D27, A3: el menor entre 600 y el alto que deja al panel su alto mínimo (200: ALTO_MINIMO_PANEL).
        public pure function maximo-del-asa() -> length {
            return max(48px, min(600px, root.alto-pregunta + pagina.height - 200px));
        }

        // D6, D7: el menú se abre junto al botón que lo pidió; la interfaz lo llena y lo abre.
        public function menu-desde(p: Point, alto: length, cual: string) {
            root.menu-origen-x = p.x;
            root.menu-origen-arriba = p.y;
            root.menu-origen-abajo = p.y + alto;
            root.abrir-menu(cual);
        }

        public function aplicar-tema(oscuro: bool) {
            Palette.color-scheme = oscuro ? ColorScheme.dark : ColorScheme.light;
        }

        // Copia la ruta con el portapapeles del sistema, como LineEdit (Ctrl+C).
        public function copiar() {
            ruta.select-all();
            ruta.copy();
            ruta.clear-selection();
        }

        public function ir(s: string) {
            root.seccion = s;
            root.cajon-abierto = false;
            root.seccion-cambiada(s);
        }

        // F4 y F5 (D49): la interfaz elige la región y aquí se le da el foco.
        public function enfocar(region: string) -> bool {
            if (region == "riel") { ir-ronda.focus(); return true; }
            if (region == "guia") { paso-ancha.focus(); return true; }
            if (region == "lista") { lista.focus(); return true; }
            if (region == "abajo") { paso-angosta.focus(); return true; }
            if (region == "formulario") { integrador.focus(); return true; }
            if (region == "barra") { volver.focus(); return true; }
            return false;
        }

        forward-focus: teclas;
        teclas := FocusScope {
            // Teclado de una mano (D49): F1 a F5 llegan a la app esté donde esté el foco. Alt+F4 es del sistema.
            capture-key-pressed(e) => {
                if (e.modifiers.alt) { return reject; }
                if (e.text == Key.F1) { root.tecla("F1"); return accept; }
                if (e.text == Key.F2) { root.tecla("F2"); return accept; }
                if (e.text == Key.F3) { root.tecla("F3"); return accept; }
                if (e.text == Key.F4) { root.tecla("F4"); return accept; }
                if (e.text == Key.F5) { root.tecla("F5"); return accept; }
                reject
            }

            HorizontalLayout {
                // ----- riel (D2, D48): desde 600 dp y fuera del primer arranque
                VerticalLayout {
                    width: root.riel-visible ? 128px : 0px;
                    visible: root.riel-visible;
                    padding: root.riel-visible ? 8px : 0px;
                    spacing: 4px;
                    alignment: start;
                    accessible-role: tab-list;
                    ir-ronda := Boton { text: "Ronda"; primario: root.seccion == "ronda"; clicked => { root.ir("ronda"); } }
                    Boton { text: "Historial"; primario: root.seccion == "historial"; clicked => { root.ir("historial"); } }
                    Boton { text: "Ajustes"; primario: root.seccion == "ajustes"; clicked => { root.ir("ajustes"); } }
                    Boton { text: "Ayuda"; primario: root.seccion == "ayuda"; clicked => { root.ir("ayuda"); } }
                }

                contenido := Rectangle {
                    // ===================== Ronda
                    VerticalLayout {
                        visible: root.seccion == "ronda";
                        padding: 8px;
                        spacing: 8px;
                        // Angosta (D5): barra con el título de la etapa.
                        HorizontalLayout {
                            visible: !root.ancha;
                            height: root.ancha ? 0px : 56px;
                            spacing: 8px;
                            if root.compacta : Boton { text: "Menú"; clicked => { root.cajon-abierto = true; } }
                            Text { text: root.barra-titulo; font-weight: 600; vertical-alignment: center; color: Palette.foreground; horizontal-stretch: 1; }
                            Boton { text: "Más…"; clicked => { root.menu-desde(self.absolute-position, self.height, "angosta"); } }
                        }
                        // Ancha (D4): la guía con las siete etapas y el paso.
                        VerticalLayout {
                            visible: root.ancha;
                            height: root.ancha ? self.preferred-height : 0px;
                            spacing: 8px;
                            HorizontalLayout {
                                spacing: 4px;
                                for nombre[i] in ["1 Pregunta", "2 Investigación", "3 Operación", "4 Integración", "5 Verificación", "6 Redacción", "7 Informe"] : VerticalLayout {
                                    spacing: 2px;
                                    Text { text: nombre; font-weight: i == root.etapa-actual ? 600 : 400; color: Palette.foreground; }
                                    Rectangle { height: 4px; background: i <= root.etapa-actual ? #3A79E0 : Palette.border; }
                                }
                            }
                            if root.etapa-pregunta && root.ancha : CampoPregunta {
                                texto <=> root.pregunta;
                                alto <=> root.alto-pregunta;
                                maximo: root.maximo-del-asa();
                            }
                            HorizontalLayout {
                                spacing: 12px;
                                paso-ancha := Boton { text: root.paso-texto; primario: true; habilitado: root.paso-habilitado && !root.ocupado; clicked => { root.paso(); } }
                                VerticalLayout {
                                    Parrafo { text: root.frase; }
                                    Secundario { text: root.contadores; }
                                    // IFZ-007: el resultado se anuncia sin mover el foco (WCAG 4.1.3).
                                    Parrafo { text: root.resultado; color: root.resultado-problema ? #C42B1C : Palette.foreground; accessible-role: text; accessible-label: self.text; accessible-live-region: polite; }
                                }
                                VerticalLayout { alignment: start; Boton { text: "Ronda…"; clicked => { root.menu-desde(self.absolute-position, self.height, "ronda"); } } }
                            }
                        }
                        HorizontalLayout {
                            spacing: 8px;
                            lista := FocusScope {
                                width: root.ancha ? 280px : 0px;
                                visible: root.ancha;
                                accessible-role: list;
                                ScrollView {
                                    VerticalLayout {
                                        spacing: 2px;
                                        alignment: start;
                                        if root.investigadores-visibles : Text { text: root.titulo-investigadores; font-weight: 600; color: Palette.foreground; }
                                        for f in root.filas : FilaPanel {
                                            visible: f.visible && !f.rol;
                                            height: (f.visible && !f.rol) ? self.min-height : 0px;
                                            fila: f;
                                            activar => { root.seleccionar(f.id); }
                                        }
                                        if root.roles-visibles : Text { text: "Verificación e integración"; font-weight: 600; color: Palette.foreground; }
                                        for f in root.filas : FilaPanel {
                                            visible: f.visible && f.rol;
                                            height: (f.visible && f.rol) ? self.min-height : 0px;
                                            fila: f;
                                            activar => { root.seleccionar(f.id); }
                                        }
                                    }
                                }
                            }
                            VerticalLayout {
                                spacing: 4px;
                                HorizontalLayout {
                                    visible: root.ancha;
                                    height: root.ancha ? max(48px, self.preferred-height) : 0px;
                                    spacing: 8px;
                                    VerticalLayout { alignment: center; Icono { estado: root.icono-visible; } }
                                    VerticalLayout {
                                        alignment: center;
                                        horizontal-stretch: 1;
                                        Text { text: root.cabecera-titulo; font-weight: 600; wrap: word-wrap; color: Palette.foreground; }
                                        if root.cabecera-problema != "" : Text { text: root.cabecera-problema; wrap: word-wrap; color: #C42B1C; }
                                    }
                                    if root.accion-texto != "" : Boton { text: root.accion-texto; habilitado: !root.ocupado; clicked => { root.accion-panel(); } }
                                    Boton { text: "Más…"; clicked => { root.menu-desde(self.absolute-position, self.height, "panel"); } }
                                }
                                // La página del proveedor (vista nativa) va encima de este rectángulo.
                                pagina := Rectangle {
                                    border-width: 1px;
                                    border-color: Palette.border;
                                    changed width => { root.area-cambio(); }
                                    changed height => { root.area-cambio(); }
                                    changed x => { root.area-cambio(); }
                                    changed y => { root.area-cambio(); }
                                }
                            }
                        }
                        // Angosta: abajo, el paso.
                        VerticalLayout {
                            visible: !root.ancha;
                            height: root.ancha ? 0px : self.preferred-height;
                            spacing: 4px;
                            // El selector: el problema del panel va dentro (H7).
                            HorizontalLayout {
                                spacing: 8px;
                                Boton { text: "‹"; etiqueta: "Panel anterior"; clicked => { root.mover(-1); } }
                                VerticalLayout {
                                    alignment: center;
                                    horizontal-stretch: 1;
                                    HorizontalLayout {
                                        spacing: 8px;
                                        VerticalLayout { alignment: center; Icono { estado: root.icono-visible; } }
                                        Text { text: root.selector-texto; font-weight: 600; wrap: word-wrap; color: Palette.foreground; horizontal-stretch: 1; }
                                    }
                                    if root.selector-problema != "" : Text { text: root.selector-problema; wrap: word-wrap; color: #C42B1C; }
                                }
                                Boton { text: "›"; etiqueta: "Panel siguiente"; clicked => { root.mover(1); } }
                            }
                            if root.etapa-pregunta && !root.ancha : CampoPregunta {
                                texto <=> root.pregunta;
                                alto <=> root.alto-pregunta;
                                maximo: root.maximo-del-asa();
                            }
                            paso-angosta := Boton { text: root.paso-texto; primario: true; habilitado: root.paso-habilitado && !root.ocupado; horizontal-stretch: 1; clicked => { root.paso(); } }
                            Parrafo { text: root.resultado; color: root.resultado-problema ? #C42B1C : Palette.foreground; accessible-role: text; accessible-label: self.text; accessible-live-region: polite; }
                            Parrafo { text: root.frase; }
                            HorizontalLayout {
                                spacing: 8px;
                                Secundario { text: root.contadores-angosta; horizontal-stretch: 1; }
                                Boton { text: "Ver todos"; clicked => { root.menu-desde(self.absolute-position, self.height, "paneles"); } }
                            }
                        }
                    }

                    // ===================== Historial (D12)
                    VerticalLayout {
                        visible: root.seccion == "historial";
                        padding: 8px;
                        if root.compacta : HorizontalLayout {
                            spacing: 8px;
                            Boton { text: "Menú"; clicked => { root.cajon-abierto = true; } }
                            Text { text: "Rondas anteriores"; font-weight: 600; vertical-alignment: center; color: Palette.foreground; }
                        }
                        ScrollView {
                            VerticalLayout {
                                padding: 16px;
                                spacing: 12px;
                                alignment: start;
                                TituloBloque { text: "Rondas anteriores"; font-size: 1.4rem; }
                                Secundario { text: "Las rondas de este aparato, la más nueva primero."; }
                                if root.anteriores.length == 0 : Parrafo { text: "Todavía no hay rondas en este aparato."; }
                                for r in root.anteriores : HorizontalLayout {
                                    spacing: 12px;
                                    VerticalLayout {
                                        Parrafo { text: r.pregunta; font-weight: 600; }
                                        Secundario { text: r.detalle; }
                                    }
                                    if r.carpeta != "" : Boton { text: "Abrir el informe"; clicked => { root.abrir-informe(r.carpeta); } }
                                }
                            }
                        }
                    }

                    // ===================== Ajustes y primer arranque (Configuracion.uxml)
                    VerticalLayout {
                        visible: root.seccion == "ajustes" && !root.vista-cuenta;
                        padding: 8px;
                        if root.compacta && !root.primer-arranque : HorizontalLayout {
                            spacing: 8px;
                            Boton { text: "Menú"; clicked => { root.cajon-abierto = true; } }
                            Text { text: "Ajustes"; font-weight: 600; vertical-alignment: center; color: Palette.foreground; }
                        }
                        ScrollView {
                            VerticalLayout {
                                padding: 16px;
                                spacing: 12px;
                                alignment: start;
                                TituloBloque { text: root.titulo-ajustes; font-size: 1.4rem; }
                                if root.primer-arranque : Parrafo { text: root.bienvenida; }
                                if root.primer-arranque : Secundario { text: root.texto-paso-guia; }

                                // Consejo y roles (D11)
                                VerticalLayout {
                                    visible: root.paso-guia != 2;
                                    height: root.paso-guia != 2 ? self.preferred-height : 0px;
                                    spacing: 8px;
                                    TituloBloque { text: "Tu consejo"; }
                                    Parrafo { text: "Marca los proveedores que se cargan al abrir la app."; }
                                    for m in root.marcas : Marcar { text: m.nombre; checked <=> m.marcado; }
                                    Text { text: "Roles"; font-weight: 600; color: Palette.foreground; }
                                    Secundario { text: "Los proveedores sin rol investigan y operan."; }
                                    integrador := Elegir { etiqueta: root.etiquetas-rol[0]; opciones: root.nombres; indice <=> root.idx-integrador; }
                                    Elegir { etiqueta: root.etiquetas-rol[1]; opciones: root.nombres; indice <=> root.idx-verificador1; }
                                    Elegir { etiqueta: root.etiquetas-rol[2]; opciones: root.nombres; indice <=> root.idx-verificador2; }
                                    Elegir { etiqueta: root.etiquetas-rol[3]; opciones: root.nombres; indice <=> root.idx-redactor; }
                                    if !root.primer-arranque : Secundario { text: root.aviso-reabrir; }
                                    HorizontalLayout { alignment: start; Boton { text: "Guardar"; primario: true; clicked => { root.guardar(); } } }
                                    Parrafo {
                                        text: root.mensaje;
                                        color: root.mensaje-problema ? #C42B1C : Palette.foreground;
                                    }
                                }

                                // Cuentas (D10): la sesión se deduce de la página, sin leer cookies.
                                VerticalLayout {
                                    visible: root.paso-guia != 1;
                                    height: root.paso-guia != 1 ? self.preferred-height : 0px;
                                    spacing: 8px;
                                    TituloBloque { text: "Tus cuentas"; }
                                    Parrafo { text: root.texto-cuentas; }
                                    for c in root.cuentas : HorizontalLayout {
                                        spacing: 12px;
                                        VerticalLayout {
                                            Text { text: c.nombre; font-weight: 600; color: Palette.foreground; }
                                            Secundario { text: c.estado; }
                                        }
                                        Boton { text: root.texto-entrar; clicked => { root.entrar(c.id); } }
                                    }
                                    if root.primer-arranque : HorizontalLayout {
                                        alignment: start;
                                        Boton { text: root.texto-ir-a-la-ronda; primario: true; clicked => { root.empezar(); } }
                                    }
                                }

                                // Apariencia (D17): se guarda al elegir y se aplica al reabrir (D25).
                                if !root.primer-arranque : VerticalLayout {
                                    spacing: 8px;
                                    TituloBloque { text: "Apariencia"; }
                                    Elegir { etiqueta: root.etiqueta-tema; opciones: root.nombres-tema; indice <=> root.idx-tema; changed indice => { root.apariencia-elegida(); } }
                                    Elegir { etiqueta: root.etiqueta-tamano; opciones: root.nombres-tamano; indice <=> root.idx-tamano; changed indice => { root.apariencia-elegida(); } }
                                    Secundario { text: "El del sistema sigue lo que elegiste en Windows o en Android."; }
                                    Parrafo { text: root.mensaje-apariencia; }
                                }

                                // Datos (D15)
                                VerticalLayout {
                                    visible: !root.primer-arranque;
                                    height: !root.primer-arranque ? self.preferred-height : 0px;
                                    spacing: 8px;
                                    TituloBloque { text: "Tus datos"; }
                                    Parrafo { text: root.que-se-guarda; }
                                    Rectangle {
                                        min-height: 48px;
                                        ruta := LineEdit { width: parent.width; height: parent.height; text: root.ruta-datos; read-only: true; accessible-label: "Carpeta de datos"; }
                                        Anillo { foco: ruta.has-focus; }
                                    }
                                    HorizontalLayout {
                                        spacing: 8px;
                                        alignment: start;
                                        Boton { text: root.texto-copiar; clicked => { root.copiar-ruta(); } }
                                        if root.puede-abrir : Boton { text: root.texto-abrir; clicked => { root.abrir-carpeta(); } }
                                    }
                                    Secundario { text: root.como-copiar; }
                                }
                            }
                        }
                    }

                    // Entrar a una cuenta (PAN-007): la página del proveedor ocupa el resto.
                    VerticalLayout {
                        visible: root.seccion == "ajustes" && root.vista-cuenta;
                        padding: 8px;
                        spacing: 8px;
                        HorizontalLayout {
                            spacing: 8px;
                            volver := Boton { text: "‹ Volver"; clicked => { root.volver(); } }
                            VerticalLayout {
                                Text { text: root.cuenta-titulo; font-weight: 600; color: Palette.foreground; }
                                Secundario { text: root.cuenta-estado; }
                            }
                            Boton { text: "Comprobar"; clicked => { root.comprobar(); } }
                        }
                        cuenta-pagina := Rectangle {
                            border-width: 1px;
                            border-color: Palette.border;
                            changed width => { root.cuenta-area-cambio(); }
                            changed height => { root.cuenta-area-cambio(); }
                            changed x => { root.cuenta-area-cambio(); }
                            changed y => { root.cuenta-area-cambio(); }
                        }
                    }

                    // ===================== Ayuda y Acerca de (D14, D16)
                    VerticalLayout {
                        visible: root.seccion == "ayuda";
                        padding: 8px;
                        if root.compacta : HorizontalLayout {
                            spacing: 8px;
                            Boton { text: "Menú"; clicked => { root.cajon-abierto = true; } }
                            Text { text: "Ayuda"; font-weight: 600; vertical-alignment: center; color: Palette.foreground; }
                        }
                        ScrollView {
                            VerticalLayout {
                                padding: 16px;
                                spacing: 10px;
                                alignment: start;
                                TituloBloque { text: "Ayuda"; font-size: 1.4rem; }
                                TituloBloque { text: "Cómo funciona una ronda"; }
                                Parrafo { text: "Haces una pregunta a varios proveedores de IA a la vez, cada uno en su página y con tu cuenta. Después cada proveedor revisa a ciegas lo que respondieron los demás y anota en qué coinciden y en qué no. Un integrador junta esos hallazgos en un informe, dos verificadores revisan por separado las fuentes en la web y un redactor escribe la respuesta final."; }
                                Parrafo { text: "La app pega, captura y arma el informe. Enviar en cada página lo haces tú: así eliges qué activar en cada proveedor y nada sale sin que lo revises."; }
                                TituloBloque { text: "Las siete etapas"; }
                                Parrafo { text: "1. Pregunta: escribes la pregunta y la app la pega en cada página."; }
                                Parrafo { text: "2. Investigación: en cada página activas la búsqueda web o la investigación profunda y envías; cuando terminan, la app captura las respuestas."; }
                                Parrafo { text: "3. Operación: la app abre una conversación nueva en cada página y le pega las respuestas de los demás, sin decir de quién son. Tú envías y la app captura lo que cada uno encontró."; }
                                Parrafo { text: "4. Integración: el integrador recibe la tabla de hallazgos y escribe el informe."; }
                                Parrafo { text: "5. Verificación: dos verificadores revisan por separado en la web las fuentes de lo que conviene rescatar; el informe muestra las dos verificaciones para compararlas."; }
                                Parrafo { text: "6. Redacción: el redactor recibe todo el material en un archivo adjunto y escribe la respuesta final."; }
                                Parrafo { text: "7. Informe: la app comprueba las direcciones web que citaron los verificadores y arma una carpeta con el informe en Markdown y PDF y las respuestas de cada proveedor."; }
                                TituloBloque { text: "Palabras de la app"; }
                                Parrafo { text: "Proveedores: los servicios de IA de tu consejo (ChatGPT, Gemini y los demás). Los que no tienen un rol investigan y después evalúan las respuestas de los otros."; }
                                Parrafo { text: "Roles: integrador, dos verificadores y redactor. Cada uno trabaja en su etapa; el redactor puede ser el mismo integrador."; }
                                TituloBloque { text: "Atajos de teclado"; }
                                Parrafo { text: "F1 y F2: el panel anterior y el siguiente. Ctrl+Mayús+Tab y Ctrl+Tab hacen lo mismo."; }
                                Parrafo { text: "F3: el paso siguiente (el botón principal)."; }
                                Parrafo { text: "F4 y F5: pasar a la parte siguiente o a la anterior de la pantalla: la guía, la lista de paneles, el panel y la página del proveedor."; }
                                Parrafo { text: "Funcionan también con el foco dentro de la página de un proveedor: la tecla vuelve a la app."; }
                                Secundario { text: "Ninguno usa Enter ni Ctrl+Enter, que en las páginas envían."; }
                                TituloBloque { text: "Acerca de ChatCouncil"; }
                                Parrafo { text: root.version; }
                                Parrafo { text: "Al abrirse, la app busca una versión nueva y te la ofrece arriba. Las versiones publicadas están en la página del proyecto."; }
                                HorizontalLayout { alignment: start; Boton { text: "Ver las versiones publicadas"; clicked => { root.ver-versiones(); } } }
                                Text { text: "Licencias de terceros"; font-weight: 600; color: Palette.foreground; }
                                // La licencia libre de Slint pide mostrar este aviso (Royalty-free 2.0).
                                HorizontalLayout { alignment: start; AboutSlint { } }
                                Secundario { text: root.licencias; }
                            }
                        }
                    }
                }
            }

            // Cajón modal de la clase compacta (D3): las mismas secciones que el riel.
            if root.cajon-abierto : Rectangle {
                background: #00000080;
                TouchArea { clicked => { root.cajon-abierto = false; } }
                Rectangle {
                    x: 0;
                    width: min(300px, parent.width * 0.8);
                    background: Palette.background;
                    VerticalLayout {
                        padding: 12px;
                        spacing: 4px;
                        alignment: start;
                        Boton { text: "Ronda"; clicked => { root.ir("ronda"); } }
                        Boton { text: "Historial"; clicked => { root.ir("historial"); } }
                        Boton { text: "Ajustes"; clicked => { root.ir("ajustes"); } }
                        Boton { text: "Ayuda"; clicked => { root.ir("ayuda"); } }
                    }
                }
            }

            // D6, D7: el menú. Nunca fuera de la ventana: se abre hacia arriba si abajo falta lugar; en la clase
            // compacta, como hoja abajo. Lo deshabilitado dice por qué debajo (Unity: AbrirMenu).
            if root.menu-abierto : Rectangle {
                property <bool> hoja: root.compacta;
                property <length> abajo: root.height - root.menu-origen-abajo - 12px;
                property <length> arriba: root.menu-origen-arriba - 12px;
                property <bool> hacia-arriba: !self.hoja && self.abajo < 240px && self.arriba > self.abajo;
                property <length> maximo: self.hoja ? root.height * 0.8 : self.hacia-arriba ? self.arriba : self.abajo;
                background: #00000040;
                TouchArea { clicked => { root.menu-abierto = false; } }
                Rectangle {
                    width: parent.hoja ? root.width : min(340px, root.width - 16px);
                    x: parent.hoja ? 0px : max(8px, min(root.menu-origen-x, root.width - 348px));
                    height: min(menu-lista.preferred-height + 2px, max(48px, parent.maximo));
                    y: parent.hoja ? root.height - self.height : parent.hacia-arriba ? root.menu-origen-arriba - 4px - self.height : root.menu-origen-abajo + 4px;
                    background: Palette.background;
                    border-radius: 8px;
                    border-width: 1px;
                    border-color: Palette.border;
                    accessible-role: list;
                    TouchArea { }
                    FocusScope {
                        init => { self.focus(); }
                        key-pressed(e) => {
                            if (e.text == Key.Escape) { root.menu-abierto = false; return accept; }
                            reject
                        }
                        ScrollView {
                            menu-lista := VerticalLayout {
                                padding: 8px;
                                spacing: 2px;
                                for r[i] in root.menu-items : VerticalLayout {
                                    spacing: 2px;
                                    if r.grupo != "" : Text { text: r.grupo; font-weight: 600; color: Palette.foreground; }
                                    Boton { text: r.texto; habilitado: r.motivo == ""; clicked => { root.menu-abierto = false; root.menu-item(i); } }
                                    if r.motivo != "" : Secundario { text: r.motivo; }
                                }
                            }
                        }
                    }
                }
            }

            // IFZ-024: el diálogo de la ronda. «Cancelar» o tocar el fondo lo cierran sin hacer nada.
            if root.capa-abierta : Rectangle {
                background: #00000080;
                // Como AbrirDialogo: el foco va al campo si lo hay; si no, al botón de aceptar.
                init => {
                    if (root.dialogo-con-campo) { dialogo-campo-edit.focus(); } else { dialogo-aceptar-boton.focus(); }
                }
                TouchArea { clicked => { root.dialogo-cancelar(); } }
                Rectangle {
                    width: min(560px, parent.width - 32px);
                    height: min(self.preferred-height, parent.height - 32px);
                    background: Palette.background;
                    border-radius: 8px;
                    accessible-role: groupbox;
                    accessible-label: root.dialogo-titulo;
                    TouchArea { }
                    VerticalLayout {
                        padding: 16px;
                        spacing: 12px;
                        TituloBloque { text: root.dialogo-titulo; }
                        Parrafo { text: root.dialogo-texto; }
                        Rectangle {
                            visible: root.dialogo-con-campo;
                            height: root.dialogo-con-campo ? 96px : 0px;
                            dialogo-campo-edit := TextEdit {
                                width: parent.width;
                                height: parent.height;
                                text <=> root.dialogo-campo;
                                wrap: word-wrap;
                                accessible-label: root.dialogo-titulo;
                            }
                            Anillo { foco: dialogo-campo-edit.has-focus; }
                        }
                        if root.dialogo-casilla-texto != "" : Marcar { text: root.dialogo-casilla-texto; checked <=> root.dialogo-casilla; }
                        HorizontalLayout {
                            spacing: 8px;
                            alignment: start;
                            dialogo-aceptar-boton := Boton { text: root.dialogo-aceptar-texto; primario: true; clicked => { root.dialogo-aceptar(); } }
                            Boton { text: "Cancelar"; clicked => { root.dialogo-cancelar(); } }
                        }
                    }
                }
            }
        }
    }
}
