/**
 * lib/db.js
 * ------------------------------------------------------------------
 * Banco de dados simples baseado em arquivo JSON (sem dependências).
 *
 * Por que um arquivo JSON e não um banco tradicional (Postgres/MySQL)?
 * O projeto original era um site estático, sem nenhum banco de dados.
 * Para não adicionar dependências externas que exigiriam `npm install`
 * (sem acesso à internet neste ambiente de build), implementamos uma
 * solução de persistência real em disco, com escrita atômica (evita
 * corrupção do arquivo em caso de queda no meio da gravação).
 *
 * Isso É uma solução adequada para o porte de um site institucional
 * como este. Se o negócio crescer muito (milhares de acessos
 * simultâneos ao painel), migrar para Postgres/SQLite é direto:
 * a interface abaixo (get/save) pode ser reimplementada sem alterar
 * as rotas que a consomem.
 * ------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const DB_TMP_PATH = DB_PATH + '.tmp';

function hashPasswordSync(plainPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function buildSeed() {
  const now = new Date().toISOString();
  const adminUsername = process.env.ADMIN_USERNAME || 'Programador';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Pro26higi@';

  return {
    meta: { schemaVersion: 1, createdAt: now },
    admin: {
      username: adminUsername,
      passwordHash: hashPasswordSync(adminPassword),
      lastLogin: null,
      lastPasswordChange: now,
    },
    siteConfig: {
      siteName: 'Zézão Higicenter',
      tagline: 'Pós-obra & Restauração de Pisos',
      cidade: 'Boituva - SP',
      whatsappNumber: '5515998297441',
      phone: '',
      email: 'zezaocallcenter@gmail.com',
      address: '',
      instagramHandle: '@zezaohigicenter',
      instagramUrl: 'https://www.instagram.com/zezaohigicenter?stkn=eDI0enYwOXk0cnl4',
      facebookUrl: '',
      businessHours: '',
      logoUrl: '/assets/logo-zezao-400.jpg',
      faviconUrl: '',
      heroTitle: 'Seu piso pode voltar a valorizar o seu ambiente.',
      heroSubtitle: 'Especialistas em pós-obra e restauração de pisos em Boituva - SP. Recuperamos a aparência do ambiente para você olhar para o resultado e sentir orgulho dele.',
      whatsappMessages: {
        atendente: 'Olá! Encontrei o site da Zézão Higicenter e gostaria de falar com um atendente.',
        orcamento: 'Olá! Gostaria de solicitar um orçamento para o meu piso.',
        transformar: 'Olá! Vi os resultados no site da Zézão Higicenter e gostaria de saber o que pode ser feito no meu piso.',
        flutuante: 'Olá! Vim pelo site da Zézão Higicenter e gostaria de solicitar um orçamento.',
      },
    },
    services: [
      { id: 'srv_1', name: 'Pós-obra', description: 'Remoção de resíduos e sujeiras deixados após obras e reformas.', imageUrl: '', videoUrl: '', order: 1, active: true },
      { id: 'srv_2', name: 'Restauração de Pisos', description: 'Recuperação da aparência e do acabamento do piso, de acordo com as condições do ambiente.', imageUrl: '', videoUrl: '', order: 2, active: true },
      { id: 'srv_3', name: 'Limpeza Técnica', description: 'Limpeza profissional para situações que exigem mais cuidado do que uma limpeza convencional.', imageUrl: '', videoUrl: '', order: 3, active: true },
      { id: 'srv_4', name: 'Tratamento e Proteção', description: 'Aplicado quando indicado, de acordo com o tipo de piso e o serviço realizado.', imageUrl: '', videoUrl: '', order: 4, active: true },
    ],
    testimonials: [
      { id: 'tst_1', name: '', text: '', photoUrl: '', videoUrl: '/assets/videos/depoimento-1.mp4', posterUrl: '/assets/videos/poster-depoimento-1.jpg', rating: 5, active: true, order: 1 },
      { id: 'tst_2', name: '', text: '', photoUrl: '', videoUrl: '/assets/videos/depoimento-2.mp4', posterUrl: '/assets/videos/poster-depoimento-2.jpg', rating: 5, active: true, order: 2 },
    ],
    gallery: [],
    photos: [],
    videos: [
      { id: 'vid_1', label: 'Antes e depois — piso externo', section: 'Antes e Depois', url: '/assets/videos/antes-depois-piso-externo.mp4', posterUrl: '/assets/videos/poster-antes-depois.jpg', active: true, isPrimary: true },
      { id: 'vid_2', label: 'Processo real — piso de madeira', section: 'Antes e Depois', url: '/assets/videos/processo-real-piso-madeira.mp4', posterUrl: '/assets/videos/poster-processo.jpg', active: true, isPrimary: false },
    ],
  };
}

let cache = null;
let writeQueue = Promise.resolve();

function load() {
  if (cache) return cache;
  if (!fs.existsSync(DB_PATH)) {
    cache = buildSeed();
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2), 'utf8');
    console.log('[db] Banco de dados inicial criado em', DB_PATH);
  } else {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    cache = JSON.parse(raw);
  }
  return cache;
}

/** Retorna o objeto de dados em memória (mutável). Sempre chame save() depois de alterar. */
function get() {
  return load();
}

/** Persiste o estado atual em disco de forma atômica (grava em .tmp e renomeia). */
function save() {
  writeQueue = writeQueue.then(() => new Promise((resolve, reject) => {
    const json = JSON.stringify(cache, null, 2);
    fs.writeFile(DB_TMP_PATH, json, 'utf8', (err) => {
      if (err) return reject(err);
      fs.rename(DB_TMP_PATH, DB_PATH, (err2) => {
        if (err2) return reject(err2);
        resolve();
      });
    });
  }));
  return writeQueue;
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

module.exports = { get, save, genId, hashPasswordSync, DB_PATH };
