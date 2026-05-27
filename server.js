const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const http = require('http');
const https = require('https');

const app = express();

const PORT = process.env.PORT || 3000;
const SECRET = '777';

/* =========================================
   AGENTES KEEP-ALIVE
========================================= */

const httpAgent = new http.Agent({
  keepAlive: true
});

const httpsAgent = new https.Agent({
  keepAlive: true
});

/* =========================================
   MIDDLEWARES
========================================= */

app.disable('x-powered-by');

app.use(compression());

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(cookieParser());

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(morgan('dev'));

/* =========================================
   UTILIDADES
========================================= */

function normalizeUrl(input) {
  try {
    if (!/^https?:\/\//i.test(input)) {
      input = 'https://' + input;
    }

    const parsed = new URL(input);

    if (
      parsed.protocol !== 'http:' &&
      parsed.protocol !== 'https:'
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function rewriteCss(css, baseUrl) {
  return css.replace(
    /url\((.*?)\)/gi,
    (_, raw) => {
      let clean = raw
        .replace(/['"]/g, '')
        .trim();

      if (
        clean.startsWith('data:') ||
        clean.startsWith('blob:')
      ) {
        return `url(${clean})`;
      }

      try {
        const absolute =
          new URL(clean, baseUrl).toString();

        return `url("/proxy?url=${encodeURIComponent(
          absolute
        )}")`;
      } catch {
        return `url(${clean})`;
      }
    }
  );
}

function rewriteHtml(html, baseUrl) {
  const $ = cheerio.load(html);

  $('head').prepend(`
    <base href="${baseUrl}">
  `);

  const attrs = [
    'href',
    'src',
    'action',
    'poster'
  ];

  attrs.forEach((attr) => {
    $(`[${attr}]`).each((_, el) => {
      const val = $(el).attr(attr);

      if (!val) return;

      if (
        val.startsWith('#') ||
        val.startsWith('javascript:') ||
        val.startsWith('data:') ||
        val.startsWith('blob:')
      ) {
        return;
      }

      try {
        const absolute =
          new URL(val, baseUrl).toString();

        $(el).attr(
          attr,
          `/proxy?url=${encodeURIComponent(
            absolute
          )}`
        );
      } catch {}
    });
  });

  $('style').each((_, el) => {
    const css = $(el).html();

    if (!css) return;

    $(el).html(
      rewriteCss(css, baseUrl)
    );
  });

  $('script').each((_, el) => {
    const code = $(el).html();

    if (!code) return;

    let modified = code;

    modified = modified.replace(
      /fetch\((['"`])(.*?)\1/g,
      (m, q, link) => {
        try {
          const absolute =
            new URL(link, baseUrl).toString();

          return `fetch(${q}/proxy?url=${encodeURIComponent(
            absolute
          )}${q}`;
        } catch {
          return m;
        }
      }
    );

    $(el).html(modified);
  });

  $('meta[http-equiv]').remove();

  return $.html();
}

/* =========================================
   HOME
========================================= */

app.get('/', (req, res) => {
  const access = req.query.search;

  if (access !== SECRET) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Wikipedia</title>

        <style>
          body{
            margin:0;
            display:flex;
            justify-content:center;
            align-items:center;
            height:100vh;
            font-family:Arial;
            background:#f5f5f5;
          }

          .box{
            background:white;
            padding:40px;
            border-radius:20px;
            box-shadow:0 10px 40px rgba(0,0,0,.1);
            width:350px;
          }

          input{
            width:100%;
            padding:14px;
            border-radius:12px;
            border:1px solid #ccc;
          }
        </style>
      </head>

      <body>
        <div class="box">
          <h2>Wikipedia</h2>

          <form method="GET">
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
      <title>Proxy Browser</title>

      <style>
        *{
          box-sizing:border-box;
        }

        body,html{
          margin:0;
          height:100%;
          overflow:hidden;
          background:#f1f3f4;
          font-family:Arial;
        }

        .toolbar{
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
          padding:12px 20px;
          border:none;
          border-radius:999px;
          background:#eef2f7;
          outline:none;
          font-size:15px;
        }

        button{
          border:none;
          padding:0 20px;
          border-radius:999px;
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

      <div class="toolbar">

        <form
          onsubmit="
            event.preventDefault();

            const value =
              document.getElementById('url').value;

            location.href =
              '/?search=${SECRET}&url=' +
              encodeURIComponent(value);
          "
        >

          <input
            id="url"
            value="${req.query.url || ''}"
            placeholder="https://example.com"
            autofocus
          />

          <button>IR</button>

        </form>

      </div>

      <iframe
        src="${
          req.query.url
            ? `/proxy?url=${encodeURIComponent(
                req.query.url
              )}`
            : 'about:blank'
        }"
        allow="
          fullscreen;
          autoplay;
          clipboard-write;
          microphone;
          camera;
          geolocation
        "
      ></iframe>

    </body>
    </html>
  `);
});

/* =========================================
   PROXY
========================================= */

app.get('/proxy', async (req, res) => {
  try {
    const target =
      normalizeUrl(req.query.url);

    if (!target) {
      return res
        .status(400)
        .send('URL inválida');
    }

    const response = await axios({
      url: target,
      method: req.method,
      responseType: 'arraybuffer',
      timeout: 20000,
      maxRedirects: 5,
      decompress: true,

      headers: {
        'User-Agent':
          'Mozilla/5.0 Chrome/124 Safari/537.36',

        'Accept-Language':
          'es-ES,es;q=0.9',

        'Accept':
          '*/*',

        'Referer':
          new URL(target).origin,

        'Origin':
          new URL(target).origin
      },

      httpAgent,
      httpsAgent
    });

    const headers = {
      ...response.headers
    };

    delete headers['content-security-policy'];
    delete headers['x-frame-options'];
    delete headers['content-length'];
    delete headers['strict-transport-security'];

    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Credentials'] =
      'true';

    const contentType =
      headers['content-type'] || '';

    res.status(response.status);

    Object.entries(headers).forEach(
      ([k, v]) => {
        try {
          res.setHeader(k, v);
        } catch {}
      }
    );

    if (
      !contentType.includes('text/html')
    ) {
      return res.send(response.data);
    }

    let html =
      response.data.toString('utf8');

    html = rewriteHtml(html, target);

    res.setHeader(
      'Content-Type',
      'text/html; charset=UTF-8'
    );

    res.send(html);

  } catch (err) {
    console.error(err.message);

    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <body style="
        font-family:Arial;
        background:#111;
        color:white;
        padding:40px;
      ">
        <h1>Error Proxy</h1>
        <p>${err.message}</p>
      </body>
      </html>
    `);
  }
});

/* =========================================
   HEALTH
========================================= */

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    node: process.version
  });
});

/* =========================================
   404
========================================= */

app.use((req, res) => {
  res.status(404).send('404');
});

/* =========================================
   START
========================================= */

app.listen(PORT, () => {
  console.log(`
====================================
 PROXY WEB PRO
====================================

Running:
http://localhost:${PORT}

====================================
  `);
});
