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
          .view { height: calc(100% - 55px); background: #fff; }
          iframe { width: 100%; height: 100%; border: none; }
        </style>
      </head>
      <body>
        <div class="bar">
          <form style="flex:1; display:flex;" onsubmit="event.preventDefault(); location.href='?search=${CLAVE_SECRETA}&url=' + encodeURIComponent(document.getElementById('u').value)">
            <input id="u" type="text" placeholder="URL completa (ej: https://duckduckgo.com)" required>
          </form>
        </div>
        <div class="view">
          <iframe src="${req.query.url ? '/proxy?url=' + encodeURIComponent(req.query.url) : 'about:blank'}" allow="fullscreen; autoplay; geolocation; microphone; camera"></iframe>
        </div>
      </body>
      </html>
    `);
  }
  // Interfaz Wikipedia (Camuflaje)
  res.send('<!DOCTYPE html><html><head><title>Wikipedia</title></head><body style="font-family:sans-serif;padding:50px;"><h1>Bienvenidos a Wikipedia</h1><form action="/" method="get"><input type="text" name="search" placeholder="Buscar..."></form></body></html>');
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
      'Referer': parsed.protocol + '//' + parsed.hostname + '/'
    }
  };

  const lib = parsed.protocol === 'https:' ? https : http;
  const proxyReq = lib.request(options, (proxyRes) => {
    // Manejo de redirecciones
    if ([301, 302, 307, 308].includes(proxyRes.statusCode)) {
      let newLoc = url.resolve(targetUrl, proxyRes.headers.location);
      return res.redirect('/proxy?url=' + encodeURIComponent(newLoc));
    }

    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['content-length'];

    // Si no es HTML (CSS, JS, Imágenes), lo servimos directo
    if (!headers['content-type']?.includes('text/html')) {
      res.writeHead(proxyRes.statusCode, headers);
      return proxyRes.pipe(res);
    }

    let chunks = [];
    proxyRes.on('data', d => chunks.push(d));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      
      // REESCRITURA CRÍTICA: Convierte rutas relativas en absolutas a través del proxy
      body = body.replace(/(href|src|action)="(?!data:)(?!javascript:)([^"]+)"/gi, (match, attr, link) => {
        let abs = url.resolve(targetUrl, link);
        return `${attr}="/proxy?url=${encodeURIComponent(abs)}"`;
      });

      body = body.replace('<head>', `<head><base href="${targetUrl}">`);
      res.writeHead(proxyRes.statusCode, { 'Content-Type': 'text/html' });
      res.end(body);
    });
  });

  proxyReq.on('error', () => res.status(500).send("Error de carga."));
  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT);
