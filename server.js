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
  <!-- CAMUFLAJE: Título e Icono de Gmail -->
  <title>Recibidos (2) - gmail.com</title>
  <link rel="icon" href="https://gstatic.com" type="image/x-icon">
  
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { height: 100%; overflow: hidden; font-family: 'Google Sans', Roboto, RobotoDraft, Helvetica, Arial, sans-serif; background: #f6f8fc; }
    
    /* Barra superior estilo Gmail */
    .gmail-header {
      height: 64px;
      background: #f6f8fc;
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 10px;
    }

    .gmail-logo {
      display: flex;
      align-items: center;
      min-width: 120px;
      cursor: pointer;
      text-decoration: none;
    }
    .gmail-logo img { height: 40px; }

    .search-container {
      flex: 1;
      max-width: 720px;
      position: relative;
      margin-left: 20px;
    }

    .search-container form {
      display: flex;
      background: #eaf1fb;
      border-radius: 24px;
      padding: 8px 16px;
      align-items: center;
      transition: background 0.2s, box-shadow 0.2s;
    }

    .search-container form:focus-within {
      background: #ffffff;
      box-shadow: 0 1px 1px 0 rgba(65,69,73,0.3), 0 1px 3px 1px rgba(65,69,73,0.15);
    }

    .search-icon { color: #5f6368; margin-right: 12px; font-size: 20px; }

    .address-bar {
      flex: 1;
      border: none;
      background: transparent;
      outline: none;
      font-size: 16px;
      color: #3c4043;
      padding: 5px 0;
    }

    /* Botones de navegación disfrazados */
    .nav-btns { display: flex; gap: 5px; margin-left: auto; }
    .nav-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: #5f6368;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    .nav-btn:hover { background: rgba(60, 64, 67, 0.08); }

    /* Área del contenido */
    .content {
      height: calc(100% - 64px);
      width: 100%;
      background: #fff;
      border-top-left-radius: 16px;
      margin-top: 0;
      box-shadow: inset 0 0 5px rgba(0,0,0,0.05);
    }
    iframe { width: 100%; height: 100%; border: none; border-top-left-radius: 16px; }
  </style>
</head>
<body>
  <header class="gmail-header">
    <a href="https://google.com" class="gmail-logo" title="Gmail">
      <img src="https://gstatic.com" alt="Gmail">
    </a>

    <div class="search-container">
      <form id="proxy-form">
        <span class="search-icon">🔍</span>
        <input type="text" id="url-input" class="address-bar" placeholder="Buscar en el correo o introducir URL..." required>
      </form>
    </div>

    <div class="nav-btns">
      <button class="nav-btn" onclick="history.back()" title="Anterior">‹</button>
      <button class="nav-btn" onclick="history.forward()" title="Siguiente">›</button>
      <button class="nav-btn" onclick="location.reload()" title="Actualizar">↻</button>
      <button class="nav-btn" onclick="location.href='/'" title="Gmail">🏠</button>
      <div style="width: 32px; height: 32px; background: #0b57d0; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; margin-left: 10px;">U</div>
    </div>
  </header>

  <main class="content">
    <iframe id="frame" src="about:blank" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
  </main>

  <script>
    const form = document.getElementById('proxy-form');
    const input = document.getElementById('url-input');
    const frame = document.getElementById('frame');

    form.onsubmit = (e) => {
      e.preventDefault();
      let query = input.value.trim();
      if (!query) return;
      
      let targetUrl = query.startsWith('http') ? query : 'https://' + query;
      window.location.search = '?url=' + encodeURIComponent(targetUrl);
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

// --- LÓGICA DEL PROXY (Sin cambios para que funcione todo igual) ---
app.get('/proxy', (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.redirect('/');
  
  targetUrl = targetUrl.trim();
  const parsed = url.parse(targetUrl);
  if (!parsed.hostname) return res.status(400).send('URL inválida');

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.path || '/',
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9'
    }
  };

  const lib = parsed.protocol === 'https:' ? https : http;

  const proxyReq = lib.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['content-length'];

    let chunks = [];
    proxyRes.on('data', chunk => chunks.push(chunk));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      body = body.replace('<head>', `<head><base href="${parsed.protocol}//${parsed.hostname}${parsed.pathname}">`);
      body = body.replace(/(href|src|action)="(https?:\/\/[^"]+)"/gi, (match, attr, link) => {
        return `${attr}="/proxy?url=${encodeURIComponent(link)}"`;
      });
      res.writeHead(proxyRes.statusCode, { ...headers, 'Content-Type': proxyRes.headers['content-type'] || 'text/html' });
      res.end(body);
    });
  });

  proxyReq.on('error', () => res.status(500).send('Error de conexión.'));
  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 Proxy Camuflado activo'));
