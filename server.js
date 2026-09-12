/**
 * server.js
 * ------------------------------------------------------------------
 * Servidor HTTP único, sem dependências externas (só módulos nativos
 * do Node.js). Serve:
 *   - o site público (pasta /public)
 *   - o painel administrativo (pasta /admin) em /admin
 *   - arquivos enviados pelo admin (pasta /uploads) em /uploads
 *   - a API (/api/...)
 *
 * Rodar: node server.js
 * Variáveis de ambiente: veja .env.example
 * ------------------------------------------------------------------
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Carrega variáveis de um .env simples, se existir (sem dependência de pacote).
(function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
})();

const auth = require('./lib/auth');
const api = require('./lib/api');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_DIR = path.join(__dirname, 'admin');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const MAX_JSON_BODY_BYTES = 120 * 1024 * 1024; // acomoda vídeo (base64) até ~80MB decodificados

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
};

function safeJoin(rootDir, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const resolved = path.normalize(path.join(rootDir, decoded));
  if (!resolved.startsWith(rootDir)) return null; // bloqueia ../
  return resolved;
}

function serveStaticFile(res, absolutePath, { download } = {}) {
  fs.stat(absolutePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado.');
      return;
    }
    const ext = path.extname(absolutePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': mime,
      'Content-Length': stats.size,
      // Uploads e assets podem ser cacheados; HTML nunca (para refletir mudanças do admin na hora).
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    };
    res.writeHead(200, headers);
    fs.createReadStream(absolutePath).pipe(res);
  });
}

function serveStaticDir(res, rootDir, requestPath, indexFile = 'index.html') {
  let reqPath = requestPath === '/' ? `/${indexFile}` : requestPath;
  let absolutePath = safeJoin(rootDir, reqPath);
  if (!absolutePath) {
    res.writeHead(400); res.end('Caminho inválido.');
    return;
  }
  fs.stat(absolutePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      absolutePath = path.join(absolutePath, indexFile);
    }
    serveStaticFile(res, absolutePath);
  });
}

function collectJsonBody(req) {
  return new Promise((resolve, reject) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength && contentLength > MAX_JSON_BODY_BYTES) {
      reject(Object.assign(new Error('Corpo da requisição excede o limite permitido.'), { statusCode: 413 }));
      return;
    }
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_JSON_BODY_BYTES) {
        reject(Object.assign(new Error('Corpo da requisição excede o limite permitido.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(Object.assign(new Error('JSON inválido no corpo da requisição.'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------
// Tabela de rotas da API
// ---------------------------------------------------------------
function matchRoute(routes, method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const paramNames = [];
    const pattern = '^' + route.path.replace(/:[^/]+/g, (m) => {
      paramNames.push(m.slice(1));
      return '([^/]+)';
    }) + '$';
    const match = pathname.match(new RegExp(pattern));
    if (match) {
      const params = {};
      paramNames.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
      return { route, params };
    }
  }
  return null;
}

const publicRoutes = [
  { method: 'POST', path: '/api/auth/login', handler: api.handleLogin },
  { method: 'POST', path: '/api/auth/logout', handler: api.handleLogout },
  { method: 'GET', path: '/api/auth/session', handler: api.handleSessionCheck },
  { method: 'GET', path: '/api/site-content', handler: api.handlePublicSiteContent },
];

const adminRoutes = [
  { method: 'GET', path: '/api/admin/dashboard', handler: api.handleDashboard },

  { method: 'GET', path: '/api/admin/config', handler: api.handleGetConfig },
  { method: 'PUT', path: '/api/admin/config', handler: api.handleUpdateConfig },
  { method: 'POST', path: '/api/admin/logo', handler: api.handleUploadLogo },
  { method: 'POST', path: '/api/admin/favicon', handler: api.handleUploadFavicon },

  { method: 'GET', path: '/api/admin/services', handler: api.servicesHandlers.list },
  { method: 'POST', path: '/api/admin/services', handler: api.servicesHandlers.create },
  { method: 'PUT', path: '/api/admin/services/:id', handler: api.servicesHandlers.update },
  { method: 'DELETE', path: '/api/admin/services/:id', handler: api.servicesHandlers.remove },
  { method: 'POST', path: '/api/admin/services/reorder', handler: api.servicesHandlers.reorder },

  { method: 'GET', path: '/api/admin/testimonials', handler: api.testimonialsHandlers.list },
  { method: 'POST', path: '/api/admin/testimonials', handler: api.testimonialsHandlers.create },
  { method: 'PUT', path: '/api/admin/testimonials/:id', handler: api.testimonialsHandlers.update },
  { method: 'DELETE', path: '/api/admin/testimonials/:id', handler: api.testimonialsHandlers.remove },
  { method: 'POST', path: '/api/admin/testimonials/reorder', handler: api.testimonialsHandlers.reorder },

  { method: 'GET', path: '/api/admin/gallery', handler: api.galleryHandlers.list },
  { method: 'POST', path: '/api/admin/gallery', handler: api.galleryHandlers.create },
  { method: 'PUT', path: '/api/admin/gallery/:id', handler: api.galleryHandlers.update },
  { method: 'DELETE', path: '/api/admin/gallery/:id', handler: api.galleryHandlers.remove },
  { method: 'POST', path: '/api/admin/gallery/reorder', handler: api.galleryHandlers.reorder },

  { method: 'GET', path: '/api/admin/photos', handler: api.photosHandlers.list },
  { method: 'POST', path: '/api/admin/photos', handler: api.photosHandlers.create },
  { method: 'PUT', path: '/api/admin/photos/:id', handler: api.photosHandlers.update },
  { method: 'DELETE', path: '/api/admin/photos/:id', handler: api.photosHandlers.remove },

  { method: 'GET', path: '/api/admin/videos', handler: api.videosHandlers.list },
  { method: 'POST', path: '/api/admin/videos', handler: api.videosHandlers.create },
  { method: 'PUT', path: '/api/admin/videos/:id', handler: api.videosHandlers.update },
  { method: 'DELETE', path: '/api/admin/videos/:id', handler: api.videosHandlers.remove },

  { method: 'POST', path: '/api/admin/upload/image', handler: api.handleGenericUpload('image', 'photos') },
  { method: 'POST', path: '/api/admin/upload/video', handler: api.handleGenericUpload('video', 'videos') },

  { method: 'GET', path: '/api/admin/security', handler: api.handleSecurityInfo },
  { method: 'PUT', path: '/api/admin/security/username', handler: api.handleChangeUsername },
  { method: 'PUT', path: '/api/admin/security/password', handler: api.handleChangePassword },
  { method: 'POST', path: '/api/admin/security/logout-all', handler: api.handleLogoutAllSessions },
];

async function handleApi(req, res, pathname, ip, isHttps) {
  const cookies = auth.parseCookies(req.headers.cookie);
  const sessionToken = cookies[auth.SESSION_COOKIE_NAME];
  const session = auth.getSession(sessionToken);

  const isAdminRoute = pathname.startsWith('/api/admin/');
  const routeTable = isAdminRoute ? adminRoutes : publicRoutes;
  const matched = matchRoute(routeTable, req.method, pathname);

  if (!matched) {
    api.fail(res, 404, 'Rota da API não encontrada.');
    return;
  }

  // ---- Proteção real: TODA rota /api/admin/* exige sessão válida. ----
  if (isAdminRoute && !session) {
    api.fail(res, 401, 'Não autenticado. Faça login novamente.');
    return;
  }

  // Mitigação simples de CSRF para métodos que alteram estado: exige um
  // cabeçalho custom que navegações "simples" (links, forms cross-site) não conseguem enviar.
  const mutating = ['POST', 'PUT', 'DELETE'].includes(req.method);
  if (mutating && pathname !== '/api/auth/login' && req.headers['x-requested-with'] !== 'zezao-admin') {
    api.fail(res, 403, 'Requisição bloqueada (cabeçalho de segurança ausente).');
    return;
  }

  let body = {};
  if (mutating) {
    try {
      body = await collectJsonBody(req);
    } catch (e) {
      api.fail(res, e.statusCode || 400, e.message);
      return;
    }
  }

  const ctx = { body, params: matched.params, session, sessionToken, ip, isHttps };
  try {
    await matched.route.handler(req, res, ctx);
  } catch (e) {
    console.error('[api] erro não tratado:', e);
    api.fail(res, 500, 'Erro interno do servidor.');
  }
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const pathname = decodeURIComponent(parsed.pathname);
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || process.env.FORCE_SECURE_COOKIE === 'true';

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname, ip, isHttps);
    return;
  }

  if (pathname === '/uploads' || pathname.startsWith('/uploads/')) {
    const rel = pathname.replace(/^\/uploads/, '') || '/';
    const abs = safeJoin(UPLOADS_DIR, rel);
    if (!abs) { res.writeHead(400); res.end('Caminho inválido.'); return; }
    serveStaticFile(res, abs);
    return;
  }

  if (pathname === '/admin' || pathname === '/admin/' || pathname.startsWith('/admin/')) {
    const rel = pathname.replace(/^\/admin/, '') || '/';
    // A própria HTML do painel é pública (é só a casca); os dados reais
    // só chegam via API, que exige sessão. Isso implementa o fluxo
    // pedido: acessar /admin sem estar logado leva à tela de login.
    serveStaticDir(res, ADMIN_DIR, rel === '/' ? '/index.html' : rel, 'index.html');
    return;
  }

  serveStaticDir(res, PUBLIC_DIR, pathname, 'index.html');
});

server.listen(PORT, () => {
  console.log(`\n[Zézão Higicenter] Servidor rodando em http://localhost:${PORT}`);
  console.log(`  Site público:  http://localhost:${PORT}/`);
  console.log(`  ADM CONFIG:    http://localhost:${PORT}/admin\n`);
});

module.exports = server;
