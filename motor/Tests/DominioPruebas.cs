using NUnit.Framework;

namespace ChatCouncil.Motor.Pruebas
{
    public class DominioPruebas
    {
        [Test]
        public void ElEsquemaEsElMismoQueElDeLaVersionElectron()
        {
            Assert.That(Dominio.VersionEsquema, Is.EqualTo(1));
        }
    }
}
