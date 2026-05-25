const express = require('express');
const https = require('https');
const http = require('http');
const url = require('url');
const app = express();

const CLAVE_SECRETA = "777"; 

app.get('/', (req, res) => {
  const query = req.query.search;
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
          .view { height: calc(100% - 55px); background: #fff; } /* Fondo blanco para evitar el negro */
          iframe { width: 100%; height: 100%; border: none; }
        </style>
      </head>
      <body>
        <div class="bar">
          <form style="flex:1; display:flex;" onsubmit="event.preventDefault(); location.href='?search=${CLAVE_SECRETA}&url=' + encodeURIComponent(document.getElementById('u').value)">
            <input id="u" type="text" placeholder="Pega aquí la URL (ej: https://wikipedia.org)" required>
          </form>
        </div>
        <div class="view">
          <iframe src="${req.query.url ? '/proxy?url=' + encodeURIComponent(req.query.url) : 'about:blank'}" allow="fullscreen; autoplay; geolocation; microphone; camera"></iframe>
        </div>
      </body>
      </html>
    `);
  }

  // INTERFAZ WIKIPEDIA
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><title>Wikipedia</title><style>body{font-family:sans-serif;margin:0;color:#202122;background:#fff;}.h{display:flex;justify-content:space-between;align-items:center;padding:10px 30px;border-bottom:1px solid #a2a9b1;background:#f6f6f6;}.s input{padding:8px;border:1px solid #a2a9b1;width:250px;}.c{padding:40px 100px;max-width:900px;}h1{border-bottom:1px solid #a2a9b1;font-family:serif;}</style></head>
    <body>
      <div class="h"><div>Wikipedia</div><form class="s" action="/" method="get"><input type="text" name="search" placeholder="Buscar..."></form></div>
      <div class="c"><h1>Bienvenidos</h1><p>Wikipedia es una enciclopedia libre...</p></div>
    </body>
    </html>
  `);
});

app.get('/proxy', (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.end();
  if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

  const parsed = url.parse(targetUrl);
  const options = {
    hostname: parsed.hostname, 
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.path || '/', 
    method: 'GET', 
    rejectUnauthorized: false,
    headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': parsed.protocol + '//' + parsed.hostname + '/'
    }
  };

  const lib = parsed.protocol === 'https:' ? https : http;
  const proxyReq = lib.request(options, (proxyRes) => {
    // Redirecciones
    if ([301, 302, 307, 308].includes(proxyRes.statusCode)) {
        let newLocation = proxyRes.headers.location;
        if (!newLocation.startsWith('http')) newLocation = url.resolve(targetUrl, newLocation);
        return res.redirect('/proxy?url=' + encodeURIComponent(newLocation));
    }

    const headers = { ...proxyRes.headers };
    // ELIMINACIÓN AGRESIVA DE BLOQUEOS
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['content-length'];

    if (!headers['content-type']?.includes('text/html')) {
        res.writeHead(proxyRes.statusCode, headers);
        return proxyRes.pipe(res);
    }

    let chunks = [];
    proxyRes.on('data', d => chunks.push(d));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      // Inyectar BASE para que los archivos (CSS, JS) carguen desde el sitio real
      body = body.replace('<head>', `<head><base href="${parsed.protocol}//${parsed.hostname}${parsed.pathname}">`);
      
      // Intentar engañar a los scripts que detectan iframes
      body = body.replace('if (top !== self)', 'if (false)'); 
      
      res.writeHead(proxyRes.statusCode, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
      res.end(body);
    });
  });

  proxyReq.on('error', (e) => res.status(500).send("Error: " + e.message));
  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT);
