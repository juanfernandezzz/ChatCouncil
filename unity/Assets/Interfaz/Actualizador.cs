using System;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using ChatCouncil.Motor;
using UnityEngine;
using UnityEngine.UIElements;

namespace ChatCouncil.Interfaz
{
    /// <summary>
    /// Actualización desde el Release. Al abrir, busca version.txt; si hay una versión mayor, un aviso arriba la ofrece (nunca
    /// instala sola: podría haber una ronda en curso). Windows descarga el instalador con barra de avance y lo corre con
    /// /SILENT: sin preguntas, con la ventana de avance de Inno; la app se cierra y el instalador la vuelve a abrir.
    /// Android no instala sin que la persona lo confirme: se abre la descarga del .apk y se toca una vez.
    /// </summary>
    public sealed class Actualizador
    {
        const string Release = "https://github.com/juanfernandezzz/ChatCouncil/releases/download/chatcouncil-unity-v1/";
        static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };

        readonly VisualElement aviso, barra, relleno;
        readonly Label texto;
        readonly Button boton;
        string nueva;

        public Actualizador(VisualElement raiz)
        {
            aviso = raiz.Q("aviso-version");
            texto = raiz.Q<Label>("aviso-texto");
            barra = raiz.Q("aviso-barra");
            relleno = raiz.Q("aviso-relleno");
            boton = raiz.Q<Button>("aviso-boton");
            boton.clicked += Instalar;
        }

        public async Task Buscar()
        {
            try
            {
                using (var tope = new CancellationTokenSource(TimeSpan.FromSeconds(15)))
                using (var r = await Http.GetAsync(Release + "version.txt", tope.Token))
                {
                    if (!r.IsSuccessStatusCode) return;
                    nueva = (await r.Content.ReadAsStringAsync()).Trim();
                }
            }
            catch (Exception e) when (e is HttpRequestException || e is OperationCanceledException)
            {
                return; // sin red o sin Release: no se molesta a nadie
            }
            if (!Actualizacion.EsNueva(Application.version, nueva)) return;
            Mostrar($"Hay una versión nueva ({nueva}); tienes la {Application.version}. La app se cierra y se vuelve a abrir; tus rondas se conservan.", "Actualizar");
        }

        void Mostrar(string mensaje, string accion)
        {
            aviso.style.display = DisplayStyle.Flex;
            texto.text = mensaje;
            boton.text = accion;
            boton.style.display = DisplayStyle.Flex;
            barra.style.display = DisplayStyle.None;
        }

        async void Instalar()
        {
            if (Application.platform == RuntimePlatform.Android)
            {
                Application.OpenURL(Release + "ChatCouncil.apk");
                return;
            }
            boton.style.display = DisplayStyle.None;
            barra.style.display = DisplayStyle.Flex;
            var instalador = Path.Combine(Path.GetTempPath(), "ChatCouncil-instalador.exe");
            try
            {
                using (var r = await Http.GetAsync(Release + "ChatCouncil-instalador.exe", HttpCompletionOption.ResponseHeadersRead))
                {
                    r.EnsureSuccessStatusCode();
                    var total = r.Content.Headers.ContentLength ?? 0;
                    long leido = 0;
                    int pct = -1;
                    using (var origen = await r.Content.ReadAsStreamAsync())
                    using (var archivo = File.Create(instalador))
                    {
                        var bloque = new byte[81920];
                        int n;
                        while ((n = await origen.ReadAsync(bloque, 0, bloque.Length)) > 0)
                        {
                            await archivo.WriteAsync(bloque, 0, n);
                            leido += n;
                            var p = total > 0 ? (int)(leido * 100 / total) : 0;
                            if (p == pct) continue;
                            pct = p;
                            relleno.style.width = Length.Percent(p);
                            texto.text = $"Descargando la versión {nueva}… {p} %";
                        }
                    }
                    if (total > 0 && leido != total) throw new IOException("descarga incompleta");
                }
            }
            catch (Exception e) when (e is HttpRequestException || e is IOException || e is UnauthorizedAccessException)
            {
                Mostrar("No se pudo descargar la actualización. Revisa tu conexión.", "Reintentar");
                return;
            }
            texto.text = "Instalando… la app se reinicia sola.";
            // Process.Start no sirve en IL2CPP, con shell ni sin él (Win32Exception "Success", medido en 0.1.8 y 0.1.10).
            var codigo = (long)ShellExecuteW(IntPtr.Zero, "open", instalador, "/SILENT", null, 1);
            if (codigo <= 32)
            {
                Mostrar($"No se pudo abrir el instalador (error {codigo}).", "Reintentar");
                return;
            }
            Application.Quit();
        }

        // Devuelve más de 32 si lanzó el programa (documentación de ShellExecuteW).
        [System.Runtime.InteropServices.DllImport("shell32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        static extern IntPtr ShellExecuteW(IntPtr ventana, string verbo, string archivo, string parametros, string carpeta, int mostrar);
    }
}
