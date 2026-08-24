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
// AUTENTICACIÓN. Vercel ya no entrega el token largo BLOB_READ_WRITE_TOKEN
// cuando conectás un store: usa OIDC, que da credenciales que se renuevan
// solas. Y —esto es lo que costó encontrar— dentro de una función el token
// OIDC NO viene en process.env: viene en el encabezado x-vercel-oidc-token
// del pedido. Por eso hay que leerlo de ahí y pasárselo a la librería junto
// con el id del store.
//
// La librería se carga con import() dinámico adentro del try: si se importa
// arriba de todo y falla, la función se cae antes del try y Vercel devuelve un
// 500 mudo (FUNCTION_INVOCATION_FAILED) sin decir por qué.

const COLECCIONES = {
  templates: 'store/templates.json',
  cards: 'store/cards-modelo.json'
};

// Credenciales, en el orden en que conviene probarlas.
function credenciales(req) {
  const h = (req && req.headers) || {};
  const oidc = h['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  const storeId = process.env.BLOB_STORE_ID;
  if (oidc && storeId) return { oidcToken: oidc, storeId };
  if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
  return {};
}

let _blob = null;
async function blob() {
  if (!_blob) _blob = await import('@vercel/blob');
  return _blob;
}

async function leer(ruta, cred) {
  const { list } = await blob();
  const { blobs } = await list({ ...cred, prefix: ruta, limit: 1 });
  const b = blobs.find(x => x.pathname === ruta);
  if (!b) return [];
  const r = await fetch(b.url + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) return [];
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}

async function escribir(ruta, lista, cred) {
  const { put } = await blob();
  await put(ruta, JSON.stringify(lista, null, 2), {
    ...cred,
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

    const cred = credenciales(req);

    if (req.method === 'GET') {
      res.status(200).json(await leer(ruta, cred));
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

      const lista = await leer(ruta, cred);

      if (body.borrar) {
        const quedan = lista.filter(t => t && t.nombre !== body.borrar);
        await escribir(ruta, quedan, cred);
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

      await escribir(ruta, lista, cred);
      res.status(200).json({ ok: true, total: lista.length, lista });
      return;
    }

    res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    // El mensaje real va en la respuesta, para poder diagnosticar sin logs.
    try {
      const cred = credenciales(req);
      res.status(500).json({
        error: String((e && e.message) || e),
        donde: (e && e.stack) ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null,
        credencial: cred.oidcToken ? 'oidc' : (cred.token ? 'token' : 'ninguna')
      });
    } catch (e2) {
      res.statusCode = 500;
      res.end('Error: ' + String((e && e.message) || e));
    }
  }
}
