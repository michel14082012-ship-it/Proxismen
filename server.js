const express = require('express');
const http = require('http');
const https = require('https');
const url = require('url');
const app = express();

// --- INTERFAZ CON CAMUFLAJE DE PESTAÑA ---
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- CAMUFLAJE EXTERNO: Título e Icono que se ve en la pestaña -->
  <title>Recibidos (2) - gmail</title>
  <link rel="icon" href="https://gstatic.com" type="image/x-icon">
  
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { height: 100%; overflow: hidden; font-family: sans-serif; background: #0f172a; }
    
    /* Barra de búsqueda simple y profesional */
    .browser-bar {
      height: 50px;
      background: #1e293b;
      display: flex;
      align-items: center;
      padding: 0 15px;
      gap: 10px;
      border-bottom: 1px solid #334155;
    }

    form { flex: 1; display: flex; gap: 8px; }
    
    .address-bar {
      flex: 1;
      padding: 8px 15px;
      border-radius: 6px;
      border: 1px solid #475569;
      background: #0f172a;
      color: #fff;
      outline: none;
      font-size: 14px;
    }

    .btn {
      background: #38bdf8;
      border: none;
      color: #0f172a;
      padding: 8px 15px;
      border-radius: 6px;
      font-weight: bold;
      cursor: pointer;
    }

    .nav-btn {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 20px;
      cursor: pointer;
    }

    /* Iframe a pantalla completa debajo de la barra */
    .view-container {
      height: calc(100% - 50px);
      width: 100%;
      background: #fff;
    }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <header class="browser-bar">
    <button class="nav-btn" onclick="history.back()">←</button>
    <button class="nav-btn" onclick="history.forward()">→</button>
    <form id="proxy-form">
      <input type="text" id="url-input" class="address-bar" placeholder="Introduce URL..." required>
      <button type="submit" class="btn">IR</button>
    </form>
    <button class="nav-btn" onclick="location.href='/'">🏠</button>
  </header>

  <div class="view-container">
    <iframe id="frame" src="about:blank"></iframe>
  </div>

  <script>
    const form = document.getElementById('proxy-form');
    const input = document.getElementById('url-input');
    const frame = document.getElementById('frame');

    form.onsubmit = (e) => {
      e.preventDefault();
      let query = input.value.trim();
      let target = query.startsWith('http') ? query : 'https://' + query;
      window.location.search = '?url=' + encodeURIComponent(target);
    };

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

// --- LÓGICA DEL PROXY REFORZADA ---
app.get('/proxy', (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.end();

  const parsed = url.parse(targetUrl);
  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.path || '/',
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'es-ES,es;q=0.9',
      'Referer': parsed.protocol + '//' + parsed.hostname + '/'
    }
  };

  const lib = parsed.protocol === 'https:' ? https : http;

  const proxyReq = lib.request(options, (proxyRes) => {
    // Manejo de redirecciones automáticas
    if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
      let newUrl = proxyRes.headers.location;
      if (!newUrl.startsWith('http')) newUrl = url.resolve(targetUrl, newUrl);
      return res.redirect('/proxy?url=' + encodeURIComponent(newUrl));
    }

    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['content-length'];

    let chunks = [];
    proxyRes.on('data', chunk => chunks.push(chunk));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      
      // Inyectar base para recursos relativos y reescribir enlaces
      body = body.replace('<head>', `<head><base href="${parsed.protocol}//${parsed.hostname}${parsed.pathname}">`);
      body = body.replace(/(href|src|action)="(https?:\/\/[^"]+)"/gi, (match, attr, link) => {
        return `${attr}="/proxy?url=${encodeURIComponent(link)}"`;
      });

      res.writeHead(proxyRes.statusCode, {
        ...headers,
        'Content-Type': proxyRes.headers['content-type'] || 'text/html',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(body);
    });
  });

  proxyReq.on('error', () => res.status(500).send('Error de conexión.'));
  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Proxy Camuflado Externo en puerto ' + PORT));
