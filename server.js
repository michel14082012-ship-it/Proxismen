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
  <title>Recibidos (2) - gmail.com</title>
  <link rel="icon" href="https://gstatic.com" type="image/x-icon">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { height: 100%; overflow: hidden; font-family: sans-serif; background: #f6f8fc; }
    .header { height: 60px; background: #f6f8fc; display: flex; align-items: center; padding: 0 15px; gap: 15px; border-bottom: 1px solid #e5e7eb; }
    form { flex: 1; display: flex; background: #eaf1fb; border-radius: 24px; padding: 8px 15px; }
    .address-bar { flex: 1; border: none; background: transparent; outline: none; font-size: 15px; color: #3c4043; }
    .nav-btn { background: none; border: none; color: #5f6368; font-size: 20px; cursor: pointer; padding: 5px; }
    .view { height: calc(100% - 60px); width: 100%; background: #fff; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <header class="header">
    <button class="nav-btn" onclick="history.back()">←</button>
    <button class="nav-btn" onclick="history.forward()">→</button>
    <form id="p-form">
      <input type="text" id="u-input" class="address-bar" placeholder="Introduce URL..." required>
    </form>
    <div style="width:32px; height:32px; background:#0b57d0; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:14px;">U</div>
  </header>
  <div class="view"><iframe id="f"></iframe></div>
  <script>
    const form = document.getElementById('p-form');
    const input = document.getElementById('u-input');
    const frame = document.getElementById('f');
    form.onsubmit = (e) => {
      e.preventDefault();
      let q = input.value.trim();
      let target = q.startsWith('http') ? q : 'https://' + q;
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
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    }
  };

  const lib = (parsed.protocol === 'https:') ? https : http;

  const proxyReq = lib.request(options, (proxyRes) => {
    // Corrección de redirecciones
    if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
      let newUrl = url.resolve(targetUrl, proxyRes.headers.location);
      return res.redirect('/proxy?url=' + encodeURIComponent(newUrl));
    }

    const contentType = proxyRes.headers['content-type'] || '';
    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['content-length'];

    if (!contentType.includes('text/html')) {
      res.writeHead(proxyRes.statusCode, headers);
      return proxyRes.pipe(res);
    }

    let chunks = [];
    proxyRes.on('data', chunk => chunks.push(chunk));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      const baseUrl = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
      body = body.replace('<head>', `<head><base href="${baseUrl}">`);
      body = body.replace(/(href|src|action)="(?!data:)(?!javascript:)([^"]+)"/gi, (match, attr, link) => {
        try {
          return `${attr}="/proxy?url=${encodeURIComponent(url.resolve(targetUrl, link))}"`;
        } catch(e) { return match; }
      });
      res.writeHead(proxyRes.statusCode, { ...headers, 'Content-Type': 'text/html' });
      res.end(body);
    });
  });

  proxyReq.on('error', (e) => {
    console.error(e);
    res.status(500).send('Error de carga: ' + e.message);
  });
  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Proxy listo'));
