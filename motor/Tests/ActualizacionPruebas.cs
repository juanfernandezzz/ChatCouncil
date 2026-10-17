using NUnit.Framework;

namespace ChatCouncil.Motor.Pruebas
{
    public class ActualizacionPruebas
    {
        [TestCase("0.1.5", "0.1.6\n", true)]
        [TestCase("0.1.9", "0.1.10", true)] // numérico, no de texto
        [TestCase("0.1.6", "0.1.6", false)]
        [TestCase("0.1.7", "0.1.6", false)]
        [TestCase("0.1.0", "0.1.6", false)] // compilación local: no ofrece nada
        [TestCase("0.1.5", "<html>", false)]
        [TestCase("0.1.5", "", false)]
        [TestCase("0.1.5", null, false)]
        public void SoloEsNuevaUnaVersionPublicadaMayor(string actual, string publicada, bool esperado) =>
            Assert.That(Actualizacion.EsNueva(actual, publicada), Is.EqualTo(esperado));
    }
}
