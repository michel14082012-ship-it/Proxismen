const express = require('express');
const cheerio = require('cheerio');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const app = express();

const PORT = process.env.PORT || 3000;
const SECRET = '777';

app.set('trust proxy', true);

app.disable('x-powered-by');

app.use(compression());

app.use(cookieParser());

app.use(express.json({
  limit: '10mb'
}));

app.use(express.urlencoded({
  extended: true
}));

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(morgan('dev'));

/* =========================================
   NORMALIZE URL
========================================= */

function normalizeUrl(input) {

  if (!input) return null;

  input = input.trim();

  if (
    !input.startsWith('http://') &&
    !input.startsWith('https://')
  ) {
    input = 'https://' + input;
  }

  try {

    const parsed = new URL(input);

    if (
      parsed.protocol !== 'http:' &&
      parsed.protocol !== 'https:'
    ) {
      return null;
    }

    return parsed.href;

  } catch {

    return null;

  }

}

/* =========================================
   CSS REWRITE
========================================= */

function rewriteCss(css, baseUrl) {

  return css.replace(

    /url\\((.*?)\\)/gi,

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

        return `url("/proxy?url=${encodeURIComponent(absolute)}")`;

      } catch {

        return `url(${clean})`;

      }

    }

  );

}

/* =========================================
   JS REWRITE
========================================= */

function rewriteJavaScript(code, baseUrl) {

  try {

    code = code.replace(

      /fetch\\((['\"`])(.*?)\\1/g,

      (m, q, url) => {

        try {

          const absolute =
            new URL(url, baseUrl).toString();

          return `fetch(${q}/proxy?url=${encodeURIComponent(absolute)}${q}`;

        } catch {

          return m;

        }

      }

    );

    return code;

  } catch {

    return code;

  }

}

/* =========================================
   HTML REWRITE
========================================= */

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

      const value =
        $(el).attr(attr);

      if (!value) return;

      if (
        value.startsWith('#') ||
        value.startsWith('javascript:') ||
        value.startsWith('data:') ||
        value.startsWith('blob:')
      ) {
        return;
      }

      try {

        const absolute =
          new URL(value, baseUrl).toString();

        $(el).attr(
          attr,
          `/proxy?url=${encodeURIComponent(absolute)}`
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

    const js = $(el).html();

    if (!js) return;

    $(el).html(
      rewriteJavaScript(js, baseUrl)
    );

  });

  $('meta[http-equiv]').remove();

  return $.html();

}

/* =========================================
   HOME
========================================= */

app.get('/', (req, res) => {

  if (req.query.search !== SECRET) {

    return res.send(`

<!DOCTYPE html>
<html>

<head>

<title>Wikipedia</title>

<style>

body{
  margin:0;
  height:100vh;
  display:flex;
  justify-content:center;
  align-items:center;
  background:#f5f5f5;
  font-family:Arial;
}

.box{
  width:350px;
  background:white;
  padding:40px;
  border-radius:20px;
  box-shadow:0 10px 40px rgba(0,0,0,.1);
}

input{
  width:100%;
  padding:14px;
  border-radius:14px;
  border:1px solid #ccc;
}

</style>

</head>

<body>

<div class="box">

<h2>Wikipedia</h2>

<form>

<input
  name="search"
  placeholder="Buscar..."
>

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
  font-family:Arial;
  background:#f1f3f4;
}

.topbar{
  height:60px;
  display:flex;
  align-items:center;
  padding:10px;
  gap:10px;
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
  border-radius:999px;
  background:#1a73e8;
  color:white;
  padding:0 20px;
  cursor:pointer;
  font-weight:bold;
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
>

<button>IR</button>

</form>

</div>

<iframe

src="${
  req.query.url
    ? '/proxy?url=' + encodeURIComponent(req.query.url)
    : 'about:blank'
}"

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
        .send('Invalid URL');

    }

    console.log({
      target
    });

    const response =
      await fetch(target, {

        method: 'GET',

        redirect: 'follow',

        headers: {

          'User-Agent':
            'Mozilla/5.0 Chrome/124 Safari/537.36',

          'Accept':
            '*/*',

          'Accept-Language':
            'es-ES,es;q=0.9'

        }

      });

    const contentType =
      response.headers.get('content-type') || '';

    response.headers.forEach((value, key) => {

      const blocked = [

        'content-security-policy',

        'content-security-policy-report-only',

        'x-frame-options',

        'strict-transport-security',

        'content-length'

      ];

      if (!blocked.includes(key.toLowerCase())) {

        try {

          res.setHeader(key, value);

        } catch {}

      }

    });

    res.setHeader(
      'Access-Control-Allow-Origin',
      '*'
    );

    if (
      !contentType.includes('text/html')
    ) {

      const buffer = Buffer.from(
        await response.arrayBuffer()
      );

      return res.send(buffer);

    }

    let html =
      await response.text();

    html = rewriteHtml(
      html,
      target
    );

    res.setHeader(
      'Content-Type',
      'text/html; charset=UTF-8'
    );

    res.send(html);

  } catch (err) {

    console.error(err);

    res.status(500).send(`

<body style="
background:#111;
color:white;
font-family:Arial;
padding:40px;
">

<h1>Proxy Error</h1>

<pre>${err.message}</pre>

</body>

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

    node: process.version

  });

});

/* =========================================
   START
========================================= */

app.listen(PORT, () => {

  console.log(`

====================================

 PROXY ULTRA STYLE

 PORT ${PORT}

====================================

  `);

});
