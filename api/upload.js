// Ruta que autoriza las subidas al almacén de archivos del equipo.
//
// El archivo NO pasa por acá: el navegador lo manda directo a Vercel Blob.
// Esta función solo entrega el permiso para hacerlo, y por eso puede aceptar
// videos grandes sin chocar con el límite de 4,5 MB de las funciones.
//
// Requiere que el proyecto tenga un Blob store conectado (Storage → Blob),
// que es lo que crea la variable BLOB_READ_WRITE_TOKEN.

// Corre como Edge Function. Sin esta línea, Vercel la trata como función
// de Node, que usa otra forma de recibir el pedido y responder, y falla
// con error 500.
export const config = { runtime: 'edge' };

import { handleUpload } from '@vercel/blob/client';

// Lo que se acepta subir. Cualquier otra cosa se rechaza.
const TIPOS = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif',
  'video/webm', 'video/mp4', 'video/quicktime'
];

export default async function handler(request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Método no permitido' }, { status: 405 });
  }

  const body = await request.json();

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Puerta simple: el editor manda la misma clave que usa para entrar.
        // Se compara contra una variable de entorno del proyecto, así la
        // clave real nunca viaja dentro del HTML público.
        const esperada = process.env.EDITOR_UPLOAD_KEY;
        if (esperada) {
          let dada = null;
          try { dada = JSON.parse(clientPayload || '{}').clave; } catch (e) {}
          if (dada !== esperada) throw new Error('No autorizado');
        }
        return {
          allowedContentTypes: TIPOS,
          addRandomSuffix: true,
          maximumSizeInBytes: 60 * 1024 * 1024   // 60 MB por archivo
        };
      },
      onUploadCompleted: async () => {
        // No hay base de datos que actualizar: la URL vuelve al editor y se
        // guarda dentro del propio modelo de card.
      }
    });
    return Response.json(jsonResponse);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
