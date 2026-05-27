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
/* =========================================
   MIDDLEWARES
========================================= */

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

    // fetch()

    code = code.replace(

      /fetch\((['"`])(.*?)\1/g,

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

    // axios.get()

    code = code.replace(

      /axios\.get\((['"`])(.*?)\1/g,

      (m, q, url) => {

        try {

          const absolute =
            new URL(url, baseUrl).toString();

          return `axios.get(${q}/proxy?url=${encodeURIComponent(absolute)}${q}`;

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

    const parsed =
      new URL(target);

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

    // ARCHIVOS

    if (
      !contentType.includes('text/html')
    ) {

      const buffer = Buffer.from(
        await response.arrayBuffer()
      );

      return res.send(buffer);

    }

    // HTML

    let html =
      await response.text();

    html = rewriteHtml(
      html,
      parsed.href
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
