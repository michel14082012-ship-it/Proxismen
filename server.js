const express = require('express');
const http = require('http');
const https = require('https');
const url = require('url');
const app = express();

// --- INTERFAZ DEL NAVEGADOR ---
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ultra Proxy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { height: 100%; overflow: hidden; font-family: 'Segoe UI', system-ui, sans-serif; background: #0f172a; }
    
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

    .view-container { height: calc(100% - 60px); width: 100%; background: #fff; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <header class="browser-bar">
    <div class="nav-buttons">
      <button class="btn" onclick="history.back()">←</button>
      <button class="btn" onclick="history.forward()">→</button>
      <button class="btn" onclick="document.getElementById('frame').contentWindow.location.reload()">↻</button>
      <a href="/" class="btn">🏠</a>
    </div>

    <form id="proxy-form">
      <input type="text" id="url-input" class="address-bar" placeholder="Escribe una URL o busca algo..." required>
      <button type="submit" class="btn btn-primary">IR</button>
    </form>
  </header>

  <div class="view-container">
    <iframe id="frame" src="about:blank" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
  </div>

  <script>
    const form = document.getElementById('proxy-form');
    const input = document.getElementById('url-input');
    const frame = document.getElementById('frame');

    // Manejar la navegación
    form.onsubmit = (e) => {
      e.preventDefault();
      let query = input.value.trim();
      let targetUrl = '';

      // Lógica de búsqueda: Si no tiene punto o no empieza por http, buscar en DuckDuckGo
      if (!query.includes('.') || (!query.startsWith('http') && !query.includes('/'))) {
        targetUrl = 'https://duckduckgo.com' + encodeURIComponent(query);
      } else {
        targetUrl = query.startsWith('http') ? query : 'https://' + query;
      }
      
      window.location.search = '?url=' + encodeURIComponent(targetUrl);
    };

    // Cargar URL desde parámetros
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get('url');
    if (urlParam) {
      input.value = urlParam;
      frame.src = '/proxy?url=' + encodeURIComponent(urlParam);
    }
  </script>
</body>
</html>`);
});

// --- LÓGICA DEL PROXY ---
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
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9'
    }
  };

  const lib = parsed.protocol === 'https:' ? https : http;

  const proxyReq = lib.request(options, (proxyRes) => {
    // Clonamos cabeceras y eliminamos las de seguridad para evitar bloqueos
    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['content-length'];

    let chunks = [];
    proxyRes.on('data', chunk => chunks.push(chunk));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      
      // Reescritura de enlaces para que sigan usando el proxy
      body = body.replace(/(href|src|action)="(https?:\/\/[^"]+)"/gi, (match, attr, link) => {
        return `${attr}="/proxy?url=${encodeURIComponent(link)}"`;
      });

      // Inyectar base para recursos relativos
      body = body.replace('<head>', `<head><base href="${targetUrl}">`);
      
      res.writeHead(proxyRes.statusCode, {
        ...headers,
        'Content-Type': proxyRes.headers['content-type'] || 'text/html',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(body);
    });
  });

  proxyReq.on('error', (e) => {
    res.status(500).send(`<h2>Error de proxy: ${e.message}</h2><a href="/">Volver</a>`);
  });

  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 Proxy corriendo en puerto ' + PORT));
