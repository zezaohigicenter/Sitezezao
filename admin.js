/**
 * admin/admin.js
 * ------------------------------------------------------------------
 * Toda a lógica do ADM CONFIG: login, navegação entre abas, CRUD de
 * cada seção e upload real de arquivos (convertidos para base64 no
 * navegador e enviados por JSON — ver lib/upload.js no servidor para
 * a validação real que acontece do lado do backend).
 * ------------------------------------------------------------------
 */
(function () {
  const loginScreen = document.getElementById('loginScreen');
  const dashboardScreen = document.getElementById('dashboardScreen');

  // ---------------------------------------------------------------
  // Helper central de chamadas à API
  // ---------------------------------------------------------------
  async function apiFetch(path, { method = 'GET', body } = {}) {
    const headers = {};
    let payload;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (method !== 'GET') headers['X-Requested-With'] = 'zezao-admin';

    const res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' });
    let data;
    try { data = await res.json(); } catch (e) { data = { ok: false, error: 'Resposta inválida do servidor.' }; }

    if (res.status === 401) {
      showLogin();
      throw new Error(data.error || 'Sessão expirada. Faça login novamente.');
    }
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Erro ao processar a requisição.');
    }
    return data;
  }

  function toast(message, isError) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast' + (isError ? ' error' : '');
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 3500);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function showLogin() {
    loginScreen.hidden = false;
    dashboardScreen.hidden = true;
  }
  function showDashboard() {
    loginScreen.hidden = true;
    dashboardScreen.hidden = false;
  }

  // ---------------------------------------------------------------
  // LOGIN / LOGOUT
  // ---------------------------------------------------------------
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorBox = document.getElementById('loginError');
    errorBox.hidden = true;
    const btn = document.getElementById('loginSubmitBtn');
    btn.disabled = true; btn.textContent = 'Entrando...';
    try {
      const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'zezao-admin' };
      const res = await fetch('/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha no login.');
      document.getElementById('sidebarUsername').textContent = data.username;
      showDashboard();
      initDashboard();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await apiFetch('/api/auth/logout', { method: 'POST', body: {} }); } catch (e) {}
    showLogin();
  });

  // ---------------------------------------------------------------
  // NAVEGAÇÃO ENTRE ABAS
  // ---------------------------------------------------------------
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
      document.querySelector('.sidebar').classList.remove('open');
      loadTab(tab);
    });
  });
  document.getElementById('mobileMenuToggle').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('open');
  });

  const loadedTabs = new Set();
  function loadTab(tab) {
    if (tab === 'dashboard') return loadDashboard();
    if (tab === 'config') return loadConfigForm();
    if (tab === 'logo') return loadLogoTab();
    if (tab === 'textos') return loadTextosForm();
    if (tab === 'servicos') return loadServices();
    if (tab === 'antesdepois') return loadBaVideos();
    if (tab === 'depoimentos') return loadTestimonials();
    if (tab === 'galeria') return loadGallery();
    if (tab === 'fotos') return loadPhotos();
    if (tab === 'videos') return loadVideos();
    if (tab === 'whatsapp') return loadWhatsappForm();
    if (tab === 'seguranca') return loadSecurity();
  }

  function initDashboard() {
    loadTab('dashboard');
  }

  // ---------------------------------------------------------------
  // DASHBOARD
  // ---------------------------------------------------------------
  async function loadDashboard() {
    const el = document.getElementById('dashboardCards');
    try {
      const { summary } = await apiFetch('/api/admin/dashboard');
      el.innerHTML = `
        <div class="stat-card"><div class="num">${summary.services}</div><div class="label">Serviços cadastrados</div></div>
        <div class="stat-card"><div class="num">${summary.testimonials}</div><div class="label">Depoimentos</div></div>
        <div class="stat-card"><div class="num">${summary.gallery}</div><div class="label">Fotos na galeria</div></div>
        <div class="stat-card"><div class="num">${summary.photos}</div><div class="label">Fotos na biblioteca</div></div>
        <div class="stat-card"><div class="num">${summary.videos}</div><div class="label">Vídeos cadastrados</div></div>
        <div class="stat-card"><div class="num" style="font-size:1rem;">${summary.lastLogin ? new Date(summary.lastLogin).toLocaleString('pt-BR') : '—'}</div><div class="label">Último login</div></div>
      `;
    } catch (err) { toast(err.message, true); }
  }

  // ---------------------------------------------------------------
  // CONFIGURAÇÕES DO SITE
  // ---------------------------------------------------------------
  async function loadConfigForm() {
    const form = document.getElementById('configForm');
    try {
      const { config } = await apiFetch('/api/admin/config');
      ['siteName', 'tagline', 'cidade', 'phone', 'email', 'address', 'businessHours', 'facebookUrl'].forEach((f) => {
        if (form.elements[f]) form.elements[f].value = config[f] || '';
      });
    } catch (err) { toast(err.message, true); }
  }
  document.getElementById('configForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = {};
    ['siteName', 'tagline', 'cidade', 'phone', 'email', 'address', 'businessHours', 'facebookUrl'].forEach((f) => { body[f] = form.elements[f].value; });
    try {
      await apiFetch('/api/admin/config', { method: 'PUT', body });
      toast('Alterações salvas com sucesso.');
    } catch (err) { toast('Não foi possível salvar. ' + err.message, true); }
  });

  // ---------------------------------------------------------------
  // LOGO E IDENTIDADE
  // ---------------------------------------------------------------
  async function loadLogoTab() {
    try {
      const { config } = await apiFetch('/api/admin/config');
      document.getElementById('currentLogoPreview').src = config.logoUrl || '';
      document.getElementById('currentFaviconPreview').src = config.faviconUrl || config.logoUrl || '';
    } catch (err) { toast(err.message, true); }
  }
  document.getElementById('uploadLogoBtn').addEventListener('click', async () => {
    const input = document.getElementById('logoFileInput');
    if (!input.files[0]) return toast('Selecione um arquivo primeiro.', true);
    try {
      const dataBase64 = await fileToBase64(input.files[0]);
      const { logoUrl } = await apiFetch('/api/admin/logo', { method: 'POST', body: { dataBase64 } });
      document.getElementById('currentLogoPreview').src = logoUrl + '?t=' + Date.now();
      toast('Logo atualizada com sucesso.');
    } catch (err) { toast('Não foi possível salvar. ' + err.message, true); }
  });
  document.getElementById('uploadFaviconBtn').addEventListener('click', async () => {
    const input = document.getElementById('faviconFileInput');
    if (!input.files[0]) return toast('Selecione um arquivo primeiro.', true);
    try {
      const dataBase64 = await fileToBase64(input.files[0]);
      const { faviconUrl } = await apiFetch('/api/admin/favicon', { method: 'POST', body: { dataBase64 } });
      document.getElementById('currentFaviconPreview').src = faviconUrl + '?t=' + Date.now();
      toast('Favicon atualizado com sucesso.');
    } catch (err) { toast('Não foi possível salvar. ' + err.message, true); }
  });

  // ---------------------------------------------------------------
  // TEXTOS
  // ---------------------------------------------------------------
  async function loadTextosForm() {
    const form = document.getElementById('textosForm');
    try {
      const { config } = await apiFetch('/api/admin/config');
      form.elements.heroTitle.value = config.heroTitle || '';
      form.elements.heroSubtitle.value = config.heroSubtitle || '';
    } catch (err) { toast(err.message, true); }
  }
  document.getElementById('textosForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await apiFetch('/api/admin/config', { method: 'PUT', body: { heroTitle: form.elements.heroTitle.value, heroSubtitle: form.elements.heroSubtitle.value } });
      toast('Alterações salvas com sucesso.');
    } catch (err) { toast('Não foi possível salvar. ' + err.message, true); }
  });

  // ---------------------------------------------------------------
  // WHATSAPP E CONTATOS
  // ---------------------------------------------------------------
  async function loadWhatsappForm() {
    const form = document.getElementById('whatsappForm');
    try {
      const { config } = await apiFetch('/api/admin/config');
      form.elements.whatsappNumber.value = config.whatsappNumber || '';
      form.elements.instagramHandle.value = config.instagramHandle || '';
      form.elements.instagramUrl.value = config.instagramUrl || '';
      const wm = config.whatsappMessages || {};
      form.elements.wa_atendente.value = wm.atendente || '';
      form.elements.wa_orcamento.value = wm.orcamento || '';
      form.elements.wa_transformar.value = wm.transformar || '';
      form.elements.wa_flutuante.value = wm.flutuante || '';
    } catch (err) { toast(err.message, true); }
  }
  document.getElementById('whatsappForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = {
      whatsappNumber: form.elements.whatsappNumber.value.replace(/\D/g, ''),
      instagramHandle: form.elements.instagramHandle.value,
      instagramUrl: form.elements.instagramUrl.value,
      whatsappMessages: {
        atendente: form.elements.wa_atendente.value,
        orcamento: form.elements.wa_orcamento.value,
        transformar: form.elements.wa_transformar.value,
        flutuante: form.elements.wa_flutuante.value,
      },
    };
    try {
      await apiFetch('/api/admin/config', { method: 'PUT', body });
      toast('Alterações salvas com sucesso.');
    } catch (err) { toast('Não foi possível salvar. ' + err.message, true); }
  });

  // ---------------------------------------------------------------
  // COLEÇÕES GENÉRICAS (services, testimonials, gallery, photos, videos)
  // ---------------------------------------------------------------
  async function listCollection(name) {
    const { items } = await apiFetch(`/api/admin/${name}`);
    return items;
  }
  async function createItem(name, fields) {
    return apiFetch(`/api/admin/${name}`, { method: 'POST', body: fields });
  }
  async function updateItem(name, id, fields) {
    return apiFetch(`/api/admin/${name}/${id}`, { method: 'PUT', body: fields });
  }
  async function deleteItem(name, id) {
    return apiFetch(`/api/admin/${name}/${id}`, { method: 'DELETE' });
  }
  async function reorderCollection(name, orderedIds) {
    return apiFetch(`/api/admin/${name}/reorder`, { method: 'POST', body: { orderedIds } });
  }

  function confirmDelete(message) {
    return window.confirm(message || 'Tem certeza que deseja excluir este item?');
  }

  // ---- SERVIÇOS ----
  async function loadServices() {
    const list = document.getElementById('servicesList');
    list.innerHTML = 'Carregando...';
    try {
      const items = await listCollection('services');
      renderServicesList(items);
    } catch (err) { toast(err.message, true); }
  }
  function renderServicesList(items) {
    const list = document.getElementById('servicesList');
    if (items.length === 0) { list.innerHTML = '<p class="hint">Nenhum serviço cadastrado ainda.</p>'; return; }
    list.innerHTML = items.map((s, i) => `
      <div class="item-card" data-id="${s.id}">
        ${s.imageUrl ? `<img class="item-media" src="${s.imageUrl}">` : '<div class="item-media"></div>'}
        <div class="item-fields">
          <input type="text" data-field="name" value="${escapeAttr(s.name)}" placeholder="Nome do serviço">
          <textarea data-field="description" rows="2" placeholder="Descrição">${escapeHtml(s.description)}</textarea>
          <input type="file" data-field="imageUrlFile" accept="image/jpeg,image/png,image/webp">
          <label class="toggle-row"><input type="checkbox" data-field="active" ${s.active ? 'checked' : ''}> Ativo</label>
        </div>
        <div class="item-actions">
          <button class="btn-icon" data-action="up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn-icon" data-action="down" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn-primary" data-action="save">Salvar</button>
          <button class="btn-danger" data-action="delete">Excluir</button>
        </div>
      </div>`).join('');
    bindItemCardActions(list, 'services', items);
  }
  document.getElementById('addServiceBtn').addEventListener('click', async () => {
    try {
      await createItem('services', { name: 'Novo serviço', description: '' });
      loadServices();
      toast('Serviço criado. Edite os detalhes abaixo.');
    } catch (err) { toast(err.message, true); }
  });

  // ---- ANTES E DEPOIS (usa a coleção "videos" com section fixa) ----
  async function loadBaVideos() {
    const list = document.getElementById('baVideosList');
    list.innerHTML = 'Carregando...';
    try {
      const items = (await listCollection('videos')).filter(v => v.section === 'Antes e Depois');
      renderBaVideosList(items);
    } catch (err) { toast(err.message, true); }
  }
  function renderBaVideosList(items) {
    const list = document.getElementById('baVideosList');
    if (items.length === 0) { list.innerHTML = '<p class="hint">Nenhum vídeo cadastrado ainda.</p>'; return; }
    list.innerHTML = items.map((v) => `
      <div class="item-card" data-id="${v.id}">
        ${v.url ? `<video class="item-media" src="${v.url}" muted></video>` : '<div class="item-media"></div>'}
        <div class="item-fields">
          <input type="text" data-field="label" value="${escapeAttr(v.label)}" placeholder="Legenda exibida no site">
          <input type="file" data-field="urlFile" accept="video/mp4,video/webm">
          <label class="toggle-row"><input type="checkbox" data-field="active" ${v.active ? 'checked' : ''}> Ativo</label>
        </div>
        <div class="item-actions">
          <button class="btn-primary" data-action="save">Salvar</button>
          <button class="btn-danger" data-action="delete">Excluir</button>
        </div>
      </div>`).join('');
    bindItemCardActions(list, 'videos', items, { fixedFields: { section: 'Antes e Depois' } });
  }
  document.getElementById('addBaVideoBtn').addEventListener('click', async () => {
    try {
      await createItem('videos', { label: 'Novo vídeo', section: 'Antes e Depois', url: '' });
      loadBaVideos();
      toast('Vídeo criado. Envie o arquivo abaixo.');
    } catch (err) { toast(err.message, true); }
  });

  // ---- DEPOIMENTOS ----
  async function loadTestimonials() {
    const list = document.getElementById('testimonialsList');
    list.innerHTML = 'Carregando...';
    try {
      const items = await listCollection('testimonials');
      renderTestimonialsList(items);
    } catch (err) { toast(err.message, true); }
  }
  function renderTestimonialsList(items) {
    const list = document.getElementById('testimonialsList');
    if (items.length === 0) { list.innerHTML = '<p class="hint">Nenhum depoimento cadastrado ainda.</p>'; return; }
    list.innerHTML = items.map((t) => `
      <div class="item-card" data-id="${t.id}">
        ${t.videoUrl ? `<video class="item-media" src="${t.videoUrl}" muted></video>` : (t.photoUrl ? `<img class="item-media" src="${t.photoUrl}">` : '<div class="item-media"></div>')}
        <div class="item-fields">
          <input type="text" data-field="name" value="${escapeAttr(t.name)}" placeholder="Nome do cliente (opcional)">
          <textarea data-field="text" rows="2" placeholder="Texto do depoimento (opcional se houver vídeo)">${escapeHtml(t.text)}</textarea>
          <label>Vídeo do depoimento <input type="file" data-field="videoUrlFile" accept="video/mp4,video/webm"></label>
          <label>Ou foto do cliente <input type="file" data-field="photoUrlFile" accept="image/jpeg,image/png,image/webp"></label>
          <label class="toggle-row"><input type="checkbox" data-field="active" ${t.active ? 'checked' : ''}> Ativo</label>
        </div>
        <div class="item-actions">
          <button class="btn-primary" data-action="save">Salvar</button>
          <button class="btn-danger" data-action="delete">Excluir</button>
        </div>
      </div>`).join('');
    bindItemCardActions(list, 'testimonials', items);
  }
  document.getElementById('addTestimonialBtn').addEventListener('click', async () => {
    try {
      await createItem('testimonials', { name: '', text: '' });
      loadTestimonials();
      toast('Depoimento criado. Edite os detalhes abaixo.');
    } catch (err) { toast(err.message, true); }
  });

  // ---- GALERIA ----
  async function loadGallery() {
    const list = document.getElementById('galleryList');
    list.innerHTML = 'Carregando...';
    try {
      const items = await listCollection('gallery');
      renderGalleryList(items);
    } catch (err) { toast(err.message, true); }
  }
  function renderGalleryList(items) {
    const list = document.getElementById('galleryList');
    if (items.length === 0) { list.innerHTML = '<p class="hint">Nenhuma foto na galeria ainda.</p>'; return; }
    list.innerHTML = items.map((g) => `
      <div class="gallery-item" data-id="${g.id}">
        <img src="${g.url}">
        <div class="gi-body">
          <input type="text" data-field="caption" value="${escapeAttr(g.caption)}" placeholder="Legenda">
          <div class="gi-actions">
            <label style="font-size:0.75rem;"><input type="checkbox" data-field="active" ${g.active ? 'checked' : ''}> Ativo</label>
            <button class="btn-icon" data-action="save">💾</button>
            <button class="btn-icon" data-action="delete">🗑️</button>
          </div>
        </div>
      </div>`).join('');
    bindItemCardActions(list, 'gallery', items, { grid: true });
  }
  document.getElementById('addGalleryBtn').addEventListener('click', async () => {
    const input = document.getElementById('galleryFileInput');
    const caption = document.getElementById('galleryCaptionInput').value;
    if (!input.files[0]) return toast('Selecione uma imagem primeiro.', true);
    try {
      const dataBase64 = await fileToBase64(input.files[0]);
      const { url } = await apiFetch('/api/admin/upload/image', { method: 'POST', body: { dataBase64 } });
      await createItem('gallery', { url, caption });
      input.value = ''; document.getElementById('galleryCaptionInput').value = '';
      loadGallery();
      toast('Foto adicionada à galeria.');
    } catch (err) { toast('Não foi possível salvar. ' + err.message, true); }
  });

  // ---- FOTOS (biblioteca genérica) ----
  async function loadPhotos() {
    const list = document.getElementById('photosList');
    list.innerHTML = 'Carregando...';
    try {
      const items = await listCollection('photos');
      renderPhotosList(items);
    } catch (err) { toast(err.message, true); }
  }
  function renderPhotosList(items) {
    const list = document.getElementById('photosList');
    if (items.length === 0) { list.innerHTML = '<p class="hint">Nenhuma foto na biblioteca ainda.</p>'; return; }
    list.innerHTML = items.map((p) => `
      <div class="gallery-item" data-id="${p.id}">
        <img src="${p.url}">
        <div class="gi-body">
          <input type="text" data-field="label" value="${escapeAttr(p.label)}" placeholder="Identificação">
          <input type="text" readonly value="${p.url}" style="font-size:0.7rem;color:#888;" onclick="this.select()">
          <div class="gi-actions">
            <button class="btn-icon" data-action="save">💾</button>
            <button class="btn-icon" data-action="delete">🗑️</button>
          </div>
        </div>
      </div>`).join('');
    bindItemCardActions(list, 'photos', items, { grid: true });
  }
  document.getElementById('addPhotoBtn').addEventListener('click', async () => {
    const input = document.getElementById('photoFileInput');
    const label = document.getElementById('photoLabelInput').value || 'Sem identificação';
    if (!input.files[0]) return toast('Selecione uma imagem primeiro.', true);
    try {
      const dataBase64 = await fileToBase64(input.files[0]);
      const { url } = await apiFetch('/api/admin/upload/image', { method: 'POST', body: { dataBase64 } });
      await createItem('photos', { url, label, section: 'Geral' });
      input.value = ''; document.getElementById('photoLabelInput').value = '';
      loadPhotos();
      toast('Foto enviada com sucesso.');
    } catch (err) { toast('Não foi possível salvar. ' + err.message, true); }
  });

  // ---- VÍDEOS (biblioteca genérica) ----
  async function loadVideos() {
    const list = document.getElementById('videosList');
    list.innerHTML = 'Carregando...';
    try {
      const items = (await listCollection('videos')).filter(v => v.section !== 'Antes e Depois');
      renderVideosList(items);
    } catch (err) { toast(err.message, true); }
  }
  function renderVideosList(items) {
    const list = document.getElementById('videosList');
    if (items.length === 0) { list.innerHTML = '<p class="hint">Nenhum vídeo na biblioteca ainda.</p>'; return; }
    list.innerHTML = items.map((v) => `
      <div class="item-card" data-id="${v.id}">
        <video class="item-media" src="${v.url}" muted></video>
        <div class="item-fields">
          <input type="text" data-field="label" value="${escapeAttr(v.label)}" placeholder="Identificação">
          <input type="text" readonly value="${v.url}" style="font-size:0.7rem;color:#888;" onclick="this.select()">
        </div>
        <div class="item-actions">
          <button class="btn-primary" data-action="save">Salvar</button>
          <button class="btn-danger" data-action="delete">Excluir</button>
        </div>
      </div>`).join('');
    bindItemCardActions(list, 'videos', items);
  }
  document.getElementById('addVideoBtn').addEventListener('click', async () => {
    const input = document.getElementById('videoFileInput');
    const label = document.getElementById('videoLabelInput').value || 'Sem identificação';
    if (!input.files[0]) return toast('Selecione um vídeo primeiro.', true);
    try {
      toast('Enviando vídeo, aguarde...');
      const dataBase64 = await fileToBase64(input.files[0]);
      const { url } = await apiFetch('/api/admin/upload/video', { method: 'POST', body: { dataBase64 } });
      await createItem('videos', { url, label, section: 'Geral' });
      input.value = ''; document.getElementById('videoLabelInput').value = '';
      loadVideos();
      toast('Vídeo enviado com sucesso.');
    } catch (err) { toast('Não foi possível salvar. ' + err.message, true); }
  });

  // ---- Ações genéricas de cada card (salvar / excluir / reordenar) ----
  function bindItemCardActions(container, collectionName, items, opts = {}) {
    container.querySelectorAll('[data-id]').forEach((card) => {
      const id = card.dataset.id;

      const saveBtn = card.querySelector('[data-action="save"]');
      if (saveBtn) saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true; saveBtn.textContent = 'Salvando...';
        try {
          const fields = { ...(opts.fixedFields || {}) };
          for (const input of card.querySelectorAll('[data-field]')) {
            const field = input.dataset.field;
            if (field.endsWith('File')) continue;
            if (input.type === 'checkbox') fields[field] = input.checked;
            else fields[field] = input.value;
          }
          for (const fileInput of card.querySelectorAll('input[type=file][data-field]')) {
            const field = fileInput.dataset.field; // convenção: "<campoAlvo>File", ex: "imageUrlFile" -> imageUrl
            if (fileInput.files[0]) {
              const kind = fileInput.files[0].type.startsWith('video/') ? 'video' : 'image';
              const dataBase64 = await fileToBase64(fileInput.files[0]);
              const uploadRes = await apiFetch(`/api/admin/upload/${kind}`, { method: 'POST', body: { dataBase64 } });
              const targetField = field.endsWith('File') ? field.slice(0, -4) : field;
              fields[targetField] = uploadRes.url;
            }
          }
          await updateItem(collectionName, id, fields);
          toast('Alterações salvas com sucesso.');
          loadTabForCollection(collectionName);
        } catch (err) {
          toast('Não foi possível salvar. ' + err.message, true);
        } finally {
          saveBtn.disabled = false; saveBtn.textContent = 'Salvar';
        }
      });

      const deleteBtn = card.querySelector('[data-action="delete"]');
      if (deleteBtn) deleteBtn.addEventListener('click', async () => {
        if (!confirmDelete('Tem certeza que deseja excluir este item?')) return;
        try {
          await deleteItem(collectionName, id);
          toast('Item excluído.');
          loadTabForCollection(collectionName);
        } catch (err) { toast(err.message, true); }
      });

      const upBtn = card.querySelector('[data-action="up"]');
      const downBtn = card.querySelector('[data-action="down"]');
      if (upBtn) upBtn.addEventListener('click', () => reorderAndReload(collectionName, items, id, -1));
      if (downBtn) downBtn.addEventListener('click', () => reorderAndReload(collectionName, items, id, 1));
    });
  }

  async function reorderAndReload(collectionName, items, id, direction) {
    const ids = items.map(i => i.id);
    const idx = ids.indexOf(id);
    const swapWith = idx + direction;
    if (swapWith < 0 || swapWith >= ids.length) return;
    [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
    try {
      await reorderCollection(collectionName, ids);
      loadTabForCollection(collectionName);
    } catch (err) { toast(err.message, true); }
  }

  function loadTabForCollection(collectionName) {
    if (collectionName === 'services') return loadServices();
    if (collectionName === 'testimonials') return loadTestimonials();
    if (collectionName === 'gallery') return loadGallery();
    if (collectionName === 'photos') return loadPhotos();
    if (collectionName === 'videos') {
      // pode ter sido chamado tanto da aba "Antes e Depois" quanto de "Vídeos"
      loadBaVideos(); loadVideos();
    }
  }

  // ---------------------------------------------------------------
  // SEGURANÇA
  // ---------------------------------------------------------------
  async function loadSecurity() {
    const el = document.getElementById('securityInfo');
    try {
      const info = await apiFetch('/api/admin/security');
      el.innerHTML = `
        <p><strong>Usuário atual:</strong> ${escapeHtml(info.username)}</p>
        <p><strong>Último login:</strong> ${info.lastLogin ? new Date(info.lastLogin).toLocaleString('pt-BR') : '—'}</p>
        <p><strong>Última alteração de senha:</strong> ${info.lastPasswordChange ? new Date(info.lastPasswordChange).toLocaleString('pt-BR') : '—'}</p>
        <p><strong>Sessões ativas:</strong> ${info.activeSessions}</p>
      `;
    } catch (err) { toast(err.message, true); }
  }
  document.getElementById('changeUsernameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await apiFetch('/api/admin/security/username', { method: 'PUT', body: { newUsername: form.elements.newUsername.value, currentPassword: form.elements.currentPassword.value } });
      toast('Usuário alterado com sucesso.');
      form.reset();
      loadSecurity();
      document.getElementById('sidebarUsername').textContent = form.elements.newUsername.value;
    } catch (err) { toast('Não foi possível salvar. ' + err.message, true); }
  });
  document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.elements.newPassword.value !== form.elements.confirmPassword.value) {
      return toast('A confirmação de senha não confere.', true);
    }
    try {
      await apiFetch('/api/admin/security/password', { method: 'PUT', body: { currentPassword: form.elements.currentPassword.value, newPassword: form.elements.newPassword.value } });
      toast('Senha alterada. Faça login novamente.');
      form.reset();
      setTimeout(() => { showLogin(); }, 1500);
    } catch (err) { toast('Não foi possível salvar. ' + err.message, true); }
  });
  document.getElementById('logoutAllBtn').addEventListener('click', async () => {
    if (!confirmDelete('Isso vai encerrar todas as sessões ativas, incluindo a sua. Deseja continuar?')) return;
    try {
      await apiFetch('/api/admin/security/logout-all', { method: 'POST', body: {} });
    } catch (e) {}
    showLogin();
  });

  // ---------------------------------------------------------------
  // Utilitários
  // ---------------------------------------------------------------
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  // ---------------------------------------------------------------
  // BOOT: checa se já existe sessão válida (ex: usuário deu F5)
  // ---------------------------------------------------------------
  (async function boot() {
    try {
      const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
      const data = await res.json();
      if (res.ok && data.ok) {
        document.getElementById('sidebarUsername').textContent = data.username;
        showDashboard();
        initDashboard();
        return;
      }
    } catch (e) {}
    showLogin();
  })();
})();
