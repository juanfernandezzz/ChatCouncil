using System;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace ChatCouncil.Construccion
{
    /// <summary>
    /// Compila el .exe de Windows con IL2CPP (spec, Arquitectura) desde la línea de comandos:
    /// Unity.exe -batchmode -quit -projectPath unity -executeMethod ChatCouncil.Construccion.Construir.Windows -salida RUTA\ChatCouncil.exe
    /// </summary>
    public static class Construir
    {
        public static void Windows()
        {
            var args = Environment.GetCommandLineArgs();
            var i = Array.IndexOf(args, "-salida");
            if (i < 0 || i + 1 >= args.Length) throw new ArgumentException("Falta -salida RUTA\\ChatCouncil.exe");

            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.IL2CPP);
            var reporte = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray(),
                locationPathName = args[i + 1],
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.None,
            });
            var r = reporte.summary;
            Debug.Log($"[Construir] {r.result}: {r.totalErrors} errores, {r.totalSize} bytes, {r.totalTime}, {args[i + 1]}");
            if (Application.isBatchMode) EditorApplication.Exit(r.result == BuildResult.Succeeded ? 0 : 1);
        }
    }
}
