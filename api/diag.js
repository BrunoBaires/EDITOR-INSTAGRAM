// Diagnóstico. No toca nada: solo informa qué ve la función desde adentro.
// Se puede borrar del repo una vez que todo funcione.

export default async function handler(req, res) {
  const info = {
    node: process.version,
    // ¿Están las credenciales del almacén?
    BLOB_STORE_ID: !!process.env.BLOB_STORE_ID,
    BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
    VERCEL_OIDC_TOKEN: !!process.env.VERCEL_OIDC_TOKEN,
    EDITOR_UPLOAD_KEY: !!process.env.EDITOR_UPLOAD_KEY,
    // ¿Se instaló la librería del almacén?
    libreria: null,
    libreriaError: null,
    // ¿Se puede leer el almacén de verdad?
    lecturaOk: null,
    lecturaError: null
  };

  try {
    const blob = await import('@vercel/blob');
    info.libreria = (typeof blob.put === 'function' && typeof blob.list === 'function')
      ? 'instalada' : 'cargó pero sin las funciones esperadas';
    try {
      const r = await blob.list({ limit: 1 });
      info.lecturaOk = true;
      info.archivosEnElAlmacen = (r.blobs || []).length;
    } catch (e) {
      info.lecturaOk = false;
      info.lecturaError = String((e && e.message) || e);
    }
  } catch (e) {
    info.libreria = 'NO se pudo importar';
    info.libreriaError = String((e && e.message) || e);
  }

  res.status(200).json(info);
}
