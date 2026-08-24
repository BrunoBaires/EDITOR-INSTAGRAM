// Almacén compartido de templates y cards modelo.
//
// No es una base de datos: son dos archivos JSON guardados en Vercel Blob,
// que el editor lee y escribe. Para un puñado de templates alcanza y sobra,
// y usa el mismo almacén que los videos.
//
//   GET  /api/store?c=templates   → devuelve la lista
//   POST /api/store?c=templates   → {item:{...}} agrega o reemplaza por nombre
//                                   {borrar:"nombre"} saca uno
//
// Guardar manda UN template, no la lista entera: así dos personas que guardan
// al mismo tiempo no se pisan lo del otro.
//
// Requiere un Blob store conectado al proyecto (crea BLOB_READ_WRITE_TOKEN).

// Corre como Edge Function. Sin esta línea, Vercel la trata como función
// de Node, que usa otra forma de recibir el pedido y responder, y falla
// con error 500.
export const config = { runtime: 'edge' };

import { put, list } from '@vercel/blob';

const COLECCIONES = { templates: 'store/templates.json', cards: 'store/cards-modelo.json' };

function rutaDe(c) {
  return COLECCIONES[c] || null;
}

// Lee la lista. Si el archivo todavía no existe, devuelve vacío.
async function leer(ruta) {
  const { blobs } = await list({ prefix: ruta, limit: 1 });
  const b = blobs.find(x => x.pathname === ruta);
  if (!b) return [];
  const r = await fetch(b.url, { cache: 'no-store' });
  if (!r.ok) return [];
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}

async function escribir(ruta, lista) {
  await put(ruta, JSON.stringify(lista, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0
  });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export default async function handler(request) {
  const url = new URL(request.url);
  const ruta = rutaDe(url.searchParams.get('c'));
  if (!ruta) return json({ error: 'Colección desconocida' }, 400);

  if (request.method === 'GET') {
    try {
      return json(await leer(ruta));
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Cuerpo inválido' }, 400); }

    // Misma puerta que las subidas: el editor manda su clave y se compara
    // contra una variable de entorno del proyecto.
    const esperada = process.env.EDITOR_UPLOAD_KEY;
    if (esperada && body.clave !== esperada) return json({ error: 'No autorizado' }, 401);

    try {
      const lista = await leer(ruta);

      if (body.borrar) {
        const quedan = lista.filter(t => t && t.nombre !== body.borrar);
        await escribir(ruta, quedan);
        return json({ ok: true, total: quedan.length, lista: quedan });
      }

      const item = body.item;
      if (!item || !item.nombre) return json({ error: 'Falta el item o su nombre' }, 400);

      const i = lista.findIndex(t => t && t.nombre === item.nombre);
      if (i >= 0) lista[i] = item; else lista.push(item);

      await escribir(ruta, lista);
      return json({ ok: true, total: lista.length, lista });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: 'Método no permitido' }, 405);
}
