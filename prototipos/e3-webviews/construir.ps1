# E3: compila un exe release por plugin en C:\cc-e3\<plugin>. Ruta ASCII porque flutter assemble corrompe la «á» del perfil;
# un exe por plugin porque webview_windows, webview_plus y flutter_inappwebview crean el DispatcherQueue del hilo y solo uno gana.
param([string[]]$Plugins = @('windows', 'floating', 'plus', 'inapp'), [string]$Raiz = 'C:\cc-e3')
$ErrorActionPreference = 'Stop'
$paquetes = @{ windows = 'webview_windows'; floating = 'webview_win_floating'; plus = 'webview_plus'; inapp = 'flutter_inappwebview' }
$u = [Environment]::GetEnvironmentVariable('Path', 'User'); $m = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$env:Path = "C:\Users\JUANFE~1\HERRAM~1\flutter\bin;$m;$u"; $env:PUB_CACHE = Join-Path $Raiz 'pub-cache'
$utf8 = New-Object Text.UTF8Encoding($false)
foreach ($p in $Plugins) {
    $dst = Join-Path $Raiz $p
    robocopy $PSScriptRoot $dst /MIR /XD build .dart_tool ephemeral /XF *.ps1 /NFL /NDL /NJH /NJS | Out-Null
    [IO.File]::WriteAllText("$dst\lib\candidato.dart", "export 'p_$p.dart';`n", $utf8)
    foreach ($o in $paquetes.Keys | Where-Object { $_ -ne $p }) { Remove-Item -LiteralPath "$dst\lib\p_$o.dart" }
    $otros = $paquetes.Keys | Where-Object { $_ -ne $p } | ForEach-Object { $paquetes[$_] }
    $pub = [IO.File]::ReadAllLines("$dst\pubspec.yaml") | Where-Object { $l = $_; -not ($otros | Where-Object { $l -match "^\s+$($_):" }) }
    [IO.File]::WriteAllLines("$dst\pubspec.yaml", $pub, $utf8)
    Push-Location $dst
    try {
        $ErrorActionPreference = 'Continue' # en PowerShell 5.1 cada línea de stderr de flutter (avisos de CMake) sería una excepción
        flutter pub get 2>&1 | Out-Null
        $log = flutter build windows --release 2>&1 | Out-String
        $exe = Join-Path $dst 'build\windows\x64\runner\Release\e3_webviews.exe'
        if ($LASTEXITCODE -eq 0 -and (Test-Path $exe)) { "$p : compila ($exe)" }
        else { "$p : NO compila`n$(($log -split "`n" | Select-String 'error' | Select-Object -First 5) -join "`n")" }
    } finally { $ErrorActionPreference = 'Stop'; Pop-Location }
}
