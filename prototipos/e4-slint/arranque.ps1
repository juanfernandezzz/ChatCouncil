# E4: tiempo desde lanzar hasta que la ventana es visible (tres corridas por exe) y tamaño del exe con sus DLL.
# Sin agent-desktop: se cuelga sobre estas ventanas. Salida: una línea JSON por corrida.
param(
    [Parameter(Mandatory = $true)][string]$Salida,
    [string]$Url = 'file:///C:/cc-repo/prototipos/e4-slint/paginas/estatica.html'
)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System; using System.Runtime.InteropServices;
public class W32A { public struct R { public int L, T, Ri, B; }
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out R r); }
'@
$candidatos = @(
    @{ plugin = 'slint'; exe = 'C:\cc-e4\target\release\e4_slint.exe' },
    @{ plugin = 'floating'; exe = 'C:\cc-e3\floating\build\windows\x64\runner\Release\e3_webviews.exe' }
)
foreach ($c in $candidatos) {
    $carpeta = Split-Path $c.exe
    $dll = @(Get-ChildItem $carpeta -File -Filter *.dll)
    $exeBytes = (Get-Item $c.exe).Length
    $dllBytes = [long](($dll | Measure-Object Length -Sum).Sum)
    # Flutter además necesita data\ (motor AOT y assets); el resto de la carpeta de Rust son artefactos de compilación.
    $data = if (Test-Path "$carpeta\data") { [long]((Get-ChildItem "$carpeta\data" -File -Recurse | Measure-Object Length -Sum).Sum) } else { [long]0 }
    for ($i = 1; $i -le 3; $i++) {
        $datos = Join-Path $env:TEMP "e4-arranque-$($c.plugin)-$i-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
        $reloj = [Diagnostics.Stopwatch]::StartNew()
        $p = Start-Process -FilePath $c.exe -ArgumentList $c.plugin, 'diez', $datos, $Url -PassThru
        $ms = $null
        while ($reloj.Elapsed.TotalSeconds -lt 30) {
            $p.Refresh()
            if ($p.HasExited) { throw "$($c.plugin) salió con $($p.ExitCode)" }
            # Winit expone antes un auxiliar visible de 16x16 como ventana principal: solo cuenta la ventana con su ancho real.
            $w = New-Object W32A+R
            if ($p.MainWindowHandle -ne [IntPtr]::Zero -and [W32A]::IsWindowVisible($p.MainWindowHandle) -and [W32A]::GetWindowRect($p.MainWindowHandle, [ref]$w) -and ($w.Ri - $w.L) -gt 1000) { $ms = $reloj.ElapsedMilliseconds; break }
            Start-Sleep -Milliseconds 5
        }
        if ($null -eq $ms) { Stop-Process -Id $p.Id -Force; throw "$($c.plugin): sin ventana en 30 s" }
        Start-Sleep -Seconds 20
        $v = New-Object W32A+R; $k = New-Object W32A+R
        [void][W32A]::GetWindowRect($p.MainWindowHandle, [ref]$v); [void][W32A]::GetClientRect($p.MainWindowHandle, [ref]$k)
        [void]$p.CloseMainWindow()
        if (-not $p.WaitForExit(60000)) { Stop-Process -Id $p.Id -Force; throw "$($c.plugin) no cerró en 60 s" }
        $linea = [ordered]@{ plugin = $c.plugin; corrida = $i; msHastaVisible = $ms; exeBytes = $exeBytes; dllBytes = $dllBytes; dllArchivos = $dll.Count; dataBytes = $data
            ventana = "$($v.L),$($v.T),$($v.Ri),$($v.B)"; cliente = "$($k.Ri)x$($k.B)" }
        [IO.File]::AppendAllText($Salida, (([pscustomobject]$linea) | ConvertTo-Json -Compress) + "`n")
        "$($c.plugin) corrida $i : $ms ms ventana=$($linea.ventana) cliente=$($linea.cliente)"
        Start-Sleep -Seconds 15
    }
}
