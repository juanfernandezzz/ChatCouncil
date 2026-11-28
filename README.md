# ChatCouncil

ChatCouncil es un consejo de modelos de IA para investigar. Trabaja en las páginas web de cada proveedor, con tus propias cuentas, y arma un informe trazable. No usa claves de API.

## Cómo funciona una ronda

Cada ronda sigue el esquema 7-1-2-1:

1. Siete investigadores responden la misma pregunta, cada uno en su página.
2. Cada uno compara las respuestas de los otros seis, sin saber de quién son.
3. Un integrador junta esas comparaciones.
4. Dos verificadores contrastan lo más importante con fuentes externas.
5. Un redactor escribe la respuesta final.

La app pega en los paneles. Tú envías con «Enviar a todos», confirmas con «Sí» y decides cuándo capturar.

## Antes de usarla: la misma skill en los siete investigadores

La ronda compara respuestas, y eso solo tiene sentido si los siete investigadores (ChatGPT, Gemini, Claude, Grok, Mistral, Kimi y Perplexity) trabajan con el mismo método. Por eso la skill es obligatoria:

1. Instala la misma skill de investigación en las siete cuentas. ChatCouncil se usa con una skill llamada research-protocol. Cada proveedor la instala a su manera, y en algunos hace falta un plan de pago.
2. Pon las mismas instrucciones de sistema en el campo de instrucciones personalizadas de las siete cuentas, en menos de 1.500 caracteres: es el límite de ChatGPT y de Perplexity.
3. En cada ronda, empieza el mensaje de cada investigador con la invocación de la skill: `@research-protocol` en ChatGPT y en Gemini, y `/research-protocol` en los otros cinco. La app reconoce esa invocación y no la cuenta como un cambio en la pregunta.

## Instalación

Por ahora, solo Windows. Descarga ChatCouncil-instalador.exe del Release `chatcouncil-v1` de este repositorio y ejecútalo. Para actualizar: Ayuda → «Acerca de ChatCouncil» → «Buscar actualizaciones».
