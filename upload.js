/**
 * lib/upload.js
 * ------------------------------------------------------------------
 * Upload real de arquivos (fotos/vídeos), sem dependências externas.
 *
 * Formato do upload: o painel admin envia um JSON { fileName, mimeType,
 * dataBase64 }. Isso evita reimplementar um parser de multipart/form-data
 * do zero (que seria uma superfície grande de bugs de segurança) e
 * continua sendo upload real: o servidor decodifica, VALIDA de verdade
 * (mime type + assinatura de bytes + tamanho) e grava no disco.
 *
 * Proteções aplicadas:
 * - Whitelist de mime types (imagem/vídeo apenas).
 * - Checagem da "assinatura mágica" dos bytes (não confia só na extensão
 *   ou no mimeType informado pelo navegador).
 * - Limite de tamanho por tipo de arquivo.
 * - Nome de arquivo gerado pelo servidor (nunca usa o nome enviado pelo
 *   cliente) — elimina path traversal e colisões.
 * - Arquivos são salvos fora de qualquer diretório executável e nunca
 *   são interpretados como código pelo servidor.
 * ------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

const LIMITS = {
  image: 8 * 1024 * 1024,   // 8MB
  video: 80 * 1024 * 1024,  // 80MB
};

const SIGNATURES = [
  { ext: 'jpg', mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'png', mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'webp', mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offsetCheck: (buf) => buf.slice(8, 12).toString('ascii') === 'WEBP' },
  { ext: 'mp4', mime: 'video/mp4', bytes: null, custom: (buf) => buf.slice(4, 8).toString('ascii') === 'ftyp' },
  { ext: 'webm', mime: 'video/webm', bytes: [0x1a, 0x45, 0xdf, 0xa3] },
];

function detectSignature(buffer) {
  for (const sig of SIGNATURES) {
    if (sig.custom) {
      if (sig.custom(buffer)) return sig;
      continue;
    }
    if (sig.bytes && buffer.slice(0, sig.bytes.length).every((b, i) => b === sig.bytes[i])) {
      if (sig.offsetCheck && !sig.offsetCheck(buffer)) continue;
      return sig;
    }
  }
  return null;
}

class UploadError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * @param {Object} params
 * @param {string} params.dataBase64 - conteúdo do arquivo em base64 (com ou sem prefixo data:...;base64,)
 * @param {'image'|'video'} params.kind
 * @param {string} params.subfolder - subpasta dentro de /uploads (ex: 'logo', 'photos', 'videos')
 * @returns {{ url: string, absolutePath: string, mimeType: string, size: number }}
 */
function saveBase64Upload({ dataBase64, kind, subfolder }) {
  if (!dataBase64 || typeof dataBase64 !== 'string') {
    throw new UploadError('Nenhum arquivo enviado.');
  }
  if (!['image', 'video'].includes(kind)) {
    throw new UploadError('Tipo de upload inválido.');
  }

  const commaIdx = dataBase64.indexOf(',');
  const rawBase64 = dataBase64.startsWith('data:') && commaIdx !== -1
    ? dataBase64.slice(commaIdx + 1)
    : dataBase64;

  let buffer;
  try {
    buffer = Buffer.from(rawBase64, 'base64');
  } catch (e) {
    throw new UploadError('Arquivo corrompido ou em formato inválido.');
  }

  if (!buffer || buffer.length === 0) {
    throw new UploadError('Arquivo vazio.');
  }

  const limit = LIMITS[kind];
  if (buffer.length > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    throw new UploadError(`Arquivo muito grande. O limite para ${kind === 'image' ? 'imagens' : 'vídeos'} é ${mb}MB.`, 413);
  }

  const signature = detectSignature(buffer);
  if (!signature) {
    throw new UploadError('Formato de arquivo não suportado ou inválido. Envie JPG, PNG, WEBP, MP4 ou WEBM.');
  }
  const isImageSig = ['jpg', 'png', 'webp'].includes(signature.ext);
  if (kind === 'image' && !isImageSig) {
    throw new UploadError('Esperado um arquivo de imagem (JPG, PNG ou WEBP).');
  }
  if (kind === 'video' && isImageSig) {
    throw new UploadError('Esperado um arquivo de vídeo (MP4 ou WEBM).');
  }

  const destDir = path.join(UPLOADS_ROOT, subfolder);
  fs.mkdirSync(destDir, { recursive: true });

  const fileName = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${signature.ext}`;
  const absolutePath = path.join(destDir, fileName);

  // Garantia extra contra path traversal: o caminho final precisa continuar dentro de UPLOADS_ROOT.
  if (!absolutePath.startsWith(UPLOADS_ROOT)) {
    throw new UploadError('Caminho de destino inválido.', 500);
  }

  fs.writeFileSync(absolutePath, buffer, { mode: 0o644 });

  const url = `/uploads/${subfolder}/${fileName}`;
  return { url, absolutePath, mimeType: signature.mime, size: buffer.length };
}

/** Remove um arquivo previamente enviado, dado sua URL pública (/uploads/...). Nunca apaga fora de uploads/. */
function deleteUploadedFile(publicUrl) {
  if (!publicUrl || !publicUrl.startsWith('/uploads/')) return false;
  const relative = publicUrl.replace(/^\/uploads\//, '');
  const absolutePath = path.join(UPLOADS_ROOT, relative);
  if (!absolutePath.startsWith(UPLOADS_ROOT)) return false; // proteção contra ../
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
    return true;
  }
  return false;
}

module.exports = { saveBase64Upload, deleteUploadedFile, UploadError, LIMITS };
