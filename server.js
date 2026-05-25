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
    .header { height: 50px; background: #f6f8fc; display: flex; align-items: center; padding: 0 15px; gap: 15px; border-bottom: 1px solid #e5e7eb; }
    form { flex: 1; display: flex; background: #eaf1fb; border-radius: 24px; padding: 6px 15px; }
    .address-bar { flex: 1; border: none; background: transparent; outline: none; font-size: 14px; color: #3c4043; }
    .nav-btn { background: none; border: none; color: #5f6368; font-size: 18px; cursor: pointer; }
    .view { height: calc(100% - 50px); width: 100%; background: #000; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <header class="header">
    <button class="nav-btn" onclick="history.back()">←</button>
    <form id="p-form">
      <input type="text" id="u-input" class="address-bar" placeholder="Introduce URL para jugar..." required>
    </form>
    <div style="width:30px; height:30px; background:#0b57d0; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px;">U</div>
  </header>
  <div class="view"><iframe id="f" allow="fullscreen; autoplay; geolocation; microphone; camera"></iframe></div>
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

// --- PROXY OPTIMIZADO PARA JUEGOS ---
app.get('/proxy', (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.end();

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

  const lib = (parsed.protocol === 'https:') ? https : http;

  const proxyReq = lib.request(options, (proxyRes) => {
    // Redirecciones
    if ([301, 302, 307, 308].includes(proxyRes.statusCode)) {
      let newUrl = url.resolve(targetUrl, proxyRes.headers.location);
      return res.redirect('/proxy?url=' + encodeURIComponent(newUrl));
    }

    const contentType = proxyRes.headers['content-type'] || '';
    
    // Si NO es HTML (es un modelo 3D, imagen, textura o script), enviarlo DIRECTO sin tocarlo
    if (!contentType.includes('text/html')) {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      });
      return proxyRes.pipe(res);
    }

    // Solo procesamos el HTML para inyectar la BASE URL
    let chunks = [];
    proxyRes.on('data', chunk => chunks.push(chunk));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      const baseUrl = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
      
      // Inyectamos la base y dejamos que el navegador cargue el resto de archivos
      body = body.replace('<head>', `<head><base href="${baseUrl}">`);
      
      // Reescribimos solo enlaces principales para no romper los scripts internos de Geo-FS
      body = body.replace(/href="([^"]+)"/gi, (match, link) => {
        if (link.startsWith('http') || link.startsWith('/')) {
            return `href="/proxy?url=${encodeURIComponent(url.resolve(targetUrl, link))}"`;
        }
        return match;
      });

      res.writeHead(proxyRes.statusCode, { 
        'Content-Type': 'text/html',
        'X-Frame-Options': 'ALLOWALL'
      });
      res.end(body);
    });
  });

  proxyReq.on('error', () => res.status(500).send('Error de carga.'));
  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Proxy listo para Geo-FS'));
