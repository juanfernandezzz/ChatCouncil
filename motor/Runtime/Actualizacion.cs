using System;

namespace ChatCouncil.Motor
{
    /// <summary>
    /// Cuándo ofrecer una actualización. El CI numera cada compilación como 0.1.N (N = número de corrida) y publica
    /// ese número en version.txt del Release. Una compilación local lleva 0.1.0: no ofrece nada, para que probarla
    /// no la invite a instalar encima el Release.
    /// </summary>
    public static class Actualizacion
    {
        public static bool EsNueva(string actual, string publicada) =>
            Version.TryParse(actual?.Trim(), out var a) && Version.TryParse(publicada?.Trim(), out var p) && a.Build > 0 && p > a;
    }
}
