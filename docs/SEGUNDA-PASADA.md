# Pendientes de la segunda pasada (Android, macOS, Linux, iOS)

Se agrega; no se reescribe lo anterior.

- 2026-11-10 · PART-003 · Registro solo agregable. El rechazo a truncar o reescribir el registro se probó solo en Windows, donde el handle de OpenOptions::append responde «Acceso denegado». En Linux y macOS, O_APPEND permite ftruncate, y en Android e iOS no se ha medido. Antes de embarcar en cada plataforma: una prueba que demuestre en esa plataforma que el registro solo se agrega, sea porque el sistema lo impide o porque el núcleo no expone ninguna otra vía de escritura, con su caso en rojo y en verde, en el CI de esa plataforma.
- 2026-11-10 · revisión PART-003 · La prueba de importar con el origen bloqueado usa share_mode 0 y corre solo en Windows (cfg(windows)). En cada plataforma nueva: el equivalente de bloqueo de esa plataforma, o una prueba alternativa que demuestre que importar nunca escribe en el origen, en el CI de esa plataforma.
