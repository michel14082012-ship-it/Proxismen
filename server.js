const express = require('express');
const https = require('https');
const http = require('http');
const url = require('url');
const app = express();

const CLAVE_SECRETA = "777"; // Cambia esto por tu código

app.get('/', (req, res) => {
  const query = req.query.search;

  // SI ESCRIBES LA CLAVE: Se abre el Proxy
  if (query === CLAVE_SECRETA) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Recibidos (2) - gmail.com</title>
        <link rel="icon" href="https://gstatic.com">
        <style>
          body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #f6f8fc; font-family: sans-serif; }
          .bar { height: 55px; display: flex; align-items: center; padding: 0 20px; background: #f6f8fc; border-bottom: 1px solid #ddd; }
          input { flex: 1; padding: 10px 20px; border-radius: 24px; border: 1px solid #dfe1e5; background: #eaf1fb; outline: none; font-size: 14px; }
          .view { height: calc(100% - 55px); background: #000; }
          iframe { width: 100%; height: 100%; border: none; }
        </style>
      </head>
      <body>
        <div class="bar">
          <form style="flex:1; display:flex;" onsubmit="event.preventDefault(); location.href='?search=${CLAVE_SECRETA}&url=' + encodeURIComponent(document.getElementById('u').value)">
            <input id="u" type="text" placeholder="Introducir URL para navegar..." required>
          </form>
        </div>
        <div class="view">
          <iframe src="${req.query.url ? '/proxy?url=' + encodeURIComponent(req.query.url) : 'about:blank'}" allow="fullscreen; autoplay; geolocation"></iframe>
        </div>
      </body>
      </html>
    `);
  }

  // SI ESCRIBES CUALQUIER OTRA COSA (o no hay búsqueda): Mostrar Wikipedia Real (Copia Visual)
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Wikipedia, la enciclopedia libre</title>
      <style>
        body { font-family: sans-serif; margin: 0; color: #202122; background: #fff; }
        .w-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 30px; border-bottom: 1px solid #a2a9b1; background: #f6f6f6; }
        .w-logo { display: flex; align-items: center; gap: 10px; font-weight: bold; font-size: 18px; }
        .w-search { display: flex; gap: 0; }
        .w-search input { padding: 8px; border: 1px solid #a2a9b1; width: 300px; }
        .w-search button { padding: 8px 15px; background: #3675ee; color: white; border: 1px solid #3675ee; cursor: pointer; }
        .w-content { padding: 40px 100px; max-width: 900px; }
        h1 { border-bottom: 1px solid #a2a9b1; padding-bottom: 5px; font-family: serif; font-size: 32px; }
        .w-nav { color: #0645ad; text-decoration: none; margin-right: 15px; font-size: 14px; }
        .w-box { border: 1px solid #a2a9b1; background: #f8f9fa; padding: 15px; float: right; width: 250px; margin-left: 20px; font-size: 13px; }
      </style>
    </head>
    <body>
      <div class="w-header">
        <div class="w-logo"><img src="https://wikipedia.org" width="40"> Wikipedia</div>
        <form class="w-search" action="/" method="get">
          <input type="text" name="search" placeholder="Buscar en Wikipedia">
          <button type="submit">Buscar</button>
        </form>
      </div>
      <div class="w-content">
        ${query ? `<h1>Error 404</h1><p>La página "<b>${query}</b>" no existe. <a href="/" class="w-nav">Volver a la página principal.</a></p>` : `
        <h1>Bienvenidos a Wikipedia</h1>
        <div class="w-box">
          <b>Artículo destacado</b><br><br>
          <img src="https://wikimedia.org" style="width:100%"><br>
          El álgebra lineal es una rama de las matemáticas que estudia conceptos tales como vectores y matrices.
        </div>
        <p><b>Wikipedia</b> es una enciclopedia libre, políglota y editada de manera colaborativa. Es administrada por la Fundación Wikimedia, una organización sin ánimo de lucro.</p>
        <p><a href="#" class="w-nav">Portada</a> <a href="#" class="w-nav">Actualidad</a> <a href="#" class="w-nav">Páginas nuevas</a></p>
        <h3>Efemérides</h3>
        <ul>
          <li>Se celebra el Día Mundial de las Telecomunicaciones.</li>
          <li>En 1749 nace Edward Jenner, médico inglés.</li>
        </ul>
        `}
      </div>
    </body>
    </html>
  `);
});

// --- LÓGICA DEL PROXY (WEBGL OK) ---
app.get('/proxy', (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.end();
  const parsed = url.parse(targetUrl);
  const options = {
    hostname: parsed.hostname, port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.path || '/', method: 'GET', rejectUnauthorized: false,
    headers: { 'User-Agent': 'Mozilla/5.0 Chrome/124.0.0.0', 'Referer': parsed.protocol + '//' + parsed.hostname + '/' }
  };
  const lib = parsed.protocol === 'https:' ? https : http;
  const proxyReq = lib.request(options, (proxyRes) => {
    if (.includes(proxyRes.statusCode)) return res.redirect('/proxy?url=' + encodeURIComponent(url.resolve(targetUrl, proxyRes.headers.location)));
    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options']; delete headers['content-security-policy'];
    if (!headers['content-type']?.includes('text/html')) { res.writeHead(proxyRes.statusCode, headers); return proxyRes.pipe(res); }
    let chunks = [];
    proxyRes.on('data', d => chunks.push(d));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      body = body.replace('<head>', `<head><base href="${parsed.protocol}//${parsed.hostname}${parsed.pathname}">`);
      res.writeHead(proxyRes.statusCode, { 'Content-Type': 'text/html' });
      res.end(body);
    });
  });
  proxyReq.on('error', () => res.end());
  proxyReq.end();
});

app.listen(process.env.PORT || 3000);
