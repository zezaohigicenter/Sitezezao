/**
 * public/app.js
 * ------------------------------------------------------------------
 * Busca /api/site-content e injeta os dados cadastrados no ADM CONFIG
 * no HTML estático (que já funciona sozinho como conteúdo padrão,
 * caso a API não responda por qualquer motivo).
 * ------------------------------------------------------------------
 */
(function () {
  const state = { config: null, whatsappMessages: {} };

  function buildWaLink(key) {
    const number = (state.config && state.config.whatsappNumber) || '';
    const msg = state.whatsappMessages[key] || state.whatsappMessages.atendente || '';
    return 'https://wa.me/' + number + '?text=' + encodeURIComponent(msg);
  }

  function refreshWaTriggers() {
    document.querySelectorAll('.wa-trigger').forEach(function (el) {
      const key = el.getAttribute('data-msg') || 'atendente';
      el.setAttribute('href', buildWaLink(key));
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener');
    });
  }

  function setText(id, value) {
    if (!value) return;
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function applySiteConfig(config) {
    state.config = config;
    state.whatsappMessages = config.whatsappMessages || {};

    document.title = `${config.siteName} | ${config.tagline}`;

    ['headerSiteName', 'footerSiteName', 'footerCopyrightName', 'solutionSiteName', 'finalCtaSiteName'].forEach((id) => setText(id, config.siteName));
    setText('headerTagline', config.tagline);
    setText('heroCidade', config.cidade);
    setText('heroTitle', config.heroTitle);
    setText('heroSubtitle', config.heroSubtitle);
    setText('footerCidade', config.cidade);
    setText('footerCidade2', config.cidade);
    setText('faqCidadeAnswer', `Sim, atendemos em ${config.cidade}.`);
    setText('instagramHandle', config.instagramHandle);
    setText('proofSiteName', config.siteName);

    if (config.logoUrl) {
      ['headerLogo', 'heroBadgeLogo', 'footerLogo'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.src = config.logoUrl;
      });
    }
    if (config.faviconUrl) {
      const fav = document.getElementById('faviconLink');
      if (fav) fav.href = config.faviconUrl;
    }

    const igHref = config.instagramUrl || '#';
    ['instagramBtn', 'instagramBtnFinal', 'footerInstagram'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.href = igHref;
    });
    const footerInstagram = document.getElementById('footerInstagram');
    if (footerInstagram) footerInstagram.textContent = config.instagramHandle;

    const footerWhatsapp = document.getElementById('footerWhatsapp');
    if (footerWhatsapp && config.whatsappNumber) {
      const pretty = config.whatsappNumber.replace(/^55(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
      footerWhatsapp.textContent = 'WhatsApp: ' + pretty;
    }
    const footerEmail = document.getElementById('footerEmail');
    if (footerEmail && config.email) {
      footerEmail.textContent = config.email;
      footerEmail.href = 'mailto:' + config.email;
    }

    refreshWaTriggers();
  }

  function renderServices(services) {
    const grid = document.getElementById('servicesGrid');
    if (!grid || !services || services.length === 0) return;
    grid.innerHTML = services.map((s, i) => `
      <div class="service-card">
        ${s.imageUrl ? `<img src="${escapeAttr(s.imageUrl)}" alt="${escapeAttr(s.name)}" style="width:100%;border-radius:8px;margin-bottom:16px;object-fit:cover;height:140px;">` : ''}
        <span class="num">${String(i + 1).padStart(2, '0')}</span>
        <h3>${escapeHtml(s.name)}</h3>
        <p>${escapeHtml(s.description)}</p>
      </div>
    `).join('');
  }

  function videoCardHtml({ videoUrl, posterUrl, tagLabel, caption }) {
    return `
      <div class="ba-pair">
        <div class="ba-video-frame">
          <video class="ba-video" ${posterUrl ? `poster="${escapeAttr(posterUrl)}"` : ''} muted loop playsinline preload="metadata">
            <source src="${escapeAttr(videoUrl)}" type="video/mp4">
          </video>
          <button class="ba-play" aria-label="Reproduzir vídeo">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          ${tagLabel ? `<span class="ba-tag tag-real">${escapeHtml(tagLabel)}</span>` : ''}
        </div>
        ${caption ? `<p class="ba-caption">${escapeHtml(caption)}</p>` : ''}
      </div>`;
  }

  function renderBeforeAfter(videos) {
    const grid = document.getElementById('baGrid');
    if (!grid) return;
    const relevant = (videos || []).filter(v => v.section === 'Antes e Depois');
    if (relevant.length === 0) return; // mantém o fallback estático, se algum dia existir
    grid.innerHTML = relevant.map(v => videoCardHtml({
      videoUrl: v.url, posterUrl: v.posterUrl, tagLabel: 'Vídeo real do serviço', caption: v.label,
    })).join('');
    attachVideoPlayers(grid);
  }

  function renderTestimonials(testimonials) {
    const grid = document.getElementById('proofGrid');
    if (!grid || !testimonials || testimonials.length === 0) return;
    grid.innerHTML = testimonials.map((t) => {
      if (t.videoUrl) {
        return `<div class="proof-video-card"><div class="ba-video-frame proof-frame">
          <video class="ba-video" ${t.posterUrl ? `poster="${escapeAttr(t.posterUrl)}"` : ''} playsinline preload="none" controls>
            <source src="${escapeAttr(t.videoUrl)}" type="video/mp4">
          </video>
          <button class="ba-play" aria-label="Reproduzir depoimento">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div></div>`;
      }
      return `<div class="proof-slot">
        <p class="placeholder-text">${escapeHtml(t.text || '')}</p>
        <p class="placeholder-name">— ${escapeHtml(t.name || 'Cliente')}</p>
      </div>`;
    }).join('');
    attachVideoPlayers(grid);
  }

  function renderGallery(gallery) {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    if (!gallery || gallery.length === 0) return; // mantém a mensagem "em breve"
    grid.innerHTML = gallery.map(g => `<img src="${escapeAttr(g.url)}" alt="${escapeAttr(g.caption || 'Trabalho realizado')}" data-full="${escapeAttr(g.url)}">`).join('');
    grid.querySelectorAll('img').forEach((img) => {
      img.addEventListener('click', () => openLightbox(img.dataset.full, img.alt));
    });
  }

  function openLightbox(src, alt) {
    const lb = document.getElementById('galleryLightbox');
    const img = document.getElementById('lightboxImg');
    img.src = src; img.alt = alt || '';
    lb.classList.add('open');
  }
  document.getElementById('closeLightbox').addEventListener('click', () => {
    document.getElementById('galleryLightbox').classList.remove('open');
  });
  document.getElementById('galleryLightbox').addEventListener('click', (e) => {
    if (e.target.id === 'galleryLightbox') e.currentTarget.classList.remove('open');
  });

  function attachVideoPlayers(scope) {
    scope.querySelectorAll('.ba-video-frame').forEach((frame) => {
      const video = frame.querySelector('video');
      const playBtn = frame.querySelector('.ba-play');
      if (!video || !playBtn || frame.dataset.bound) return;
      frame.dataset.bound = '1';
      playBtn.addEventListener('click', () => video.play());
      video.addEventListener('click', () => { video.paused ? video.play() : video.pause(); });
      video.addEventListener('play', () => playBtn.classList.add('is-hidden'));
      video.addEventListener('pause', () => playBtn.classList.remove('is-hidden'));
      video.addEventListener('ended', () => playBtn.classList.remove('is-hidden'));
    });
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  // ---- Interações estáticas (independem da API) ----
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mobileNav = document.getElementById('mobileNav');
  if (hamburgerBtn && mobileNav) {
    hamburgerBtn.addEventListener('click', () => {
      const isOpen = mobileNav.classList.toggle('open');
      hamburgerBtn.setAttribute('aria-expanded', isOpen);
    });
    mobileNav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => mobileNav.classList.remove('open')));
  }

  document.querySelectorAll('.faq-item').forEach((item) => {
    const q = item.querySelector('.faq-question');
    const a = item.querySelector('.faq-answer');
    q.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach((openItem) => {
        openItem.classList.remove('open');
        openItem.querySelector('.faq-answer').style.maxHeight = null;
      });
      if (!isOpen) { item.classList.add('open'); a.style.maxHeight = a.scrollHeight + 'px'; }
    });
  });

  attachVideoPlayers(document);

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Ativa os links do WhatsApp imediatamente com valores padrão, para
  // não deixar botões quebrados caso a API demore ou falhe.
  state.config = { whatsappNumber: '5515998297441' };
  state.whatsappMessages = { atendente: 'Olá! Encontrei o site e gostaria de falar com um atendente.' };
  refreshWaTriggers();

  // ---- Busca o conteúdo real cadastrado no ADM CONFIG ----
  fetch('/api/site-content')
    .then((r) => r.json())
    .then((data) => {
      if (!data.ok) return;
      applySiteConfig(data.siteConfig);
      renderServices(data.services);
      renderBeforeAfter(data.videos);
      renderTestimonials(data.testimonials);
      renderGallery(data.gallery);
    })
    .catch((err) => console.warn('[site] não foi possível carregar conteúdo dinâmico, usando conteúdo padrão.', err));
})();
