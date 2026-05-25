const express = require('express');
const http = require('http');
const https = require('https');
const url = require('url');
const app = express();

// --- INTERFAZ CAMUFLADA ---
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
      <input type="text" id="u-input" class="address-bar" placeholder="Introduce URL (ej: www.geo-fs.com)..." required>
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

// --- LÓGICA DE PROXY SIN RESTRICCIONES SSL ---
app.get('/proxy', (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.end();

  const parsed = url.parse(targetUrl);
  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.path || '/',
    method: 'GET',
    rejectUnauthorized: false, // SOLUCIÓN: Ignora errores de certificado SSL/Hostname
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'es-ES,es;q=0.9',
      'Referer': parsed.protocol + '//' + parsed.hostname + '/'
    }
  };

  const lib = (parsed.protocol === 'https:') ? https : http;

  const proxyReq = lib.request(options, (proxyRes) => {
    // Manejo de redirecciones (301, 302, 307, 308)
    if ([301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
      let newUrl = url.resolve(targetUrl, proxyRes.headers.location);
      return res.redirect('/proxy?url=' + encodeURIComponent(newUrl));
    }

    const contentType = proxyRes.headers['content-type'] || '';
    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['content-length'];

    // Para imágenes, scripts y CSS, usamos pipe (más rápido y estable)
    if (!contentType.includes('text/html')) {
      res.writeHead(proxyRes.statusCode, headers);
      return proxyRes.pipe(res);
    }

    let chunks = [];
    proxyRes.on('data', chunk => chunks.push(chunk));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      const baseUrl = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
      
      // Inyectar base y reescribir enlaces
      body = body.replace('<head>', `<head><base href="${baseUrl}">`);
      body = body.replace(/(href|src|action)="(?!data:)(?!javascript:)([^"]+)"/gi, (match, attr, link) => {
        try {
          let absolute = url.resolve(targetUrl, link);
          return `${attr}="/proxy?url=${encodeURIComponent(absolute)}"`;
        } catch(e) { return match; }
      });

      res.writeHead(proxyRes.statusCode, { ...headers, 'Content-Type': 'text/html' });
      res.end(body);
    });
  });

  proxyReq.on('error', (e) => {
    // Si falla geo-fs.com, intentamos sugerir www.geo-fs.com
    res.status(500).send(`
      <div style="padding:20px; font-family:sans-serif;">
        <h2>⚠️ Error de conexión</h2>
        <p>No se pudo cargar: <b>${targetUrl}</b></p>
        <p>Prueba escribiendo <b>www.</b> delante del dominio.</p>
        <br>
        <a href="/">Volver al inicio</a>
      </div>
    `);
  });
  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Proxy Ultra-Permisivo listo'));
