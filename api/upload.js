// Ruta que autoriza las subidas de archivos al almacén del equipo.
//
// El archivo NO pasa por acá: el navegador lo manda directo a Vercel Blob.
// Esta función solo entrega el permiso, y por eso puede aceptar videos
// grandes sin chocar con el límite de tamaño de las funciones.
//
// Escrita como función de Node (req, res), igual que store.js. La librería se
// carga con import() dinámico adentro del try, para que un problema al cargarla
// vuelva como mensaje legible y no como un 500 sin explicación.

const TIPOS = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif',
  'video/webm', 'video/mp4', 'video/quicktime'
];

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Método no permitido' });
      return;
    }

    const { handleUpload } = await import('@vercel/blob/client');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const respuesta = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const esperada = process.env.EDITOR_UPLOAD_KEY;
        if (esperada) {
          let dada = null;
          try { dada = JSON.parse(clientPayload || '{}').clave; } catch (e) {}
          if (dada !== esperada) throw new Error('No autorizado');
        }
        return {
          allowedContentTypes: TIPOS,
          addRandomSuffix: true,
          maximumSizeInBytes: 60 * 1024 * 1024
        };
      },
      onUploadCompleted: async () => {
        // Nada que hacer: la URL vuelve al editor y se guarda en el modelo.
      }
    });
    res.status(200).json(respuesta);
  } catch (e) {
    try {
      res.status(400).json({
        error: String((e && e.message) || e),
        hayToken: !!process.env.BLOB_READ_WRITE_TOKEN
      });
    } catch (e2) {
      res.statusCode = 500;
      res.end('Error: ' + String((e && e.message) || e));
    }
  }
}
