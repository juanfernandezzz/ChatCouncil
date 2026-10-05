// Prueba de login de Google en WebView2. Sin captura, sin pegar, sin cambiar el user agent.
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class Program
{
    // Orden y URLs de packages/providers/src/specs.json (newConversationUrl).
    static readonly (string Nombre, string Url)[] Proveedores =
    {
        ("ChatGPT", "https://chatgpt.com/"),
        ("Gemini", "https://gemini.google.com/app"),
        ("Claude", "https://claude.ai/new"),
        ("Grok", "https://grok.com/"),
        ("Mistral", "https://chat.mistral.ai/"),
        ("GLM", "https://chat.z.ai/"),
        ("Kimi", "https://kimi.ai/"),
        ("Qwen", "https://chat.qwen.ai/"),
        ("DeepSeek", "https://chat.deepseek.com/sign_in"),
    };

    static CoreWebView2Environment env;

    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        var form = new Form { Text = "ChatCouncil - Prueba de login", Width = 1200, Height = 850 };
        var tabs = new TabControl { Dock = DockStyle.Fill };
        foreach (var (nombre, url) in Proveedores) tabs.TabPages.Add(new TabPage(nombre) { Tag = url });
        form.Controls.Add(tabs);
        tabs.SelectedIndexChanged += (_, _) => Abrir(tabs.SelectedTab);
        form.Shown += async (_, _) =>
        {
            try
            {
                // Una carpeta de datos persistente; dentro, un perfil por proveedor.
                var carpeta = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ChatCouncil-PruebaLogin");
                env = await CoreWebView2Environment.CreateAsync(null, carpeta);
            }
            catch (Exception ex)
            {
                MessageBox.Show("No se pudo iniciar WebView2:\n" + ex.Message, form.Text);
                form.Close();
                return;
            }
            Abrir(tabs.SelectedTab);
        };
        Application.Run(form);
    }

    // Cada pestaña crea su vista la primera vez que se abre.
    static async void Abrir(TabPage tab)
    {
        if (env == null || tab == null || tab.Controls.Count > 0) return;
        var wv = new WebView2 { Dock = DockStyle.Fill };
        tab.Controls.Add(wv);
        try
        {
            await Iniciar(wv, tab.Text.ToLowerInvariant());
            wv.CoreWebView2.Navigate((string)tab.Tag);
        }
        catch (Exception ex) { MessageBox.Show($"No se pudo abrir {tab.Text}:\n{ex.Message}"); }
    }

    static async Task Iniciar(WebView2 wv, string perfil)
    {
        var opciones = env.CreateCoreWebView2ControllerOptions();
        opciones.ProfileName = perfil;
        await wv.EnsureCoreWebView2Async(env, opciones);

        // window.open (p. ej. "Continuar con Google"): ventana propia, MISMO perfil,
        // y asignada a NewWindow para que window.opener siga conectado.
        wv.CoreWebView2.NewWindowRequested += async (_, e) =>
        {
            var diferido = e.GetDeferral();
            try
            {
                var f = e.WindowFeatures;
                var emergente = new Form
                {
                    Text = "Ventana emergente",
                    StartPosition = FormStartPosition.CenterParent,
                    ClientSize = new Size(f.HasSize ? (int)Math.Max(f.Width, 400) : 520, f.HasSize ? (int)Math.Max(f.Height, 500) : 680),
                };
                var pwv = new WebView2 { Dock = DockStyle.Fill };
                emergente.Controls.Add(pwv);
                emergente.Show(wv.FindForm());
                await Iniciar(pwv, perfil); // recursivo: una emergente también puede abrir otra
                pwv.CoreWebView2.WindowCloseRequested += (_, _) => emergente.Close(); // window.close() al terminar el login
                e.NewWindow = pwv.CoreWebView2;
                e.Handled = true;
            }
            catch (Exception ex)
            {
                // Sin Handled, WebView2 abre su ventana por defecto: nunca falla en silencio.
                MessageBox.Show("No se pudo crear la ventana emergente:\n" + ex.Message);
            }
            finally { diferido.Complete(); }
        };
    }
}
