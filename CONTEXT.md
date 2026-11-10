# ChatCouncil · glosario

Términos del dominio, con el sentido que tienen en el código y en la interfaz.

- **Consejo**: el conjunto de modelos de IA que trabajan en una ronda. En la interfaz se dice «consejo». _Evitar_: council.
- **Proveedor**: un servicio de IA cuya página web real se usa con la cuenta de Juan (por ejemplo ChatGPT o Gemini). Hay diez conocidos.
- **Panel**: la página web real de un proveedor dentro de la app, con la sesión de Juan.
- **Perfil**: donde se guardan las sesiones de los paneles. Cada app tiene el suyo.
- **Ronda**: una investigación completa sobre una pregunta, desde la pregunta hasta el informe.
- **Etapa**: cada paso de una ronda.
- **Investigador**: proveedor que responde la pregunta. Son siete.
- **Operación**: etapa en que los investigadores leen las respuestas anonimizadas de todos y registran hallazgos.
- **Hallazgo**: lo que registra un investigador durante la operación, con su categoría y su código H##.
- **Integrador**: proveedor que lee la tabla de hallazgos y escribe la lectura de conjunto. Es uno.
- **Verificador**: proveedor que comprueba las fuentes de lo que conviene rescatar. Son dos.
- **Redactor**: proveedor que escribe la respuesta a la pregunta. Es uno.
- **Esquema 7-1-2-1**: siete investigadores, un integrador, dos verificadores y un redactor.
- **Envío**: mandar un texto en un panel. Siempre lo hace Juan, a mano.
- **Captura**: leer la respuesta de un panel que terminó. Juan decide cuándo.
- **Registro**: historial append-only de todo lo que pasa en las rondas. Nada se reescribe.
- **Informe**: el documento final de una ronda, en .md y PDF Carta, con cada afirmación rastreable a su hallazgo.
- **Línea base**: la medición de ChatCouncil-Unity contra la que se compara el rendimiento de la app nueva.
