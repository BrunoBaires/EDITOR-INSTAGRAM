// Ruta que autoriza las subidas de archivos al almacén del equipo.
//
// El archivo NO pasa por acá: el navegador lo manda directo a Vercel Blob.
// Esta función solo firma el permiso, y por eso puede aceptar videos grandes
// sin chocar con el límite de tamaño de las funciones.
//
// Antes esto se hacía con handleUpload, que exige el token largo
// BLOB_READ_WRITE_TOKEN —y Vercel ya no lo entrega—. El reemplazo es
// handleUploadPresigned: en vez de fabricar un token para el navegador, le
// devuelve una URL firmada y con fecha de vencimiento. Funciona con OIDC, que
// es lo que el proyecto tiene.
//
// Del lado del navegador hay que usar uploadPresigned (no upload).

const TIPOS = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif',
  'video/webm', 'video/mp4', 'video/quicktime'
];

// El token OIDC no está en process.env: viene en el encabezado del pedido.
function credenciales(req) {
  const h = (req && req.headers) || {};
  const oidc = h['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  const storeId = process.env.BLOB_STORE_ID;
  if (oidc && storeId) return { oidcToken: oidc, storeId };
  if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
  return {};
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Método no permitido' });
      return;
    }

    const { issueSignedToken } = await import('@vercel/blob');
    const { handleUploadPresigned } = await import('@vercel/blob/client');

    const cred = credenciales(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const respuesta = await handleUploadPresigned({
      body,
      request: req,
      getSignedToken: async (pathname, clientPayload) => {
        // Puerta simple: el editor manda la misma clave que usa para entrar.
        // Se compara contra una variable de entorno del proyecto, así la
        // clave real nunca viaja dentro del HTML público.
        const esperada = process.env.EDITOR_UPLOAD_KEY;
        if (esperada) {
          let dada = null;
          try { dada = JSON.parse(clientPayload || '{}').clave; } catch (e) {}
          if (dada !== esperada) throw new Error('No autorizado');
        }

        const token = await issueSignedToken({
          ...cred,
          pathname,
          operations: ['put'],
          allowedContentTypes: TIPOS,
          maximumSizeInBytes: 60 * 1024 * 1024,   // 60 MB por archivo
          validUntil: Date.now() + 60 * 60 * 1000
        });

        return {
          token,
          urlOptions: {
            allowedContentTypes: TIPOS,
            maximumSizeInBytes: 60 * 1024 * 1024,
            addRandomSuffix: true,
            allowOverwrite: false,
            cacheControlMaxAge: 30 * 24 * 60 * 60,
            validUntil: Date.now() + 30 * 60 * 1000
          }
        };
      }
      // Sin onUploadCompleted: no hay base de datos que actualizar. La URL
      // vuelve al editor y se guarda dentro del propio modelo de card.
    });

    res.status(200).json(respuesta);
  } catch (e) {
    const msg = String((e && e.message) || e);
    try {
      const cred = credenciales(req);
      res.status(msg === 'No autorizado' ? 401 : 400).json({
        error: msg,
        credencial: cred.oidcToken ? 'oidc' : (cred.token ? 'token' : 'ninguna')
      });
    } catch (e2) {
      res.statusCode = 500;
      res.end('Error: ' + msg);
    }
  }
}
