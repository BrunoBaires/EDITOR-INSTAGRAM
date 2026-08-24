// Diagnóstico. No toca nada: solo informa qué ve la función desde adentro.
// Se puede borrar del repo una vez que todo funcione.

export default async function handler(req, res) {
  const h = (req && req.headers) || {};
  const oidcHeader = h['x-vercel-oidc-token'] || null;

  const info = {
    node: process.version,
    // ¿Están las credenciales del almacén?
    BLOB_STORE_ID: !!process.env.BLOB_STORE_ID,
    BLOB_WEBHOOK_PUBLIC_KEY: !!process.env.BLOB_WEBHOOK_PUBLIC_KEY,
    BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
    EDITOR_UPLOAD_KEY: !!process.env.EDITOR_UPLOAD_KEY,
    // Para probar la clave sin revelarla: /api/diag?k=loquesea
    claveProbada: (req.query && req.query.k) ? true : false,
    claveCoincide: (req.query && req.query.k)
      ? (req.query.k === process.env.EDITOR_UPLOAD_KEY) : null,
    // El token OIDC no vive en process.env dentro de una función:
    // Vercel lo manda en este encabezado.
    VERCEL_OIDC_TOKEN_env: !!process.env.VERCEL_OIDC_TOKEN,
    oidc_en_encabezado: !!oidcHeader,
    // ¿Se instaló la librería, y en qué versión?
    libreria: null,
    version: null,
    libreriaError: null,
    // ¿Se puede leer el almacén de verdad?
    credencialUsada: null,
    lecturaOk: null,
    lecturaError: null
  };

  try {
    const blob = await import('@vercel/blob');
    info.libreria = (typeof blob.put === 'function' && typeof blob.list === 'function')
      ? 'instalada' : 'cargó pero sin las funciones esperadas';
    info.version = typeof blob.issueSignedToken === 'function' ? '2.x' : '1.x';

    let cred = {};
    if (oidcHeader && process.env.BLOB_STORE_ID) {
      cred = { oidcToken: oidcHeader, storeId: process.env.BLOB_STORE_ID };
      info.credencialUsada = 'oidc';
    } else if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) {
      cred = { oidcToken: process.env.VERCEL_OIDC_TOKEN, storeId: process.env.BLOB_STORE_ID };
      info.credencialUsada = 'oidc (env)';
    } else if (process.env.BLOB_READ_WRITE_TOKEN) {
      cred = { token: process.env.BLOB_READ_WRITE_TOKEN };
      info.credencialUsada = 'token';
    } else {
      info.credencialUsada = 'ninguna';
    }

    try {
      const r = await blob.list({ ...cred, limit: 1 });
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
