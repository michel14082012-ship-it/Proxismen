const express = require('express');
const http = require('http');
const https = require('https');
const url = require('url');
const app = express();

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Navegador Proxy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { 
      height: 100%; 
      overflow: hidden; 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #0f172a;
    }
    /* Barra de herramientas superior */
    .navbar {
      height: 60px;
      background: #1e293b;
      display: flex;
      align-items: center;
      padding: 0 20px;
      gap: 15px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      z-index: 10;
      position: relative;
    }
    .logo { color: #38bdf8; font-weight: bold; font-size: 20px; text-decoration: none; }
    form { flex: 1; display: flex; gap: 10px; }
    input[type="text"] {
      flex: 1;
      padding: 10px 15px;
      border-radius: 8px;
      border: 1px solid #334155;
      background: #0f172a;
      color: #f8fafc;
      outline: none;
    }
    input[type="text"]:focus { border-color: #38bdf8; }
    button {
      padding: 10px 20px;
      background: #38bdf8;
      color: #0f172a;
      border: none;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
    }
    button:hover { background: #7dd3fc; }
    
    /* Contenedor del Iframe - Pantalla Completa */
    .view-container {
      height: calc(100% - 60px);
      width: 100%;
      background: #fff;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <a href="/" class="logo">PROXY</a>
    <form action="/" method="get">
      <input type="text" name="url" placeholder="Introduce URL (ej: https://google.com)" required>
      <button type="submit">Ir</button>
    </form>
  </nav>

  <div class="view-container">
    <iframe id="frame" src="about:blank" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
  </div>

  <script>
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get('url');
    const frame = document.getElementById('frame');
    const input = document.querySelector('input');

    if (urlParam) {
      let target = urlParam;
      if (!target.startsWith('http')) target = 'https://' + target;
      
      input.value = target;
      frame.src = '/proxy?url=' + encodeURIComponent(target);
    }
  </script>
</body>
</html>`);
});

app.get('/proxy', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.redirect('/');
  
  const parsed = url.parse(targetUrl);
  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.path || '/',
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9'
    }
  };

  const lib = parsed.protocol === 'https:' ? https : http;

  const proxyReq = lib.request(options, (proxyRes) => {
    let chunks = [];
    proxyRes.on('data', chunk => chunks.push(chunk));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      
      // Reescritura para que los links internos sigan pasando por el proxy
      body = body.replace(/(href|src|action)="(https?:\/\/[^"]+)"/gi, (match, p1, p2) => {
        return `${p1}="/proxy?url=${encodeURIComponent(p2)}"`;
      });

      // Inyectar Base URL para recursos relativos
      body = body.replace('<head>', `<head><base href="${targetUrl}">`);
      
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'text/html',
        'X-Frame-Options': 'ALLOWALL' // Intenta evitar bloqueos de iframe
      });
      res.end(body);
    });
  });

  proxyReq.on('error', (e) => {
    res.status(500).send(`<h2>Error cargando sitio: ${e.message}</h2><a href="/">Volver</a>`);
  });

  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Navegador Proxy activo en puerto ' + PORT));
