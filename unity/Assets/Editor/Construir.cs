using System;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace ChatCouncil.Construccion
{
    /// <summary>
    /// Compila con IL2CPP (spec, Arquitectura) desde la línea de comandos:
    /// Unity.exe -batchmode -quit -projectPath unity -executeMethod ChatCouncil.Construccion.Construir.Windows -salida RUTA\ChatCouncil.exe
    /// Unity.exe -batchmode -quit -buildTarget Android -projectPath X:\unity -executeMethod ChatCouncil.Construccion.Construir.Android -salida RUTA\ChatCouncil.apk
    /// Android se compila desde una unidad subst sin tildes: Gradle y el NDK fallan con rutas no ASCII (plan, Architecture Decisions).
    /// </summary>
    public static class Construir
    {
        public static void Windows()
        {
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.IL2CPP);
            Compilar(BuildTarget.StandaloneWindows64);
        }

        public static void Android()
        {
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            // Solo ARM64: en 6000.3, x86_64 quedó para Magic Leap y aborta la compilación. El emulador x86_64 (Android 11+) traduce ARM64.
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "com.chatcouncil.app");
            Compilar(BuildTarget.Android);
        }

        static void Compilar(BuildTarget destino)
        {
            var args = Environment.GetCommandLineArgs();
            var i = Array.IndexOf(args, "-salida");
            if (i < 0 || i + 1 >= args.Length) throw new ArgumentException("Falta -salida RUTA");

            var reporte = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray(),
                locationPathName = args[i + 1],
                target = destino,
                options = BuildOptions.None,
            });
            var r = reporte.summary;
            Debug.Log($"[Construir] {r.result}: {r.totalErrors} errores, {r.totalSize} bytes, {r.totalTime}, {args[i + 1]}");
            if (Application.isBatchMode) EditorApplication.Exit(r.result == BuildResult.Succeeded ? 0 : 1);
        }
    }
}
