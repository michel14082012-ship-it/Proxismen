const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const compression = require('compression');
const helmet = require('helmet');

const app = express();

const PORT = process.env.PORT || 3000;
const CLAVE_SECRETA = '777';

/* =========================
   MIDDLEWARES
========================= */

app.use(compression());

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

/* =========================
   UTILIDADES
========================= */

function normalizeUrl(input) {
  try {
    if (!/^https?:\/\//i.test(input)) {
      input = 'https://' + input;
    }

    const parsed = new URL(input);

    // Bloquea protocolos peligrosos
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function rewriteHtml(html, baseUrl) {
  const $ = cheerio.load(html);

  $('head').prepend(`<base href="${baseUrl}">`);

  const attrs = ['href', 'src', 'action'];

  attrs.forEach((attr) => {
    $(`[${attr}]`).each((_, el) => {
      const value = $(el).attr(attr);

      if (!value) return;

      if (
        value.startsWith('#') ||
        value.startsWith('javascript:') ||
        value.startsWith('data:')
      ) {
        return;
      }

      try {
        const absolute = new URL(value, baseUrl).toString();

        $(el).attr(
          attr,
          `/proxy?url=${encodeURIComponent(absolute)}`
        );
      } catch {}
    });
  });

  // Elimina políticas anti-frame
  $('meta[http-equiv="Content-Security-Policy"]').remove();
  $('meta[http-equiv="X-Frame-Options"]').remove();

  return $.html();
}

/* =========================
   INTERFAZ
========================= */

app.get('/', (req, res) => {
  const query = req.query.search;

  if (query !== CLAVE_SECRETA) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Wikipedia</title>
        <style>
          body{
            font-family:Arial;
            background:#f5f5f5;
            display:flex;
            justify-content:center;
            align-items:center;
            height:100vh;
            margin:0;
          }

          .box{
            background:white;
            padding:40px;
            border-radius:16px;
            box-shadow:0 10px 30px rgba(0,0,0,.1);
            width:350px;
          }

          input{
            width:100%;
            padding:12px;
            border:1px solid #ccc;
            border-radius:10px;
            font-size:16px;
          }
        </style>
      </head>
      <body>
        <div class="box">
          <h2>Wikipedia</h2>

          <form>
            <input
              type="text"
              name="search"
              placeholder="Buscar..."
            />
          </form>
        </div>
      </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Navegador Proxy</title>

      <style>
        *{
          box-sizing:border-box;
        }

        body,html{
          margin:0;
          height:100%;
          overflow:hidden;
          font-family:Arial;
          background:#f1f3f4;
        }

        .topbar{
          height:60px;
          display:flex;
          align-items:center;
          gap:10px;
          padding:10px;
          background:white;
          border-bottom:1px solid #ddd;
        }

        form{
          display:flex;
          width:100%;
          gap:10px;
        }

        input{
          flex:1;
          padding:12px 18px;
          border-radius:30px;
          border:none;
          background:#eef2f7;
          font-size:15px;
          outline:none;
        }

        button{
          padding:0 20px;
          border:none;
          border-radius:30px;
          background:#1a73e8;
          color:white;
          font-weight:bold;
          cursor:pointer;
        }

        iframe{
          width:100%;
          height:calc(100% - 60px);
          border:none;
          background:white;
        }
      </style>
    </head>

    <body>

      <div class="topbar">
        <form
          onsubmit="
            event.preventDefault();

            const url =
              document.getElementById('url').value;

            location.href =
              '?search=${CLAVE_SECRETA}&url=' +
              encodeURIComponent(url);
          "
        >
          <input
            id="url"
            placeholder="https://example.com"
            value="${req.query.url || ''}"
            autofocus
          />

          <button>IR</button>
        </form>
      </div>

      <iframe
        src="${
          req.query.url
            ? `/proxy?url=${encodeURIComponent(req.query.url)}`
            : 'about:blank'
        }"
        allowfullscreen
      ></iframe>

    </body>
    </html>
  `);
});

/* =========================
   PROXY
========================= */

app.get('/proxy', async (req, res) => {
  try {
    const target = normalizeUrl(req.query.url);

    if (!target) {
      return res.status(400).send('URL inválida');
    }

    const response = await axios({
      url: target,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent':
          'Mozilla/5.0 Chrome/124 Safari/537.36',
        'Accept-Language':
          'es-ES,es;q=0.9'
      }
    });

    const contentType =
      response.headers['content-type'] || '';

    // Headers seguros
    res.removeHeader('X-Frame-Options');

    res.set({
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });

    // Recursos binarios
    if (!contentType.includes('text/html')) {
      res.set('Content-Type', contentType);

      return res.send(response.data);
    }

    let html = response.data.toString('utf-8');

    html = rewriteHtml(html, target);

    res.set('Content-Type', 'text/html; charset=UTF-8');

    res.send(html);
  } catch (err) {
    console.error(err.message);

    res.status(500).send(`
      <h1>Error</h1>
      <p>No se pudo cargar el sitio.</p>
    `);
  }
});

/* =========================
   START
========================= */

app.listen(PORT, () => {
  console.log(
    'Servidor iniciado en puerto ' + PORT
  );
});
