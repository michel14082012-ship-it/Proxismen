const express = require('express');
const https = require('https');
const http = require('http');
const url = require('url');
const zlib = require('zlib');
const app = express();

const CLAVE_SECRETA = "777"; 

// --- INTERFAZ DE USUARIO ---
app.get('/', (req, res) => {
  const query = req.query.search;
  if (query === CLAVE_SECRETA) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <title>Recibidos (2) - gmail.com</title>
        <link rel="icon" href="https://gstatic.com">
        <style>
          body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #f6f8fc; font-family: 'Segoe UI', Tahoma, sans-serif; }
          .bar { height: 55px; display: flex; align-items: center; padding: 0 20px; background: #f6f8fc; border-bottom: 1px solid #ddd; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
          form { flex: 1; display: flex; gap: 10px; }
          input { flex: 1; padding: 12px 20px; border-radius: 24px; border: 1px solid #dfe1e5; background: #eaf1fb; outline: none; font-size: 14px; transition: 0.3s; }
          input:focus { background: #fff; border-color: #1a73e8; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .btn { background: #1a73e8; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-weight: bold; }
          .view { height: calc(100% - 55px); background: #fff; position: relative; }
          iframe { width: 100%; height: 100%; border: none; }
          .loader { position: absolute; top: 0; left: 0; width: 100%; height: 3px; background: #1a73e8; display: none; animation: load 2s infinite; }
          @keyframes load { 0% { width: 0; } 50% { width: 70%; } 100% { width: 100%; } }
        </style>
      </head>
      <body>
        <div class="bar">
          <form onsubmit="event.preventDefault(); document.querySelector('.loader').style.display='block'; location.href='?search=${CLAVE_SECRETA}&url=' + encodeURIComponent(document.getElementById('u').value)">
            <input id="u" type="text" placeholder="Escribe URL o busca (ej: google.com)" value="${req.query.url || ''}" required>
            <button type="submit" class="btn">NAVEGAR</button>
          </form>
        </div>
        <div class="view">
          <div class="loader"></div>
          <iframe id="frame" src="${req.query.url ? '/proxy?url=' + encodeURIComponent(req.query.url) : 'about:blank'}" allow="fullscreen; autoplay; geolocation; microphone; camera; clipboard-write"></iframe>
        </div>
      </body>
      </html>
    `);
  }
  // Camuflaje Wikipedia
  res.send('<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Wikipedia</title></head><body style="font-family:sans-serif;background:#fff;color:#202122;padding:50px;line-height:1.6;"><div style="max-width:800px;margin:0 auto;"><h1>Wikipedia, la enciclopedia libre</h1><form action="/" method="get" style="margin:20px 0;"><input type="text" name="search" placeholder="Buscar en Wikipedia..." style="padding:10px;width:300px;border:1px solid #a2a9b1;"></form><p>Bienvenidos a la enciclopedia que cualquiera puede editar.</p></div></body></html>');
});

// --- LÓGICA DE PROXY DE ALTO RENDIMIENTO ---
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
      ...req.headers,
      'host': parsed.hostname,
      'referer': parsed.protocol + '//' + parsed.hostname + '/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'accept-encoding': 'identity' // Desactiva compresión para poder editar el código
    }
  };

  const lib = parsed.protocol === 'https:' ? https : http;
  const proxyReq = lib.request(options, (proxyRes) => {
    // Seguir redirecciones 301, 302, 307, 308
    if (.includes(proxyRes.statusCode) && proxyRes.headers.location) {
      let nextUrl = url.resolve(targetUrl, proxyRes.headers.location);
      return res.redirect('/proxy?url=' + encodeURIComponent(nextUrl));
    }

    const headers = { ...proxyRes.headers };
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['content-length'];
    delete headers['set-cookie']; // Evita conflictos de cookies del servidor

    // Si es binario (Imagen, Video, Audio, WebAssembly de juegos)
    if (!headers['content-type']?.includes('text/html')) {
      res.writeHead(proxyRes.statusCode, headers);
      return proxyRes.pipe(res);
    }

    // Si es HTML: Reescritura Inteligente
    let chunks = [];
    proxyRes.on('data', d => chunks.push(d));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString();
      const origin = `${parsed.protocol}//${parsed.hostname}`;

      // 1. Inyectar BASE URL
      body = body.replace('<head>', `<head><base href="${origin}${parsed.pathname}">`);

      // 2. Reescritura de enlaces (href, src, action)
      body = body.replace(/(href|src|action)="(?!data:)(?!javascript:)([^"]+)"/gi, (match, attr, link) => {
        try {
          let full = url.resolve(targetUrl, link);
          return `${attr}="/proxy?url=${encodeURIComponent(full)}"`;
        } catch(e) { return match; }
      });

      // 3. FIX DE JAVASCRIPT: Engañar a scripts que rompen el frame
      body = body.replace(/window\.top/g, 'window.self');
      body = body.replace(/window\.location/g, 'window.fakeLocation');
      body = body.replace('</head>', `
        <script>
          // Script de compatibilidad para WebGL y Ajax
          window.fakeLocation = new Proxy(window.location, {
            get: (t, p) => p === 'host' ? '${parsed.hostname}' : t[p]
          });
          const originalFetch = window.fetch;
          window.fetch = (...args) => {
            if(typeof args[0] === 'string' && !args[0].startsWith('http')) {
              args[0] = '/proxy?url=' + encodeURIComponent(new URL(args[0], '${origin}').href);
            }
            return originalFetch(...args);
          };
        </script>
      </head>`);

      res.writeHead(proxyRes.statusCode, { 
        'Content-Type': 'text/html; charset=UTF-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(body);
    });
  });

  proxyReq.on('error', () => res.status(500).send("Error crítico de red."));
  proxyReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 Proxy Perfecto Activo'));
