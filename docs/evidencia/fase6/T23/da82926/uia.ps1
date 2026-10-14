# Lee por UI Automation (lo que usa Narrador) el árbol que la app publica con -lector.
param([string]$Exe, [string]$Datos, [string]$Salida)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$p = Start-Process -FilePath $Exe -ArgumentList '-lector', '-datos', $Datos -PassThru
try {
    for ($i = 0; $i -lt 60 -and $p.MainWindowHandle -eq 0; $i++) { Start-Sleep -Milliseconds 500; $p.Refresh() }
    Start-Sleep -Seconds 12
    $ventana = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
    $r = $ventana.Current.BoundingRectangle
    $lineas = @("Ventana: $($ventana.Current.Name) en $($r.X),$($r.Y) $($r.Width)x$($r.Height)")
    $todos = $ventana.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($e in $todos) {
        $c = $e.Current
        $b = $c.BoundingRectangle
        $lineas += "$($c.ControlType.ProgrammaticName)|$($c.Name)|$([int]$b.X),$([int]$b.Y),$([int]$b.Width)x$([int]$b.Height)|habilitado=$($c.IsEnabled)|clase=$($c.ClassName)"
    }
    $lineas | Out-File -Encoding utf8 $Salida
    "elementos: $($todos.Count)"
}
finally {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
}
