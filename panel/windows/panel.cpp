// ChatCouncilPanel.dll — los paneles de los proveedores sobre WebView2, para Unity (Windows x64).
//
// Contrato con C# (unity/Assets/Panel/Paneles.cs): funciones planas, llamadas siempre desde el hilo
// principal de Unity. Ese hilo bombea los mensajes de la ventana de Unity, que es por donde WebView2
// entrega sus callbacks. El plugin nunca llama a C#: todo lo asíncrono queda en un estado o en un
// resultado que C# consulta (0 pendiente, 1 listo, negativo error).
//
// Límites, los de la versión Electron: no envía, no lee cookies ni almacenamiento, no cambia el
// user agent. Cancela toda navegación a un cierre de sesión.

#include <windows.h>
#include <wrl.h>
#include <map>
#include <regex>
#include <string>
#include "WebView2.h"
#include "WebView2EnvironmentOptions.h"

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Make;

#define EXPORTAR extern "C" __declspec(dllexport)

namespace {

struct Panel {
    HWND hwnd = nullptr;
    ComPtr<ICoreWebView2Controller> controlador;
    ComPtr<ICoreWebView2> vista;
    int estado = 0;
    std::wstring error, ultimaBloqueada;
    int navegaciones = 0, bloqueadas = 0, terminadas = 0;
};

struct Resultado {
    bool listo = false;
    std::wstring json;
};

ComPtr<ICoreWebView2Environment> entorno;
int estadoEntorno = 0;
std::wstring errorGlobal, host, carpetaHost;
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

Panel* Buscar(int id) {
    auto it = paneles.find(id);
    return it == paneles.end() ? nullptr : it->second;
}

void Liberar(int id) {
    Panel* p = Buscar(id);
    if (!p) return;
    if (p->controlador) p->controlador->Close();
    if (p->hwnd) DestroyWindow(p->hwnd);
    paneles.erase(id);
    delete p;
}

// La ventana de Unity: la ventana principal visible del hilo que llama (el hilo principal de Unity).
BOOL CALLBACK ElegirVentana(HWND h, LPARAM p) {
    if (!IsWindowVisible(h) || GetWindow(h, GW_OWNER)) return TRUE;
    *reinterpret_cast<HWND*>(p) = h;
    return FALSE;
}

LRESULT CALLBACK ProcVentana(HWND h, UINT m, WPARAM w, LPARAM l) {
    if (m == WM_SIZE) {
        for (auto& [id, p] : paneles)
            if (p->hwnd == h && p->controlador) {
                RECT r;
                GetClientRect(h, &r);
                p->controlador->put_Bounds(r);
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

    if (!host.empty()) {
        ComPtr<ICoreWebView2_3> v3;
        if (SUCCEEDED(vista.As(&v3)))
            v3->SetVirtualHostNameToFolderMapping(host.c_str(), carpetaHost.c_str(), COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW);
    }
    vista->Navigate(url.c_str());
}

}  // namespace

EXPORTAR int CC_Iniciar(const wchar_t* carpetaDatos, const wchar_t* argumentos, const wchar_t* hostVirtual, const wchar_t* carpeta) {
    if (estadoEntorno != 0 || entorno) return Fallar(L"WebView2 ya estaba iniciado");
    HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (hr == RPC_E_CHANGED_MODE) return Fallar(L"el hilo de Unity no es STA: WebView2 necesita un hilo STA");

    EnumThreadWindows(GetCurrentThreadId(), ElegirVentana, reinterpret_cast<LPARAM>(&padre));
    if (!padre) return Fallar(L"no se encontró la ventana de Unity en este hilo");

    WNDCLASSW clase{};
    clase.lpfnWndProc = ProcVentana;
    clase.hInstance = GetModuleHandleW(nullptr);
    clase.lpszClassName = ClaseVentana;
    RegisterClassW(&clase);
    SetWindowLongPtrW(padre, GWL_STYLE, GetWindowLongPtrW(padre, GWL_STYLE) | WS_CLIPCHILDREN);

    host = hostVirtual ? hostVirtual : L"";
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
    ComPtr<ICoreWebView2Environment10> e10;
    if (!entorno || FAILED(entorno.As(&e10))) return Fallar(L"WebView2 no está iniciado, o su versión no admite perfiles");

    ComPtr<ICoreWebView2ControllerOptions> opciones;
    HRESULT hr = e10->CreateCoreWebView2ControllerOptions(&opciones);
    if (SUCCEEDED(hr)) hr = opciones->put_ProfileName(perfil);
    if (FAILED(hr)) return Fallar(Hr(L"no se pudo pedir el perfil", hr));

    int id = siguientePanel++;
    auto p = new Panel();
    paneles[id] = p;
    p->hwnd = CreateWindowExW(0, ClaseVentana, L"", WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS, 0, 0, 0, 0, padre, nullptr, GetModuleHandleW(nullptr), nullptr);

    std::wstring destino = url;
    hr = e10->CreateCoreWebView2ControllerWithOptions(
        p->hwnd, opciones.Get(),
        Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>([id, destino](HRESULT r, ICoreWebView2Controller* c) -> HRESULT {
            Panel* p = Buscar(id);
            if (!p) return S_OK;
            if (FAILED(r) || !c) {
                p->error = Hr(L"no se pudo crear el panel", r);
                p->estado = -1;
                return S_OK;
            }
            p->controlador = c;
            c->get_CoreWebView2(&p->vista);
            RECT rc;
            GetClientRect(p->hwnd, &rc);
            c->put_Bounds(rc);
            Configurar(id, p, destino);
            p->estado = 1;
            return S_OK;
        }).Get());
    if (FAILED(hr)) {
        Liberar(id);
        return Fallar(Hr(L"CreateCoreWebView2ControllerWithOptions falló", hr));
    }
    return id;
}

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
        for (auto& [otro, q] : paneles)
            if (q->hwnd == h) return h == p->hwnd ? 1 : 0;
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

// 0: navegaciones que empezaron; 1: bloqueadas por cierre de sesión; 2: navegaciones terminadas.
EXPORTAR int CC_Contador(int id, int cual) {
    Panel* p = Buscar(id);
    if (!p) return -1;
    return cual == 0 ? p->navegaciones : cual == 1 ? p->bloqueadas : p->terminadas;
}

EXPORTAR int CC_Ejecutar(int id, const wchar_t* script) {
    Panel* p = Buscar(id);
    if (!p || !p->vista) return Fallar(L"el panel no existe o no está listo");
    int ticket = siguienteTicket++;
    resultados[ticket] = Resultado{};
    HRESULT hr = p->vista->ExecuteScript(
        script, Callback<ICoreWebView2ExecuteScriptCompletedHandler>([ticket](HRESULT r, LPCWSTR json) -> HRESULT {
            auto it = resultados.find(ticket);
            if (it == resultados.end()) return S_OK;
            it->second.listo = true;
            // Un script que lanza devuelve "null"; un fallo de la llamada se informa como JSON aparte.
            it->second.json = SUCCEEDED(r) && json ? std::wstring(json) : L"{\"__error\":\"" + Hr(L"ExecuteScript falló", r) + L"\"}";
            return S_OK;
        }).Get());
    if (FAILED(hr)) {
        resultados.erase(ticket);
        return Fallar(Hr(L"ExecuteScript falló", hr));
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
            if (p && p->vista) {
                ComPtr<ICoreWebView2_13> v13;
                ComPtr<ICoreWebView2Profile> perfil;
                LPWSTR nombre = nullptr;
                if (SUCCEEDED(p->vista.As(&v13)) && SUCCEEDED(v13->get_Profile(&perfil))) perfil->get_ProfileName(&nombre);
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
