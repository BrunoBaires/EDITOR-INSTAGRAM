// Almacén compartido de templates y cards modelo.
//
// No es una base de datos: son dos archivos JSON guardados en Vercel Blob,
// que el editor lee y escribe.
//
//   GET  /api/store?c=templates   → devuelve la lista
//   POST /api/store?c=templates   → {item:{...}} agrega o reemplaza por nombre
//                                   {borrar:"nombre"} saca uno
//
// Guardar manda UN template, no la lista entera: así dos personas que guardan
// al mismo tiempo no se pisan lo del otro.
//
// Escrita como función de Node (req, res), que es la forma que Vercel usa por
// defecto en la carpeta /api de un sitio estático.
//
// Ojo con los import: si @vercel/blob se importa arriba de todo y falla al
// cargar (no instalada, versión que no corresponde), la función se cae ANTES de
// llegar al try y Vercel devuelve el 500 genérico —FUNCTION_INVOCATION_FAILED—
// sin decir por qué. Por eso la librería se carga adentro del try, con import()
// dinámico: así cualquier problema vuelve como texto legible.

const COLECCIONES = {
  templates: 'store/templates.json',
  cards: 'store/cards-modelo.json'
};

let _blob = null;
async function blob() {
  if (!_blob) _blob = await import('@vercel/blob');
  return _blob;
}

async function leer(ruta) {
  const { list } = await blob();
  const { blobs } = await list({ prefix: ruta, limit: 1 });
  const b = blobs.find(x => x.pathname === ruta);
  if (!b) return [];
  const r = await fetch(b.url + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) return [];
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}

async function escribir(ruta, lista) {
  const { put } = await blob();
  await put(ruta, JSON.stringify(lista, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0
  });
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');

    const c = (req.query && req.query.c) || '';
    const ruta = COLECCIONES[c];
    if (!ruta) {
      res.status(400).json({ error: 'Colección desconocida: ' + c });
      return;
    }

    if (req.method === 'GET') {
      res.status(200).json(await leer(ruta));
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      // Puerta simple: el editor manda su clave y se compara contra una
      // variable de entorno del proyecto.
      const esperada = process.env.EDITOR_UPLOAD_KEY;
      if (esperada && body.clave !== esperada) {
        res.status(401).json({ error: 'No autorizado' });
        return;
      }

      const lista = await leer(ruta);

      if (body.borrar) {
        const quedan = lista.filter(t => t && t.nombre !== body.borrar);
        await escribir(ruta, quedan);
        res.status(200).json({ ok: true, total: quedan.length, lista: quedan });
        return;
      }

      const item = body.item;
      if (!item || !item.nombre) {
        res.status(400).json({ error: 'Falta el item o su nombre' });
        return;
      }

      const i = lista.findIndex(t => t && t.nombre === item.nombre);
      if (i >= 0) lista[i] = item; else lista.push(item);

      await escribir(ruta, lista);
      res.status(200).json({ ok: true, total: lista.length, lista });
      return;
    }

    res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    // El mensaje real va en la respuesta, para poder diagnosticar sin logs.
    try {
      res.status(500).json({
        error: String((e && e.message) || e),
        donde: (e && e.stack) ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null,
        hayToken: !!process.env.BLOB_READ_WRITE_TOKEN
      });
    } catch (e2) {
      res.statusCode = 500;
      res.end('Error: ' + String((e && e.message) || e));
    }
  }
}
