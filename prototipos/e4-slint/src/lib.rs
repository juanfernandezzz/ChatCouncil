// La interfaz, sin wry: es la parte que se compila para Android.
slint::slint! {
    // Misma geometría inicial que E3: el runner de Flutter pide 1280x720 con marco (área cliente 1264x681) y el GridView da 5 columnas.
    // La ventana se puede redimensionar; Rust mueve los webviews con «reacomodar».
    export component Consejo inherits Window {
        title: "E4 Slint (prototipo)";
        preferred-width: 1264px;
        preferred-height: 681px;
        min-width: 400px;
        min-height: 300px;
        in property <bool> diez: true;
        in property <bool> barra: false;
        in-out property <string> texto-slint;
        out property <bool> campo-con-foco: campo.has-focus;
        out property <length> alto-barra: barra ? 40px : 0px;
        out property <length> panel-ancho: diez ? root.width / 5 : root.width;
        out property <length> panel-alto: diez ? (root.height - root.alto-barra) / 2 : root.height - root.alto-barra;
        callback reacomodar();
        callback campo-enfocado();
        changed width => { root.reacomodar(); }
        changed height => { root.reacomodar(); }

        // Barra de la interfaz Slint para la prueba de foco y teclado.
        Rectangle {
            x: 0; y: 0;
            width: root.width;
            height: root.alto-barra;
            visible: root.barra;
            background: #e8e8e8;
            Text { x: 8px; height: parent.height; vertical-alignment: center; text: "Slint:"; }
            Rectangle {
                x: 60px; y: 6px; width: 300px; height: 28px;
                background: white;
                border-width: 1px;
                border-color: gray;
                campo := TextInput {
                    x: 4px;
                    width: parent.width - 8px;
                    height: parent.height;
                    vertical-alignment: center;
                    text <=> root.texto-slint;
                    changed has-focus => { if (self.has-focus) { root.campo-enfocado(); } }
                }
            }
        }
        for i in (root.diez ? 10 : 1): Rectangle {
            x: mod(i, 5) * root.panel-ancho;
            y: root.alto-barra + floor(i / 5) * root.panel-alto;
            width: root.panel-ancho;
            height: root.panel-alto;
            border-width: 1px;
            border-color: gray;
        }
    }
}

// https://docs.rs/slint/1.18.1/slint/android/index.html
#[cfg(target_os = "android")]
#[unsafe(no_mangle)]
fn android_main(app: slint::android::AndroidApp) {
    use slint::ComponentHandle;
    slint::android::init(app).unwrap();
    Consejo::new().unwrap().run().unwrap();
}
