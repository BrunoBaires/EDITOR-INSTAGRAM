// Puente para traer archivos que el navegador no puede bajar por su cuenta.
//
// Un <video src="https://video.twimg.com/…"> reproduce sin problema, porque los
// elementos multimedia no piden permiso de origen cruzado. Pero fetch() sí lo
// pide, y X no lo da: por eso el editor podía MOSTRAR el video del post y no
// podía DESCARGARLO. Esta función lo baja del lado del servidor y lo devuelve
// con el permiso puesto.
//
// Corre como función de Node, igual que el resto de /api. (Antes era una Edge
// Function; desde que el proyecto declara @vercel/blob como dependencia, el
// empaquetador de Edge intenta meter módulos de Node acá adentro y el build
// falla. Node no tiene ese problema.)
//
// El archivo se va pasando de a pedazos, sin juntarlo entero en memoria.

import { Readable } from 'node:stream';

// Solo estos dominios. Si no, sería un proxy abierto para cualquiera.
const PERMITIDOS = [
  'video.twimg.com',
  'pbs.twimg.com',
  'abs.twimg.com',
  'api.fxtwitter.com',
  'api.vxtwitter.com',
  'blob.vercel-storage.com',
  'public.blob.vercel-storage.com',
  'images.clarin.com',
  'www.clarin.com',
  'clarin.com'
];

function permitido(u) {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return PERMITIDOS.some(d => h === d || h.endsWith('.' + d));
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  const url = req.query && req.query.url;

  if (!url) { res.status(400).send('Falta el parámetro url'); return; }
  if (!permitido(url)) { res.status(403).send('Dominio no permitido'); return; }

  let upstream;
  try {
    upstream = await fetch(url, {
      headers: {
        // Sin un user-agent normal, algunos servidores devuelven 403.
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': '*/*'
      }
    });
  } catch (e) {
    res.status(502).send('No se pudo alcanzar el origen: ' + ((e && e.message) || e));
    return;
  }

  if (!upstream.ok) {
    res.status(upstream.status).send('El origen respondió ' + upstream.status);
    return;
  }

  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const largo = upstream.headers.get('content-length');
  if (largo) res.setHeader('Content-Length', largo);

  if (!upstream.body) { res.status(204).end(); return; }

  // Se va escribiendo a medida que llega, en vez de acumularlo en memoria.
  try {
    await new Promise((ok, mal) => {
      const flujo = Readable.fromWeb(upstream.body);
      flujo.on('error', mal);
      res.on('error', mal);
      res.on('close', ok);
      flujo.pipe(res);
    });
  } catch (e) {
    if (!res.headersSent) res.status(502).send('Se cortó la descarga: ' + ((e && e.message) || e));
    else res.end();
  }
}
