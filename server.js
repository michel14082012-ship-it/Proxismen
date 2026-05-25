const express = require('express');
const https = require('https');
const http = require('http');
const url = require('url');
const app = express();

// --- CONFIGURACIÓN SECRETA ---
const MI_CODIGO_SECRETO = "777"; // Cambia esto por lo que quieras

app.get('/', (req, res) => {
  const clave = req.query.key;

  // SI NO HAY CLAVE O ES INCORRECTA: Camuflaje total (Wikipedia)
  if (clave !== MI_CODIGO_SECRETO && !req.query.url) {
    return res.send(`
      <html>
        <head><title>Álgebra lineal - Wikipedia, la enciclopedia libre</title></head>
        <body style="font-family: sans-serif; padding: 50px; color: #333;">
          <h1>Álgebra lineal</h1>
          <p>El álgebra lineal es una rama de las matemáticas que estudia conceptos tales como vectores, matrices...</p>
          <hr>
          <p style="color: #888;">Contenido distribuido bajo licencia CC BY-SA 4.0.</p>
        </body>
      </html>
    `);
  }

  // SI LA CLAVE ES CORRECTA: Interfaz de Proxy secreta con Gmail Tab
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Recibidos (2) - gmail.com</title>
      <link rel="icon" href="https://gstatic.com">
      <style>
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #f6f8fc; }
        .bar { height: 50px; display: flex; align-items: center; padding: 0 15px; background: #f6f8fc; border-bottom: 1px solid #ddd; }
        input { flex: 1; padding: 8px 15px; border-radius: 20px; border: 1px solid #dfe1e5; background: #eaf1fb; outline: none; }
        .view { height: calc(100% - 50px); background: #000; }
        iframe { width: 100%; height: 100%; border: none; }
      </style>
    </head>
    <body>
      <div class="bar">
        <form style="flex:1; display:flex;" onsubmit="event.preventDefault(); location.href='?key=${MI_CODIGO_SECRETO}&url=' + encodeURIComponent(document.getElementById('u').value)">
          <input id="u" type="text" placeholder="URL para WebGL..." required>
        </form>
      </div>
      <div class="view">
        <iframe src="${req.query.url ? '/proxy?url=' + encodeURIComponent(req.query.url) : 'about:blank'}" allow="fullscreen; autoplay; geolocation"></iframe>
      </div>
    </body>
    </html>
  `);
});

// --- LÓGICA DE TÚNEL WEBGL ---
app.get('/proxy', (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.end();

  const parsed = url.parse(targetUrl);
  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.path || '/',
    method: 'GET',
    rejectUnauthorized: false,
    headers: { 'User-Agent': 'Mozilla/5.0 Chrome/124.0.0.0', 'Referer': parsed.protocol + '//' + parsed.hostname + '/' }
  };

  const lib = parsed.protocol === 'https:' ? https : http;
  const proxyReq = lib.request(options, (proxyRes) => {
    // Manejo de redirecciones
    if ([301, 302].includes(proxyRes.statusCode)) {
      return res.redirect('/proxy?url=' + encodeURIComponent(url.resolve(targetUrl, proxyRes.headers.location)));
    }

    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    
    // WebGL necesita que las texturas y datos carguen sin procesar
    if (!headers['content-type']?.includes('text/html')) {
      res.writeHead(proxyRes.statusCode, headers);
      return proxyRes.pipe(res);
    }

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
