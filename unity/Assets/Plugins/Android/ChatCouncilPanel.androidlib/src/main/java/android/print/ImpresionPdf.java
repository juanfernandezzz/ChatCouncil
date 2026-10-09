package android.print;

import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;

import java.io.File;

/**
 * La impresión del sistema a un archivo PDF, sin el diálogo de PrintManager. Está en el paquete android.print porque los
 * constructores de LayoutResultCallback y WriteResultCallback no son públicos en el SDK.
 */
public final class ImpresionPdf {
    public interface Fin { void listo(boolean ok); }

    public static void imprimir(PrintDocumentAdapter adaptador, File archivo, Fin fin) {
        PrintAttributes atributos = new PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 300, 300))
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .build();
        adaptador.onStart();
        adaptador.onLayout(null, atributos, null, new PrintDocumentAdapter.LayoutResultCallback() {
            @Override
            public void onLayoutFinished(PrintDocumentInfo info, boolean cambio) {
                ParcelFileDescriptor fd;
                try {
                    fd = ParcelFileDescriptor.open(archivo, ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE);
                } catch (Exception e) {
                    terminar(false);
                    return;
                }
                adaptador.onWrite(new PageRange[] { PageRange.ALL_PAGES }, fd, new CancellationSignal(), new PrintDocumentAdapter.WriteResultCallback() {
                    @Override
                    public void onWriteFinished(PageRange[] paginas) { cerrar(fd); terminar(true); }

                    @Override
                    public void onWriteFailed(CharSequence error) { cerrar(fd); terminar(false); }

                    @Override
                    public void onWriteCancelled() { cerrar(fd); terminar(false); }
                });
            }

            @Override
            public void onLayoutFailed(CharSequence error) { terminar(false); }

            @Override
            public void onLayoutCancelled() { terminar(false); }

            void terminar(boolean ok) {
                adaptador.onFinish();
                fin.listo(ok);
            }
        }, null);
    }

    static void cerrar(ParcelFileDescriptor fd) {
        try { fd.close(); } catch (Exception ignorado) { }
    }
}
