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
  <title>Gmail</title>
  <style>
    :root {
      --bg-bar: #1e293b;
      --bg-body: #0f172a;
      --text: #f8fafc;
      --input-bg: #0f172a;
      --border: #334155;
      --accent: #38bdf8;
      --btn-bg: #334155;
    }
    body.light-mode {
      --bg-bar: #f1f5f9;
      --bg-body: #cbd5e1;
      --text: #1e293b;
      --input-bg: #ffffff;
      --border: #cbd5e1;
      --accent: #0284c7;
      --btn-bg: #e2e8f0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { height: 100%; overflow: hidden; font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg-body); transition: background 0.3s; }
    .browser-bar {
      height: 60px;
      background: var(--bg-bar);
      display: flex;
      align-items: center;
      padding: 0 15px;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      z-index: 100;
    }
    .nav-buttons { display: flex; gap: 8px; }
    .btn {
      background: var(--btn-bg);
      border: none;
      color: var(--text);
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      text-decoration: none;
    }
    .btn:hover { opacity: 0.8; }
    .btn-primary { background: var(--accent); color: white; font-weight: bold; font-size: 14px; }
    form { flex: 1; display: flex; gap: 8px; }
    .address-bar {
      flex: 1;
      padding: 10px 16px;
      border-radius: 20px;
      border: 1px solid var(--border);
      background: var(--input-bg);
      color: var(--text);
      outline: none;
      font-size: 14px;
    }
    .view-container { height: calc(100% - 60px); width: 100%; background: #fff; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body class="dark-mode">
  <header class="browser-bar">
    <div class="nav-buttons">
      <button class="btn" onclick="history.back()">←</button>
      <button class="btn" onclick="history.forward()">→</button>
      <button class="btn" onclick="document.getElementById('frame').contentWindow.location.reload()">↻</button>
      <a href="/" class="btn">🏠</a>
    </div>

    <form id="proxy-form">
      <input type="text" id="url-input" class="address-bar" placeholder="Introduce una URL (ej: google.com)..." required>
      <button type="submit" class="btn btn-primary">IR</button>
    </form>

    <button class="btn" id="theme-toggle">🌙</button>
  </header>

  <div class="view-container">
    <iframe id="frame" src="about:blank" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
  </div>

  <script>
    const form = document.getElementById('proxy-form');
    const input = document.getElementById('url-input');
    const frame = document.getElementById('frame');
    const themeToggle = document.getElementById('theme-toggle');

    if (localStorage.getItem('theme') === 'light') {
      document.body.classList.add('light-mode');
      themeToggle.innerText = '☀️';
    }
    themeToggle.onclick = () => {
      document.body.classList.toggle('light-mode');
      const isLight = document.body.classList.contains('light-mode');
      themeToggle.innerText = isLight ? '☀️' : '🌙';
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
    };

    form.onsubmit = (e) => {
      e.preventDefault();
      let query = input.value.trim();
      if (!query) return;

      // Ya no busca en DuckDuckGo. Solo añade https:// si falta.
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

// --- LÓGICA DEL PROXY ---
app.get('/proxy', (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.redirect('/');
  
  targetUrl = targetUrl.trim();
  const parsed = url.parse(targetUrl);
  
  if (!parsed.hostname) {
      return res.status(400).send('URL inválida');
  }

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
      
      res.writeHead(proxyRes.statusCode, {
        ...headers,
        'Content-Type': proxyRes.headers['content-type'] || 'text/html',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(body);
    });
  });

  proxyReq.on('error', (e) => {
    res.status(500).send(`<h2>Error: No se pudo conectar a ${targetUrl}</h2><a href="/">Volver</a>`);
  });
  
  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 Proxy sin buscador activo'));
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
  <title>Ultra Proxy Inteligente</title>
  <style>
    :root {
      --bg-bar: #1e293b;
      --bg-body: #0f172a;
      --text: #f8fafc;
      --input-bg: #0f172a;
      --border: #334155;
      --accent: #38bdf8;
      --btn-bg: #334155;
    }
    body.light-mode {
      --bg-bar: #f1f5f9;
      --bg-body: #cbd5e1;
      --text: #1e293b;
      --input-bg: #ffffff;
      --border: #cbd5e1;
      --accent: #0284c7;
      --btn-bg: #e2e8f0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { height: 100%; overflow: hidden; font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg-body); transition: background 0.3s; }
    .browser-bar {
      height: 60px;
      background: var(--bg-bar);
      display: flex;
      align-items: center;
      padding: 0 15px;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      z-index: 100;
    }
    .nav-buttons { display: flex; gap: 8px; }
    .btn {
      background: var(--btn-bg);
      border: none;
      color: var(--text);
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      text-decoration: none;
    }
    .btn:hover { opacity: 0.8; }
    .btn-primary { background: var(--accent); color: white; font-weight: bold; font-size: 14px; }
    form { flex: 1; display: flex; gap: 8px; }
    .address-bar {
      flex: 1;
      padding: 10px 16px;
      border-radius: 20px;
      border: 1px solid var(--border);
      background: var(--input-bg);
      color: var(--text);
      outline: none;
      font-size: 14px;
    }
    .view-container { height: calc(100% - 60px); width: 100%; background: #fff; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body class="dark-mode">
  <header class="browser-bar">
    <div class="nav-buttons">
      <button class="btn" onclick="history.back()">←</button>
      <button class="btn" onclick="history.forward()">→</button>
      <button class="btn" onclick="document.getElementById('frame').contentWindow.location.reload()">↻</button>
      <a href="/" class="btn">🏠</a>
    </div>

    <form id="proxy-form">
      <input type="text" id="url-input" class="address-bar" placeholder="Busca en DuckDuckGo o escribe una URL..." required>
      <button type="submit" class="btn btn-primary">IR</button>
    </form>

    <button class="btn" id="theme-toggle">🌙</button>
  </header>

  <div class="view-container">
    <iframe id="frame" src="about:blank" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
  </div>

  <script>
    const form = document.getElementById('proxy-form');
    const input = document.getElementById('url-input');
    const frame = document.getElementById('frame');
    const themeToggle = document.getElementById('theme-toggle');

    if (localStorage.getItem('theme') === 'light') {
      document.body.classList.add('light-mode');
      themeToggle.innerText = '☀️';
    }
    themeToggle.onclick = () => {
      document.body.classList.toggle('light-mode');
      const isLight = document.body.classList.contains('light-mode');
      themeToggle.innerText = isLight ? '☀️' : '🌙';
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
    };

    form.onsubmit = (e) => {
      e.preventDefault();
      let query = input.value.trim();
      let targetUrl = '';

      // CORRECCIÓN AQUÍ: Mejor detección de URL vs Búsqueda
      const isUrl = query.includes('.') && !query.includes(' ');
      
      if (!isUrl) {
        // Búsqueda en DuckDuckGo (versión HTML para mejor compatibilidad)
        targetUrl = 'https://duckduckgo.com' + encodeURIComponent(query);
      } else {
        targetUrl = query.startsWith('http') ? query : 'https://' + query;
      }
      
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

// --- LÓGICA DEL PROXY ---
app.get('/proxy', (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.redirect('/');
  
  // Limpiar URL por si acaso
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
      
      // Inyectar base para recursos relativos
      body = body.replace('<head>', `<head><base href="${parsed.protocol}//${parsed.hostname}${parsed.pathname}">`);

      // Reescritura de enlaces para que sigan usando el proxy
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

  proxyReq.on('error', (e) => {
    console.error(e);
    res.status(500).send('<h2>Error: No se pudo encontrar el sitio.</h2><p>Verifica que la URL sea correcta.</p><a href="/">Volver</a>');
  });
  
  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 Proxy activo y corregido'));
