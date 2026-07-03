# Deploy — de este zip a una URL pública en Netlify

Esta guía asume que ya tenés el zip del scaffold y el repositorio
`juanfernandezzz/ChatCouncil` vacío en GitHub. Tres pasos: push del
código, conexión a Netlify, y (antes de cualquier distribución real de
la extensión) regenerar la clave de desarrollo.

## 1. Push a GitHub vía Claude Code

No lo hago yo directamente: esta sesión de Claude no tiene tus
credenciales de git. Claude Code (la app de escritorio o CLI, con
acceso a tu filesystem y a `git`) sí las tiene. El prompt para pegarle
está en el mensaje de chat, no en este archivo — abrí Claude Code,
apuntalo a una carpeta vacía, pegá ese prompt, y decile dónde quedó el
zip descargado.

Validación rápida post-push, desde cualquier terminal:

```bash
git clone https://github.com/juanfernandezzz/ChatCouncil.git
cd ChatCouncil
pnpm install
pnpm -r run typecheck   # deberia terminar en 0 errores, igual que en el sandbox de verificacion
pnpm build:web
```

## 2. Conectar Netlify

1. **New site from Git** → elegir el repo `ChatCouncil`.
2. Netlify va a intentar auto-detectar el monorepo. **No dejes que
   fije un "Base directory" en `apps/web`** — si lo hace, corregilo a
   vacío/raíz. Motivo verificado (ver `docs/BLUEPRINT.md`, ledger): con
   la base en `apps/web`, Netlify no encuentra `pnpm-lock.yaml` (que
   vive en la raíz del monorepo), cae a `npm install`, y el protocolo
   `workspace:*` de los `package.json` internos rompe la instalación
   con `EUNSUPPORTEDPROTOCOL`.
3. El repo ya trae `netlify.toml` en la raíz con todo esto resuelto:
   ```toml
   [build]
     command = "pnpm install --frozen-lockfile && pnpm --filter @chatcouncil/web build"
     publish = "apps/web/dist"
   ```
   Si la UI de Netlify pre-llena algo distinto en "Build settings", lo
   que manda es el `netlify.toml` del repo — podés dejar los campos de
   la UI vacíos.
4. **Variables de entorno** (Site settings → Environment variables) —
   opcional en esta primera versión porque el código ya trae defaults
   de desarrollo embebidos, pero declarar explícitamente para producción:
   - `VITE_EXTENSION_ID` → el ID derivado de tu propia clave (paso 3),
     no el de desarrollo.
   - `VITE_EXTENSION_DOWNLOAD_URL` → tu release real de GitHub.
5. **Deploy site.** El primer build tarda un poco más (cache frío de
   pnpm); los siguientes son incrementales.

## 3. Obtener la URL `chatcouncil.netlify.app`

Netlify asigna un nombre aleatorio al crear el site (algo como
`quirky-elephant-a1b2c3.netlify.app`). Para el nombre elegido:

**Site settings → General → Site details → Change site name** → escribir
`chatcouncil` (o el que prefieras; el sufijo `.netlify.app` es
automático y el nombre debe estar libre globalmente — si `chatcouncil`
ya está tomado por otra cuenta, Netlify te lo va a decir ahí mismo y
hay que elegir una variante).

Con cada push a `main`, Netlify redeploya solo — "ver los cambios en
vivo" es automático desde este punto, sin pasos manuales adicionales.

## 4. Regenerar la clave de la extensión (antes de distribuir de verdad)

El scaffold trae una clave RSA de **desarrollo** ya generada y
verificada (coincide con `VITE_EXTENSION_ID` por defecto — ver ledger
en `docs/BLUEPRINT.md`, §0.1) para que todo funcione en local sin pasos
extra. Antes de compartir el `.zip` de la extensión con nadie fuera de
tu propia máquina, generá tu propia clave:

```bash
openssl genpkey -algorithm RSA -out extension-key.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in extension-key.pem -outform DER | openssl base64 -A
```

Ese output va en `apps/extension/wxt.config.ts`, campo `manifest.key`.
Para saber qué `VITE_EXTENSION_ID` le corresponde (Chrome deriva el ID
del hash SHA-256 de la clave pública, no es arbitrario), corré esto con
Node después de compilar la extensión una vez con la clave nueva:

```bash
node -e "
const crypto = require('crypto');
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('apps/extension/.output/chrome-mv3/manifest.json', 'utf8'));
const der = Buffer.from(manifest.key, 'base64');
const hash = crypto.createHash('sha256').update(der).digest();
const first16 = hash.subarray(0, 16);
let id = '';
for (const byte of first16) {
  id += String.fromCharCode(97 + ((byte >> 4) & 0x0f));
  id += String.fromCharCode(97 + (byte & 0x0f));
}
console.log(id);
"
```

Guardá `extension-key.pem` (la privada) fuera del repo — no hace falta
para "cargar descomprimida" ni para el build, solo para volver a firmar
si algún día publicás en Chrome Web Store.

## 5. Cargar la extensión en Chrome (desarrollo)

1. `pnpm build:ext` (o `pnpm dev:ext` para modo watch).
2. `chrome://extensions` → activar "Modo de desarrollador".
3. "Cargar descomprimida" → seleccionar `apps/extension/.output/chrome-mv3`.
4. Con la clave de desarrollo tal cual viene en el repo, el ID debería
   quedar en `bjplhepllcbcpnhnpnpmcecddbjmlpch` — si coincide, el
   badge de la SPA (`pnpm dev`, `localhost:5173`) debería pasar de
   "Extensión no instalada" a "Extensión conectada" sin tocar nada más.
