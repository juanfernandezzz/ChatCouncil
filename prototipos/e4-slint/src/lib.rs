// La interfaz, sin wry: es la parte que se compila para Android.
slint::slint! {
    // shortcut: tamaño fijo, sin reacomodar los webviews al redimensionar; el producto los movería con la ventana.
    // Misma geometría que E3: el runner de Flutter pide 1280x720 con marco (área cliente 1264x681) y el GridView da 5 columnas de aspecto 0,75.
    export component Consejo inherits Window {
        title: "E4 Slint (prototipo)";
        width: 1264px;
        height: 681px;
        out property <length> panel-ancho: 252.8px;
        out property <length> panel-alto: 337.07px;
        for i in 10: Rectangle {
            x: mod(i, 5) * root.panel-ancho;
            y: floor(i / 5) * root.panel-alto;
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
