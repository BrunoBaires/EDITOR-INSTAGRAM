// Puente para traer archivos que el navegador no puede bajar por su cuenta.
//
// Un <video src="https://video.twimg.com/…"> reproduce sin problema, porque los
// elementos multimedia no piden permiso de origen cruzado. Pero fetch() sí lo
// pide, y X no lo da: por eso el editor podía MOSTRAR el video del post y no
// podía DESCARGARLO. Esta función lo baja del lado del servidor y lo devuelve
// con el permiso puesto.
//
// Corre como Edge Function para poder ir pasando el archivo de a pedazos, sin
// juntarlo entero en memoria ni chocar con el límite de tamaño de respuesta.

export const config = { runtime: 'edge' };

// Solo estos dominios. Si no, sería un proxy abierto para cualquiera.
const PERMITIDOS = [
  'video.twimg.com',
  'pbs.twimg.com',
  'abs.twimg.com',
  'api.fxtwitter.com',
  'api.vxtwitter.com',
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

export default async function handler(request) {
  const url = new URL(request.url).searchParams.get('url');

  if (!url) return new Response('Falta el parámetro url', { status: 400 });
  if (!permitido(url)) return new Response('Dominio no permitido', { status: 403 });

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
    return new Response('No se pudo alcanzar el origen: ' + e.message, { status: 502 });
  }

  if (!upstream.ok) {
    return new Response('El origen respondió ' + upstream.status, { status: upstream.status });
  }

  // Se devuelve el cuerpo tal cual, en streaming, con el permiso de origen.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
