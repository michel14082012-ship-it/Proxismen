const express = require('express');
const http = require('http');
const https = require('https');
const url = require('url');
const app = express();

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Proxy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: Arial, sans-serif; 
      background: #1a1a2e; 
      display: flex; 
      justify-content: center; 
      align-items: center; 
      min-height: 100vh;
    }
    .container {
      background: #16213e;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      width: 90%;
      max-width: 700px;
    }
    h1 { 
      color: #e94560; 
      text-align: center; 
      margin-bottom: 8px;
      font-size: 24px;
    }
    p { color: #a0a0b0; text-align: center; margin-bottom: 24px; font-size: 14px; }
    form { display: flex; gap: 10px; }
    input[type="text"] {
      flex: 1;
      padding: 14px 18px;
      border: 2px solid #0f3460;
      border-radius: 10px;
      background: #0f3460;
      color: #fff;
      font-size: 16px;
      outline: none;
      transition: 0.3s;
    }
    input[type="text"]:focus { border-color: #e94560; }
    input[type="text"]::placeholder { color: #6a6a8a; }
    button {
      padding: 14px 28px;
      background: #e94560;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      cursor: pointer;
      transition: 0.3s;
      white-space: nowrap;
    }
    button:hover { background: #d63850; transform: translateY(-1px); }
    iframe {
      margin-top: 24px;
      width: 100%;
      height: 500px;
      border: 2px solid #0f3460;
      border-radius: 10px;
      background: #fff;
    }
    @media (max-width: 500px) {
      form { flex-direction: column; }
      .container { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔓 Proxy</h1>
    <p>Introduce una URL para navegar sin restricciones</p>
    <form action="/" method="get">
      <input type="text" name="url" placeholder="https://ejemplo.com" value="" required>
      <button type="submit">Buscar</button>
    </form>
    <iframe id="frame" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
  </div>
  <script>
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get('url');
    if (urlParam) {
      document.querySelector('input').value = urlParam;
      document.getElementById('frame').src = '/proxy?url=' + encodeURIComponent(urlParam);
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
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    }
  };

  const lib = parsed.protocol === 'https:' ? https : http;

  // Se cambia 'req' por 'proxyReq' para evitar conflicto con la 'req' de Express
  const proxyReq = lib.request(options, (proxyRes) => {
    let chunks = [];
    proxyRes.on('data', chunk => chunks.push(chunk));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      
      // Reescritura básica de URLs
      body = body.replace(/href="https?:\/\//gi, 'href="/proxy?url=https://');
      body = body.replace(/src="https?:\/\//gi, 'src="/proxy?url=https://');
      body = body.replace(/action="https?:\/\//gi, 'action="/proxy?url=https://');
      body = body.replace('<head>', `<head><base href="${targetUrl}">`);
      
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'text/html',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(body);
    });
  });

  proxyReq.on('error', (e) => {
    res.status(500).send('<h2>Error de conexión: ' + e.message + '</h2><a href="/">Volver</a>');
  });

  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Proxy corriendo en puerto ' + PORT));
