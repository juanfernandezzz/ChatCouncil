import { defineConfig } from "wxt";

// Referencia: https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: ".",
  manifest: {
    name: "ChatCouncil Bridge",
    description:
      "Puente BYOA/BYOK para ChatCouncil: entrega sesiones abiertas de tus LLMs a la SPA y actua como proxy de red local para resolver CORS en llamadas BYOK.",
    // Q8: autodistribucion (zip + load unpacked) con ID estable via `key`,
    // en vez de Chrome Web Store para v1. La clave de abajo es una clave
    // de DESARROLLO generada para este scaffold (par RSA-2048 descartable,
    // la privada no se incluye en el repo) — asi `load unpacked` funciona
    // de entrada y el ID coincide con VITE_EXTENSION_ID en apps/web/.env.example.
    // Antes de distribuir de verdad, generar una propia:
    //   openssl genpkey -algorithm RSA -out key.pem -pkeyopt rsa_keygen_bits:2048
    //   openssl rsa -pubout -in key.pem -outform DER | openssl base64 -A
    // y recalcular el ID resultante (formula y script en docs/DEPLOY.md).
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAiRxXsR/h/Hoq4TADYzaYLDg3XNw2RroVpN89+FKA6evsLHaTAyiQfZvnEJS7yDqCTCcHVUz+csoCFq5SOLqytF8qeEV7AMdCMX8px8CAQptCQbg+o9vo05SRF+47hY4l1mxaWbRYCLzuz2IBK6UvNPO0fAJRYY3XD7uFR6TEERjOeC5SSEuB2SgJTqeT1Gya6ozUaI8Qa1DdZ86iD4lQo8K7lOHXBhvWdqng4EHZTORKdtfCle7WJMoyBNjRdTG0CCeI8+gNGWyDFLDYBDt3xW7mwzsk/Mw5wz12UcDqQlM+9gNiJFVSrqlB2u9TpjQPsvVwRT4V/RwLOrj2vxPWvwIDAQAB",
    // Minimo necesario para Fase 0/1 (custodia de keys + grupo de pestañas
    // gestionado, Q2/Q10). host_permissions por proveedor se agregan recien
    // en Fase 2 (BYOK) y Fase 3 (BYOA), cuando se sepa que dominios tocar
    // — pedir permisos de mas antes de necesitarlos solo asusta al usuario
    // en el prompt de instalacion sin beneficio real.
    permissions: ["storage", "tabs", "tabGroups"],
    // Q7/Q9: unico transporte SPA -> extension. Cada origen que deba poder
    // conectar tiene que estar listado explicitamente aca.
    externally_connectable: {
      matches: [
        "https://chatcouncil.netlify.app/*",
        "http://localhost:5173/*",
      ],
    },
  },
});
