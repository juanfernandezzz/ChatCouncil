// ChatCouncilPanel.dll — los paneles de los proveedores sobre WebView2, para Unity (Windows x64).
//
// Contrato con C# (unity/Assets/Panel/Paneles.cs): funciones planas, llamadas siempre desde el hilo
// principal de Unity. Ese hilo bombea los mensajes de la ventana de Unity, que es por donde WebView2
// entrega sus callbacks. El plugin nunca llama a C#: todo lo asíncrono queda en un estado o en un
// resultado por ticket que C# consulta (0 pendiente, 1 listo, negativo error).
//
// Límites, los de la versión Electron: no envía, no lee cookies ni almacenamiento, no cambia el
// user agent. Cancela toda navegación a un cierre de sesión.

#include <windows.h>
#include <wrl.h>
#include <functional>
#include <map>
#include <memory>
#include <regex>
#include <string>
#include <vector>
#include "WebView2.h"
#include "WebView2EnvironmentOptions.h"

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Make;

#define EXPORTAR extern "C" __declspec(dllexport)

namespace {

// Un iframe del marco principal, con la última URL a la que navegó.
struct Marco {
    ComPtr<ICoreWebView2Frame2> marco;
    std::wstring url;
    bool vivo = true;
};

struct Panel {
    HWND hwnd = nullptr;
    ComPtr<ICoreWebView2Controller> controlador;
    ComPtr<ICoreWebView2> vista;
    int estado = 0;
    std::wstring perfil, error, ultimaBloqueada;
    int navegaciones = 0, bloqueadas = 0, terminadas = 0, emergente = 0;
    std::vector<std::shared_ptr<Marco>> marcos;
};

struct Resultado {
    bool listo = false;
    std::wstring json;
};

ComPtr<ICoreWebView2Environment> entorno;
int estadoEntorno = 0;
std::wstring errorGlobal, carpetaHost;
std::vector<std::wstring> hosts;
HWND padre = nullptr;
std::map<int, Panel*> paneles;
std::map<int, Resultado> resultados;
int siguientePanel = 1, siguienteTicket = 1;
const wchar_t* ClaseVentana = L"ChatCouncilPanel";

// El mismo patrón que apps/desktop/src/main/index.ts (CIERRE_DE_SESION), sobre la URL entera.
const std::wregex CierreDeSesion(L"/(logout|log-out|signout|sign-out)(\\b|/|\\?|$)", std::regex::icase);

std::wstring Hr(const wchar_t* que, HRESULT hr) {
    wchar_t b[32];
    swprintf_s(b, L"0x%08X", static_cast<unsigned>(hr));
    return std::wstring(que) + L" (HRESULT " + b + L")";
}

int Fallar(const std::wstring& mensaje) {
    errorGlobal = mensaje;
    return -1;
}

std::wstring ErrorJson(const wchar_t* que, HRESULT hr) { return L"{\"__error\":\"" + Hr(que, hr) + L"\"}"; }

Panel* Buscar(int id) {
    auto it = paneles.find(id);
    return it == paneles.end() ? nullptr : it->second;
}

int BuscarPorVentana(HWND h) {
    for (auto& [id, p] : paneles)
        if (p->hwnd == h) return id;
    return 0;
}

void Liberar(int id) {
    Panel* p = Buscar(id);
    if (!p) return;
    paneles.erase(id);
    if (p->controlador) p->controlador->Close();
    if (p->hwnd) DestroyWindow(p->hwnd);
    delete p;
}

int NuevoTicket() {
    int t = siguienteTicket++;
    resultados[t] = Resultado{};
    return t;
}

void Guardar(int ticket, const std::wstring& json) {
    auto it = resultados.find(ticket);
    if (it == resultados.end()) return;  // olvidado por el techo: se descarta
    it->second.listo = true;
    it->second.json = json;
}

// La ventana de Unity: la ventana principal visible del hilo que llama (el hilo principal de Unity).
BOOL CALLBACK ElegirVentana(HWND h, LPARAM p) {
    if (!IsWindowVisible(h) || GetWindow(h, GW_OWNER)) return TRUE;
    *reinterpret_cast<HWND*>(p) = h;
    return FALSE;
}

LRESULT CALLBACK ProcVentana(HWND h, UINT m, WPARAM w, LPARAM l) {
    if (m == WM_SIZE) {
        Panel* p = Buscar(BuscarPorVentana(h));
        if (p && p->controlador) {
            RECT r;
            GetClientRect(h, &r);
            p->controlador->put_Bounds(r);
        }
    } else if (m == WM_CLOSE) {
        // Una emergente: la cierra la persona o la página con window.close(). Se libera entera.
        if (int id = BuscarPorVentana(h)) {
            Liberar(id);
            return 0;
        }
    }
    return DefWindowProcW(h, m, w, l);
}

std::wstring Cadena(LPWSTR s) {
    std::wstring r = s ? s : L"";
    if (s) CoTaskMemFree(s);
    return r;
}

// La línea de comandos de otro proceso, leída del sistema operativo (ProcessCommandLineInformation).
std::wstring LineaDeComandos(DWORD pid) {
    using Consultar = LONG(NTAPI*)(HANDLE, ULONG, PVOID, ULONG, PULONG);
    auto consultar = reinterpret_cast<Consultar>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "NtQueryInformationProcess"));
    HANDLE proceso = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!consultar || !proceso) return L"";
    std::wstring linea;
    ULONG largo = 0;
    consultar(proceso, 60, nullptr, 0, &largo);
    if (largo) {
        std::string buf(largo, '\0');
        if (consultar(proceso, 60, buf.data(), largo, &largo) >= 0) {
            struct Cadena16 { USHORT largo, max; PWSTR texto; };
            auto c = reinterpret_cast<Cadena16*>(buf.data());
            linea.assign(c->texto, c->largo / sizeof(wchar_t));
        }
    }
    CloseHandle(proceso);
    return linea;
}

int Copiar(const std::wstring& s, wchar_t* destino, int capacidad) {
    int largo = static_cast<int>(s.size());
    if (destino && capacidad >= largo) memcpy(destino, s.data(), largo * sizeof(wchar_t));
    return largo;
}

ComPtr<ICoreWebView2Profile> PerfilDe(Panel* p) {
    ComPtr<ICoreWebView2_13> v13;
    ComPtr<ICoreWebView2Profile> perfil;
    if (p && p->vista && SUCCEEDED(p->vista.As(&v13))) v13->get_Profile(&perfil);
    return perfil;
}

using AlEstarListo = std::function<void(int id, Panel* p)>;
int CrearPanel(const std::wstring& perfil, const std::wstring& url, HWND ventana, AlEstarListo listo);

void Configurar(int id, Panel* p, const std::wstring& url) {
    auto vista = p->vista;

    // Cierre de sesión: se cancela la navegación (y la redirección), y queda contada.
    // Las redirecciones de una misma navegación no suman: el contador es de navegaciones nuevas.
    vista->add_NavigationStarting(
        Callback<ICoreWebView2NavigationStartingEventHandler>([id](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* a) -> HRESULT {
            Panel* p = Buscar(id);
            if (!p) return S_OK;
            LPWSTR s = nullptr;
            a->get_Uri(&s);
            std::wstring uri = Cadena(s);
            if (std::regex_search(uri, CierreDeSesion)) {
                a->put_Cancel(TRUE);
                p->bloqueadas++;
                p->ultimaBloqueada = uri;
                return S_OK;
            }
            BOOL redirigida = FALSE;
            a->get_IsRedirected(&redirigida);
            if (!redirigida) p->navegaciones++;
            return S_OK;
        }).Get(),
        nullptr);
    vista->add_NavigationCompleted(
        Callback<ICoreWebView2NavigationCompletedEventHandler>([id](ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs*) -> HRESULT {
            if (Panel* p = Buscar(id)) p->terminadas++;
            return S_OK;
        }).Get(),
        nullptr);

    // window.open (p. ej. "Continuar con Google"): ventana propia, MISMO perfil, y asignada a NewWindow
    // para que window.opener siga conectado (medido en la prueba de login, 2026-10-05).
    vista->add_NewWindowRequested(
        Callback<ICoreWebView2NewWindowRequestedEventHandler>([id](ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs* a) -> HRESULT {
            Panel* p = Buscar(id);
            if (!p) return S_OK;
            ComPtr<ICoreWebView2NewWindowRequestedEventArgs> args = a;
            ComPtr<ICoreWebView2Deferral> diferido;
            a->GetDeferral(&diferido);
            int ancho = 520, alto = 680;
            ComPtr<ICoreWebView2WindowFeatures> f;
            BOOL conTamano = FALSE;
            if (SUCCEEDED(a->get_WindowFeatures(&f)) && SUCCEEDED(f->get_HasSize(&conTamano)) && conTamano) {
                UINT32 w = 0, h = 0;
                f->get_Width(&w);
                f->get_Height(&h);
                ancho = max(static_cast<int>(w), 400);
                alto = max(static_cast<int>(h), 500);
            }
            HWND ventana = CreateWindowExW(0, ClaseVentana, L"ChatCouncil", WS_OVERLAPPEDWINDOW | WS_VISIBLE, CW_USEDEFAULT, CW_USEDEFAULT, ancho, alto,
                                           padre, nullptr, GetModuleHandleW(nullptr), nullptr);
            int nuevo = CrearPanel(p->perfil, L"", ventana, [id, args, diferido](int nuevoId, Panel* q) {
                if (q) {
                    args->put_NewWindow(q->vista.Get());
                    args->put_Handled(TRUE);
                    if (Panel* o = Buscar(id)) o->emergente = nuevoId;
                }
                diferido->Complete();  // sin Handled, WebView2 abre su ventana por defecto: nunca falla en silencio
            });
            if (nuevo < 0) {
                DestroyWindow(ventana);
                diferido->Complete();
            }
            return S_OK;
        }).Get(),
        nullptr);
    vista->add_WindowCloseRequested(
        Callback<ICoreWebView2WindowCloseRequestedEventHandler>([id](ICoreWebView2*, IUnknown*) -> HRESULT {
            if (Panel* p = Buscar(id)) PostMessageW(p->hwnd, WM_CLOSE, 0, 0);
            return S_OK;
        }).Get(),
        nullptr);

    // Los iframes del marco principal, con su URL, para ejecutar un script en uno de otro origen.
    ComPtr<ICoreWebView2_4> v4;
    if (SUCCEEDED(vista.As(&v4))) {
        v4->add_FrameCreated(
            Callback<ICoreWebView2FrameCreatedEventHandler>([id](ICoreWebView2*, ICoreWebView2FrameCreatedEventArgs* a) -> HRESULT {
                Panel* p = Buscar(id);
                ComPtr<ICoreWebView2Frame> f;
                if (!p || FAILED(a->get_Frame(&f))) return S_OK;
                auto m = std::make_shared<Marco>();
                if (FAILED(f.As(&m->marco))) return S_OK;
                p->marcos.push_back(m);
                m->marco->add_NavigationStarting(
                    Callback<ICoreWebView2FrameNavigationStartingEventHandler>([m](ICoreWebView2Frame*, ICoreWebView2NavigationStartingEventArgs* n) -> HRESULT {
                        LPWSTR s = nullptr;
                        n->get_Uri(&s);
                        m->url = Cadena(s);
                        return S_OK;
                    }).Get(),
                    nullptr);
                f->add_Destroyed(
                    Callback<ICoreWebView2FrameDestroyedEventHandler>([m](ICoreWebView2Frame*, IUnknown*) -> HRESULT {
                        m->vivo = false;
                        return S_OK;
                    }).Get(),
                    nullptr);
                return S_OK;
            }).Get(),
            nullptr);
    }

    ComPtr<ICoreWebView2_3> v3;
    if (!hosts.empty() && SUCCEEDED(vista.As(&v3)))
        for (auto& h : hosts) v3->SetVirtualHostNameToFolderMapping(h.c_str(), carpetaHost.c_str(), COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW);

    if (!url.empty()) vista->Navigate(url.c_str());  // una emergente no navega: la página que la abrió la carga
}

int CrearPanel(const std::wstring& perfil, const std::wstring& url, HWND ventana, AlEstarListo listo) {
    ComPtr<ICoreWebView2Environment10> e10;
    if (!entorno || FAILED(entorno.As(&e10))) return Fallar(L"WebView2 no está iniciado, o su versión no admite perfiles");

    ComPtr<ICoreWebView2ControllerOptions> opciones;
    HRESULT hr = e10->CreateCoreWebView2ControllerOptions(&opciones);
    if (SUCCEEDED(hr)) hr = opciones->put_ProfileName(perfil.c_str());
    if (FAILED(hr)) return Fallar(Hr(L"no se pudo pedir el perfil", hr));

    int id = siguientePanel++;
    auto p = new Panel();
    p->perfil = perfil;
    p->hwnd = ventana;
    paneles[id] = p;

    hr = e10->CreateCoreWebView2ControllerWithOptions(
        ventana, opciones.Get(),
        Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>([id, url, listo](HRESULT r, ICoreWebView2Controller* c) -> HRESULT {
            Panel* p = Buscar(id);
            if (!p) return S_OK;
            if (FAILED(r) || !c) {
                p->error = Hr(L"no se pudo crear el panel", r);
                p->estado = -1;
                if (listo) listo(id, nullptr);
                return S_OK;
            }
            p->controlador = c;
            c->get_CoreWebView2(&p->vista);
            RECT rc;
            GetClientRect(p->hwnd, &rc);
            c->put_Bounds(rc);
            Configurar(id, p, url);
            p->estado = 1;
            if (listo) listo(id, p);
            return S_OK;
        }).Get());
    if (FAILED(hr)) {
        paneles.erase(id);
        delete p;
        return Fallar(Hr(L"CreateCoreWebView2ControllerWithOptions falló", hr));
    }
    return id;
}

}  // namespace

EXPORTAR int CC_Iniciar(const wchar_t* carpetaDatos, const wchar_t* argumentos, const wchar_t* hostsVirtuales, const wchar_t* carpeta) {
    if (estadoEntorno != 0 || entorno) return Fallar(L"WebView2 ya estaba iniciado");
    HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (hr == RPC_E_CHANGED_MODE) return Fallar(L"el hilo de Unity no es STA: WebView2 necesita un hilo STA");

    EnumThreadWindows(GetCurrentThreadId(), ElegirVentana, reinterpret_cast<LPARAM>(&padre));
    if (!padre) return Fallar(L"no se encontró la ventana de Unity en este hilo");

    WNDCLASSW clase{};
    clase.lpfnWndProc = ProcVentana;
    clase.hInstance = GetModuleHandleW(nullptr);
    clase.lpszClassName = ClaseVentana;
    clase.hCursor = LoadCursor(nullptr, IDC_ARROW);
    RegisterClassW(&clase);
    SetWindowLongPtrW(padre, GWL_STYLE, GetWindowLongPtrW(padre, GWL_STYLE) | WS_CLIPCHILDREN);

    // Varios hosts virtuales sobre la misma carpeta, separados por ';' (dos orígenes para probar un iframe ajeno).
    std::wstring lista = hostsVirtuales ? hostsVirtuales : L"";
    for (size_t i = 0; i <= lista.size();) {
        size_t fin = lista.find(L';', i);
        if (fin == std::wstring::npos) fin = lista.size();
        if (fin > i) hosts.push_back(lista.substr(i, fin - i));
        i = fin + 1;
    }
    carpetaHost = carpeta ? carpeta : L"";
    auto opciones = Make<CoreWebView2EnvironmentOptions>();
    opciones->put_AdditionalBrowserArguments(argumentos);
    hr = CreateCoreWebView2EnvironmentWithOptions(
        nullptr, carpetaDatos, opciones.Get(),
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>([](HRESULT r, ICoreWebView2Environment* e) -> HRESULT {
            if (FAILED(r) || !e) {
                errorGlobal = Hr(L"no se pudo crear el entorno de WebView2 (¿está instalado el runtime?)", r);
                estadoEntorno = -1;
            } else {
                entorno = e;
                estadoEntorno = 1;
            }
            return S_OK;
        }).Get());
    if (FAILED(hr)) return Fallar(Hr(L"CreateCoreWebView2EnvironmentWithOptions falló", hr));
    return 0;
}

EXPORTAR int CC_EstadoEntorno() { return estadoEntorno; }

EXPORTAR int CC_Crear(const wchar_t* perfil, const wchar_t* url) {
    if (!padre) return Fallar(L"WebView2 no está iniciado");
    HWND ventana = CreateWindowExW(0, ClaseVentana, L"", WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS, 0, 0, 0, 0, padre, nullptr, GetModuleHandleW(nullptr), nullptr);
    int id = CrearPanel(perfil, url, ventana, nullptr);
    if (id < 0) DestroyWindow(ventana);
    return id;
}

// 1 listo, 0 creándose, -1 error o cerrado (una emergente cerrada con window.close() ya no existe).
EXPORTAR int CC_EstadoPanel(int id) {
    Panel* p = Buscar(id);
    return p ? p->estado : -1;
}

EXPORTAR void CC_Rect(int id, int x, int y, int ancho, int alto) {
    if (Panel* p = Buscar(id)) MoveWindow(p->hwnd, x, y, ancho, alto, TRUE);
}

// Los paneles se apilan como ventanas hijas en el mismo rectángulo: el activo pasa arriba, sin ocultar los demás.
EXPORTAR void CC_Frente(int id) {
    if (Panel* p = Buscar(id)) SetWindowPos(p->hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
}

EXPORTAR void CC_Atras(int id) {
    if (Panel* p = Buscar(id)) SetWindowPos(p->hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
}

// Medido con el orden real de las ventanas: ¿es el primer panel desde arriba?
EXPORTAR int CC_EsFrente(int id) {
    Panel* p = Buscar(id);
    if (!p) return -1;
    for (HWND h = GetWindow(p->hwnd, GW_HWNDFIRST); h; h = GetWindow(h, GW_HWNDNEXT))
        if (BuscarPorVentana(h)) return h == p->hwnd ? 1 : 0;
    return 0;
}

EXPORTAR void CC_RectReal(int id, int* x, int* y, int* ancho, int* alto) {
    *x = *y = *ancho = *alto = 0;
    Panel* p = Buscar(id);
    if (!p) return;
    RECT r;
    GetWindowRect(p->hwnd, &r);
    MapWindowPoints(HWND_DESKTOP, padre, reinterpret_cast<POINT*>(&r), 2);
    *x = r.left;
    *y = r.top;
    *ancho = r.right - r.left;
    *alto = r.bottom - r.top;
}

EXPORTAR int CC_Navegar(int id, const wchar_t* url) {
    Panel* p = Buscar(id);
    if (!p || !p->vista) return Fallar(L"el panel no existe o no está listo");
    HRESULT hr = p->vista->Navigate(url);
    return FAILED(hr) ? Fallar(Hr(L"Navigate falló", hr)) : 0;
}

// 0: navegaciones que empezaron; 1: bloqueadas por cierre de sesión; 2: navegaciones terminadas;
// 3: id de la última emergente que abrió (0 si ninguna).
EXPORTAR int CC_Contador(int id, int cual) {
    Panel* p = Buscar(id);
    if (!p) return -1;
    switch (cual) {
        case 0: return p->navegaciones;
        case 1: return p->bloqueadas;
        case 2: return p->terminadas;
        case 3: return p->emergente;
        default: return -1;
    }
}

EXPORTAR int CC_Ejecutar(int id, const wchar_t* script) {
    Panel* p = Buscar(id);
    if (!p || !p->vista) return Fallar(L"el panel no existe o no está listo");
    int ticket = NuevoTicket();
    HRESULT hr = p->vista->ExecuteScript(
        script, Callback<ICoreWebView2ExecuteScriptCompletedHandler>([ticket](HRESULT r, LPCWSTR json) -> HRESULT {
            // Un script que lanza devuelve "null"; un fallo de la llamada se informa como JSON aparte.
            Guardar(ticket, SUCCEEDED(r) && json ? std::wstring(json) : ErrorJson(L"ExecuteScript falló", r));
            return S_OK;
        }).Get());
    if (FAILED(hr)) {
        resultados.erase(ticket);
        return Fallar(Hr(L"ExecuteScript falló", hr));
    }
    return ticket;
}

// Ejecuta en el último iframe vivo cuya URL contiene urlContiene. -1 si no hay ninguno.
EXPORTAR int CC_EjecutarEnIframe(int id, const wchar_t* urlContiene, const wchar_t* script) {
    Panel* p = Buscar(id);
    if (!p || !p->vista) return Fallar(L"el panel no existe o no está listo");
    for (auto it = p->marcos.rbegin(); it != p->marcos.rend(); ++it) {
        auto& m = *it;
        if (!m->vivo || m->url.find(urlContiene) == std::wstring::npos) continue;
        int ticket = NuevoTicket();
        HRESULT hr = m->marco->ExecuteScript(
            script, Callback<ICoreWebView2ExecuteScriptCompletedHandler>([ticket](HRESULT r, LPCWSTR json) -> HRESULT {
                Guardar(ticket, SUCCEEDED(r) && json ? std::wstring(json) : ErrorJson(L"ExecuteScript en el iframe falló", r));
                return S_OK;
            }).Get());
        if (FAILED(hr)) {
            resultados.erase(ticket);
            return Fallar(Hr(L"ExecuteScript en el iframe falló", hr));
        }
        return ticket;
    }
    return Fallar(std::wstring(L"no hay un iframe con ") + urlContiene);
}

// Un método del protocolo de DevTools (p. ej. DOM.setFileInputFiles para adjuntar sin abrir el selector).
EXPORTAR int CC_DevTools(int id, const wchar_t* metodo, const wchar_t* parametros) {
    Panel* p = Buscar(id);
    if (!p || !p->vista) return Fallar(L"el panel no existe o no está listo");
    int ticket = NuevoTicket();
    HRESULT hr = p->vista->CallDevToolsProtocolMethod(
        metodo, parametros, Callback<ICoreWebView2CallDevToolsProtocolMethodCompletedHandler>([ticket](HRESULT r, LPCWSTR json) -> HRESULT {
            Guardar(ticket, SUCCEEDED(r) && json ? std::wstring(json) : ErrorJson(L"DevTools falló", r));
            return S_OK;
        }).Get());
    if (FAILED(hr)) {
        resultados.erase(ticket);
        return Fallar(Hr(L"CallDevToolsProtocolMethod falló", hr));
    }
    return ticket;
}

// La impresión nativa de WebView2 a un PDF. El resultado es "true" o "false".
EXPORTAR int CC_Pdf(int id, const wchar_t* ruta) {
    Panel* p = Buscar(id);
    ComPtr<ICoreWebView2_7> v7;
    if (!p || !p->vista || FAILED(p->vista.As(&v7))) return Fallar(L"el panel no existe, o esta versión de WebView2 no imprime a PDF");
    int ticket = NuevoTicket();
    HRESULT hr = v7->PrintToPdf(
        ruta, nullptr, Callback<ICoreWebView2PrintToPdfCompletedHandler>([ticket](HRESULT r, BOOL ok) -> HRESULT {
            Guardar(ticket, SUCCEEDED(r) && ok ? L"true" : L"false");
            return S_OK;
        }).Get());
    if (FAILED(hr)) {
        resultados.erase(ticket);
        return Fallar(Hr(L"PrintToPdf falló", hr));
    }
    return ticket;
}

// Borra todos los datos de navegación del perfil del panel (cookies, almacenamiento, caché).
EXPORTAR int CC_Borrar(int id) {
    ComPtr<ICoreWebView2Profile2> perfil;
    auto base = PerfilDe(Buscar(id));
    if (!base || FAILED(base.As(&perfil))) return Fallar(L"el panel no existe, o esta versión de WebView2 no borra datos de perfil");
    int ticket = NuevoTicket();
    HRESULT hr = perfil->ClearBrowsingDataAll(Callback<ICoreWebView2ClearBrowsingDataCompletedHandler>([ticket](HRESULT r) -> HRESULT {
        Guardar(ticket, SUCCEEDED(r) ? L"true" : ErrorJson(L"ClearBrowsingDataAll falló", r));
        return S_OK;
    }).Get());
    if (FAILED(hr)) {
        resultados.erase(ticket);
        return Fallar(Hr(L"ClearBrowsingDataAll falló", hr));
    }
    return ticket;
}

// -2: ticket desconocido; -1: pendiente; si no, el largo. Con destino suficiente lo copia y lo olvida.
EXPORTAR int CC_Resultado(int ticket, wchar_t* destino, int capacidad) {
    auto it = resultados.find(ticket);
    if (it == resultados.end()) return -2;
    if (!it->second.listo) return -1;
    int largo = Copiar(it->second.json, destino, capacidad);
    if (destino && capacidad >= largo) resultados.erase(it);
    return largo;
}

// El techo de C# venció: el resultado, si llega, se descarta.
EXPORTAR void CC_Olvidar(int ticket) { resultados.erase(ticket); }

// 1: versión del navegador; 2: línea de comandos del proceso del navegador; 3: perfil del panel;
// 4: última URL bloqueada del panel; 5: último error (del panel si id > 0, si no el global).
EXPORTAR int CC_Texto(int cual, int id, wchar_t* destino, int capacidad) {
    std::wstring s;
    Panel* p = Buscar(id);
    switch (cual) {
        case 1:
            if (entorno) {
                LPWSTR v = nullptr;
                entorno->get_BrowserVersionString(&v);
                s = Cadena(v);
            }
            break;
        case 2:
            for (auto& [otro, q] : paneles)
                if (q->vista) {
                    UINT32 pid = 0;
                    q->vista->get_BrowserProcessId(&pid);
                    s = LineaDeComandos(pid);
                    break;
                }
            break;
        case 3:
            if (auto perfil = PerfilDe(p)) {
                LPWSTR nombre = nullptr;
                perfil->get_ProfileName(&nombre);
                s = Cadena(nombre);
            }
            break;
        case 4:
            if (p) s = p->ultimaBloqueada;
            break;
        case 5:
            s = p && !p->error.empty() ? p->error : errorGlobal;
            break;
    }
    return Copiar(s, destino, capacidad);
}

EXPORTAR void CC_Cerrar(int id) { Liberar(id); }
