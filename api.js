/**
 * lib/api.js
 * ------------------------------------------------------------------
 * Handlers de toda a API (/api/...). Cada handler recebe (req, res, ctx)
 * onde ctx traz { body, params, session, ip }.
 * ------------------------------------------------------------------
 */
const db = require('./db');
const auth = require('./auth');
const { saveBase64Upload, deleteUploadedFile, UploadError } = require('./upload');

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function ok(res, data) { sendJson(res, 200, { ok: true, ...data }); }
function fail(res, statusCode, message) { sendJson(res, statusCode, { ok: false, error: message }); }

// ---------------------------------------------------------------
// AUTENTICAÇÃO
// ---------------------------------------------------------------

function handleLogin(req, res, ctx) {
  const { username, password } = ctx.body || {};
  if (!username || !password) return fail(res, 400, 'Informe usuário e senha.');

  if (auth.isRateLimited(ctx.ip)) {
    return fail(res, 429, 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.');
  }

  const data = db.get();
  const validUser = username === data.admin.username;
  const validPass = validUser && auth.verifyPassword(password, data.admin.passwordHash);

  if (!validUser || !validPass) {
    auth.recordFailedAttempt(ctx.ip);
    return fail(res, 401, 'Usuário ou senha inválidos.');
  }

  auth.clearAttempts(ctx.ip);
  data.admin.lastLogin = new Date().toISOString();
  db.save();

  const token = auth.createSession(data.admin.username);
  const secure = ctx.isHttps;
  res.setHeader('Set-Cookie', auth.buildSessionCookie(token, { secure }));
  ok(res, { username: data.admin.username });
}

function handleLogout(req, res, ctx) {
  if (ctx.sessionToken) auth.destroySession(ctx.sessionToken);
  res.setHeader('Set-Cookie', auth.buildClearCookie({ secure: ctx.isHttps }));
  ok(res, {});
}

function handleSessionCheck(req, res, ctx) {
  if (!ctx.session) return fail(res, 401, 'Sem sessão ativa.');
  ok(res, { username: ctx.session.username });
}

// ---------------------------------------------------------------
// CONTEÚDO PÚBLICO (sem autenticação)
// ---------------------------------------------------------------

function handlePublicSiteContent(req, res) {
  const data = db.get();
  ok(res, {
    siteConfig: data.siteConfig,
    services: data.services.filter(s => s.active).sort((a, b) => a.order - b.order),
    testimonials: data.testimonials.filter(t => t.active).sort((a, b) => a.order - b.order),
    gallery: data.gallery.filter(g => g.active).sort((a, b) => a.order - b.order),
    videos: data.videos.filter(v => v.active),
  });
}

// ---------------------------------------------------------------
// ADMIN — CONFIGURAÇÕES DO SITE
// ---------------------------------------------------------------

const EDITABLE_CONFIG_FIELDS = [
  'siteName', 'tagline', 'cidade', 'whatsappNumber', 'phone', 'email', 'address',
  'instagramHandle', 'instagramUrl', 'facebookUrl', 'businessHours',
  'heroTitle', 'heroSubtitle',
];

function handleGetConfig(req, res) {
  const data = db.get();
  ok(res, { config: data.siteConfig });
}

function handleUpdateConfig(req, res, ctx) {
  const data = db.get();
  const updates = ctx.body || {};
  for (const key of EDITABLE_CONFIG_FIELDS) {
    if (typeof updates[key] === 'string') data.siteConfig[key] = updates[key].slice(0, 4000);
  }
  if (updates.whatsappMessages && typeof updates.whatsappMessages === 'object') {
    for (const k of ['atendente', 'orcamento', 'transformar', 'flutuante']) {
      if (typeof updates.whatsappMessages[k] === 'string') {
        data.siteConfig.whatsappMessages[k] = updates.whatsappMessages[k].slice(0, 1000);
      }
    }
  }
  db.save();
  ok(res, { config: data.siteConfig });
}

function handleUploadLogo(req, res, ctx) {
  try {
    const { dataBase64 } = ctx.body || {};
    const result = saveBase64Upload({ dataBase64, kind: 'image', subfolder: 'logo' });
    const data = db.get();
    const previousUrl = data.siteConfig.logoUrl;
    data.siteConfig.logoUrl = result.url;
    db.save();
    if (previousUrl && previousUrl.startsWith('/uploads/')) deleteUploadedFile(previousUrl);
    ok(res, { logoUrl: result.url });
  } catch (e) {
    if (e instanceof UploadError) return fail(res, e.statusCode, e.message);
    throw e;
  }
}

function handleUploadFavicon(req, res, ctx) {
  try {
    const { dataBase64 } = ctx.body || {};
    const result = saveBase64Upload({ dataBase64, kind: 'image', subfolder: 'logo' });
    const data = db.get();
    const previousUrl = data.siteConfig.faviconUrl;
    data.siteConfig.faviconUrl = result.url;
    db.save();
    if (previousUrl && previousUrl.startsWith('/uploads/')) deleteUploadedFile(previousUrl);
    ok(res, { faviconUrl: result.url });
  } catch (e) {
    if (e instanceof UploadError) return fail(res, e.statusCode, e.message);
    throw e;
  }
}

// ---------------------------------------------------------------
// Helper genérico de CRUD para coleções (services, testimonials, gallery)
// ---------------------------------------------------------------

function makeCollectionHandlers(collectionName, allowedFields) {
  return {
    list(req, res) {
      const data = db.get();
      ok(res, { items: data[collectionName].sort((a, b) => (a.order || 0) - (b.order || 0)) });
    },
    create(req, res, ctx) {
      const data = db.get();
      const body = ctx.body || {};
      const item = { id: db.genId(collectionName.slice(0, 3)) };
      for (const f of allowedFields) item[f] = body[f] !== undefined ? body[f] : (f === 'active' ? true : '');
      item.order = data[collectionName].length + 1;
      item.active = item.active !== false;
      data[collectionName].push(item);
      db.save();
      ok(res, { item });
    },
    update(req, res, ctx) {
      const data = db.get();
      const item = data[collectionName].find(i => i.id === ctx.params.id);
      if (!item) return fail(res, 404, 'Item não encontrado.');
      const body = ctx.body || {};
      for (const f of allowedFields) {
        if (body[f] !== undefined) item[f] = body[f];
      }
      if (typeof body.active === 'boolean') item.active = body.active;
      if (typeof body.order === 'number') item.order = body.order;
      db.save();
      ok(res, { item });
    },
    remove(req, res, ctx) {
      const data = db.get();
      const idx = data[collectionName].findIndex(i => i.id === ctx.params.id);
      if (idx === -1) return fail(res, 404, 'Item não encontrado.');
      const [removed] = data[collectionName].splice(idx, 1);
      ['imageUrl', 'videoUrl', 'photoUrl', 'posterUrl', 'url'].forEach((f) => {
        if (removed[f]) deleteUploadedFile(removed[f]);
      });
      db.save();
      ok(res, {});
    },
    reorder(req, res, ctx) {
      const data = db.get();
      const { orderedIds } = ctx.body || {};
      if (!Array.isArray(orderedIds)) return fail(res, 400, 'orderedIds inválido.');
      orderedIds.forEach((id, index) => {
        const item = data[collectionName].find(i => i.id === id);
        if (item) item.order = index + 1;
      });
      db.save();
      ok(res, { items: data[collectionName].sort((a, b) => a.order - b.order) });
    },
  };
}

const servicesHandlers = makeCollectionHandlers('services', ['name', 'description', 'imageUrl', 'videoUrl']);
const testimonialsHandlers = makeCollectionHandlers('testimonials', ['name', 'text', 'photoUrl', 'videoUrl', 'posterUrl', 'rating']);
const galleryHandlers = makeCollectionHandlers('gallery', ['url', 'caption']);
const photosHandlers = makeCollectionHandlers('photos', ['label', 'section', 'url', 'isPrimary']);
const videosHandlers = makeCollectionHandlers('videos', ['label', 'section', 'url', 'posterUrl', 'isPrimary']);

function handleGenericUpload(kind, subfolder) {
  return (req, res, ctx) => {
    try {
      const { dataBase64 } = ctx.body || {};
      const result = saveBase64Upload({ dataBase64, kind, subfolder });
      ok(res, { url: result.url, mimeType: result.mimeType, size: result.size });
    } catch (e) {
      if (e instanceof UploadError) return fail(res, e.statusCode, e.message);
      throw e;
    }
  };
}

// ---------------------------------------------------------------
// SEGURANÇA (usuário/senha do admin)
// ---------------------------------------------------------------

function handleSecurityInfo(req, res) {
  const data = db.get();
  ok(res, {
    username: data.admin.username,
    lastLogin: data.admin.lastLogin,
    lastPasswordChange: data.admin.lastPasswordChange,
    activeSessions: auth.countActiveSessions(data.admin.username),
  });
}

function handleChangeUsername(req, res, ctx) {
  const data = db.get();
  const { newUsername, currentPassword } = ctx.body || {};
  if (!newUsername || !currentPassword) return fail(res, 400, 'Informe o novo usuário e a senha atual.');
  if (!auth.verifyPassword(currentPassword, data.admin.passwordHash)) {
    return fail(res, 401, 'Senha atual incorreta.');
  }
  if (newUsername.trim().length < 3) return fail(res, 400, 'O nome de usuário deve ter ao menos 3 caracteres.');
  data.admin.username = newUsername.trim();
  db.save();
  ok(res, { username: data.admin.username });
}

function handleChangePassword(req, res, ctx) {
  const data = db.get();
  const { currentPassword, newPassword } = ctx.body || {};
  if (!currentPassword || !newPassword) return fail(res, 400, 'Informe a senha atual e a nova senha.');
  if (!auth.verifyPassword(currentPassword, data.admin.passwordHash)) {
    return fail(res, 401, 'Senha atual incorreta.');
  }
  if (newPassword.length < 8) return fail(res, 400, 'A nova senha deve ter ao menos 8 caracteres.');
  data.admin.passwordHash = auth.hashPassword(newPassword);
  data.admin.lastPasswordChange = new Date().toISOString();
  db.save();
  auth.destroyAllSessionsForUser(data.admin.username);
  ok(res, { message: 'Senha alterada. Faça login novamente.' });
}

function handleLogoutAllSessions(req, res, ctx) {
  const data = db.get();
  auth.destroyAllSessionsForUser(data.admin.username);
  res.setHeader('Set-Cookie', auth.buildClearCookie({ secure: ctx.isHttps }));
  ok(res, {});
}

// ---------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------

function handleDashboard(req, res) {
  const data = db.get();
  ok(res, {
    summary: {
      services: data.services.length,
      testimonials: data.testimonials.length,
      gallery: data.gallery.length,
      photos: data.photos.length,
      videos: data.videos.length,
      lastLogin: data.admin.lastLogin,
    },
  });
}

module.exports = {
  sendJson, ok, fail,
  handleLogin, handleLogout, handleSessionCheck,
  handlePublicSiteContent,
  handleGetConfig, handleUpdateConfig, handleUploadLogo, handleUploadFavicon,
  servicesHandlers, testimonialsHandlers, galleryHandlers, photosHandlers, videosHandlers,
  handleGenericUpload,
  handleSecurityInfo, handleChangeUsername, handleChangePassword, handleLogoutAllSessions,
  handleDashboard,
};
