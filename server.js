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
  <title>Proxy Pro</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { height: 100%; overflow: hidden; font-family: 'Segoe UI', system-ui, sans-serif; background: #0f172a; }
    
    /* Barra de Navegación Estilo Browser */
    .browser-bar {
      height: 60px;
      background: #1e293b;
      display: flex;
      align-items: center;
      padding: 0 15px;
      gap: 12px;
      border-bottom: 1px solid #334155;
      z-index: 100;
    }

    .nav-buttons { display: flex; gap: 8px; }
    
    .btn {
      background: #334155;
      border: none;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 18px;
      transition: 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
    }
    .btn:hover { background: #475569; }
    .btn-primary { background: #38bdf8; color: #0f172a; font-weight: bold; font-size: 14px; }
    .btn-primary:hover { background: #7dd3fc; }

    form { flex: 1; display: flex; gap: 8px; }
    
    .address-bar {
      flex: 1;
      padding: 10px 16px;
      border-radius: 20px;
      border: 1px solid #475569;
      background: #0f172a;
      color: #e2e8f0;
      outline: none;
      font-size: 14px;
    }
    .address-bar:focus { border-color: #38bdf8; box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2); }

    /* Contenedor del Iframe */
    .view-container {
      height: calc(100% - 60px);
      width: 100%;
      background: #fff;
    }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <header class="browser-bar">
    <div class="nav-buttons">
      <button class="btn" onclick="history.back()" title="Atrás">←</button>
      <button class="btn" onclick="history.forward()" title="Adelante">→</button>
      <button class="btn" onclick="document.getElementById('frame').contentWindow.location.reload()" title="Recargar">↻</button>
      <a href="/" class="btn" title="Inicio">🏠</a>
    </div>

    <form action="/" method="get">
      <input type="text" name="url" class="address-bar" placeholder="Busca o escribe una URL..." required>
      <button type="submit" class="btn btn-primary">IR</button>
    </form>
  </header>

  <div class="view-container">
    <iframe id="frame" src="about:blank" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
  </div>

  <script>
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get('url');
    const frame = document.getElementById('frame');
    const input = document.querySelector('.address-bar');

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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    }
  };

  const lib = parsed.protocol === 'https:' ? https : http;

  const proxyReq = lib.request(options, (proxyRes) => {
    let chunks = [];
    proxyRes.on('data', chunk => chunks.push(chunk));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      
      // Reescritura avanzada de URLs para navegación continua
      body = body.replace(/(href|src|action)="(https?:\/\/[^"]+)"/gi, (match, attr, link) => {
        return `${attr}="/proxy?url=${encodeURIComponent(link)}"`;
      });

      // Inyección de Base URL para que las rutas relativas funcionen
      body = body.replace('<head>', `<head><base href="${targetUrl}">`);
      
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'text/html',
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': "frame-ancestors *"
      });
      res.end(body);
    });
  });

  proxyReq.on('error', (e) => {
    res.status(500).send(`
      <div style="background:#0f172a; color:white; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif;">
        <h1>⚠️ Error de Conexión</h1>
        <p>${e.message}</p>
        <br>
        <a href="/" style="color:#38bdf8; text-decoration:none; border:1px solid #38bdf8; padding:10px 20px; border-radius:5px;">Volver al inicio</a>
      </div>
    `);
  });

  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor Proxy listo en puerto ' + PORT));
