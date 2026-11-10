# Pendientes de la segunda pasada (Android, macOS, Linux, iOS)

Se agrega; no se reescribe lo anterior.

- 2026-11-10 · PART-003 · Registro solo agregable. El rechazo a truncar o reescribir el registro se probó solo en Windows, donde el handle de OpenOptions::append responde «Acceso denegado». En Linux y macOS, O_APPEND permite ftruncate, y en Android e iOS no se ha medido. Antes de embarcar en cada plataforma: una prueba que demuestre en esa plataforma que el registro solo se agrega, sea porque el sistema lo impide o porque el núcleo no expone ninguna otra vía de escritura, con su caso en rojo y en verde, en el CI de esa plataforma.
