const express = require('express');
const https = require('https');
const http = require('http');
const url = require('url');
const app = express();

const CLAVE_SECRETA = "777"; 

app.get('/', (req, res) => {
  const query = req.query.search;
  if (query === CLAVE_SECRETA) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Recibidos (2) - gmail.com</title>
        <link rel="icon" href="https://gstatic.com">
        <style>
          body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #f6f8fc; font-family: sans-serif; }
          .bar { height: 50px; display: flex; align-items: center; padding: 0 15px; background: #f6f8fc; border-bottom: 1px solid #ddd; }
          form { flex: 1; display: flex; gap: 8px; }
          input { flex: 1; padding: 8px 15px; border-radius: 20px; border: 1px solid #dfe1e5; background: #eaf1fb; outline: none; font-size: 14px; }
          .btn { background: #1a73e8; color: white; border: none; padding: 6px 15px; border-radius: 15px; cursor: pointer; font-weight: bold; }
          .view { height: calc(100% - 50px); background: #fff; }
          iframe { width: 100%; height: 100%; border: none; }
        </style>
      </head>
      <body>
        <div class="bar">
          <form onsubmit="event.preventDefault(); location.href='?search=${CLAVE_SECRETA}&url=' + encodeURIComponent(document.getElementById('u').value)">
            <input id="u" type="text" placeholder="https://duckduckgo.com" value="${req.query.url || ''}" required>
            <button type="submit" class="btn">IR</button>
          </form>
        </div>
        <div class="view">
          <iframe id="frame" src="${req.query.url ? '/proxy?url=' + encodeURIComponent(req.query.url) : 'about:blank'}" allow="fullscreen; autoplay; geolocation; microphone; camera; clipboard-write"></iframe>
        </div>
      </body>
      </html>
    `);
  }
  res.send('<!DOCTYPE html><html><head><title>Wikipedia</title></head><body style="font-family:sans-serif;padding:50px;"><h1>Wikipedia</h1><form action="/" method="get"><input type="text" name="search" placeholder="Buscar..."></form></body></html>');
});

app.get('/proxy', (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.end();
  if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

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
      'Referer': parsed.protocol + '//' + parsed.hostname + '/',
      'Accept-Encoding': 'identity'
    }
  };

  const lib = parsed.protocol === 'https:' ? https : http;
  const proxyReq = lib.request(options, (proxyRes) => {
    
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      let next = url.resolve(targetUrl, proxyRes.headers.location);
      return res.redirect('/proxy?url=' + encodeURIComponent(next));
    }

    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['content-length'];

    if (!headers['content-type']?.includes('text/html')) {
      res.writeHead(proxyRes.statusCode, headers);
      return proxyRes.pipe(res);
    }

    let chunks = [];
    proxyRes.on('data', d => chunks.push(d));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString('utf-8');
      
      // 1. Inyección de BASE URL
      body = body.replace('<head>', `<head><base href="${targetUrl}">`);

      // 2. SCRIPT MÁGICO (Resuelve el problema de YouTube y DuckDuckGo)
      // Este script intercepta todas las peticiones internas de la web y las pasa por tu proxy
      const scriptInyectado = `
        <script>
          (function() {
            const originalFetch = window.fetch;
            window.fetch = function(url, options) {
              if (typeof url === 'string' && !url.startsWith(window.location.origin) && !url.startsWith('/')) {
                url = '/proxy?url=' + encodeURIComponent(url);
              }
              return originalFetch(url, options);
            };
            const originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
              if (typeof url === 'string' && !url.startsWith(window.location.origin) && !url.startsWith('/')) {
                url = '/proxy?url=' + encodeURIComponent(url);
              }
              return originalOpen.apply(this, arguments);
            };
          })();
        </script>
      `;
      body = body.replace('</head>', scriptInyectado + '</head>');

      // 3. Reescritura de Enlaces
      body = body.replace(/href="((?!#|javascript:)[^"]+)"/gi, (match, link) => {
        try {
          if (link.match(/\\.(css|js|png|jpg|woff2|svg)$/i)) return match;
          return \`href="/proxy?url=\${encodeURIComponent(url.resolve(targetUrl, link))}"\`;
        } catch(e) { return match; }
      });

      res.writeHead(proxyRes.statusCode, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end(body);
    });
  });

  proxyReq.on('error', () => res.status(500).send("Error."));
  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT);
