// Validação e preparo das imagens de perfil (foto e banner) antes do upload.

const LIMITS = {
  avatar: { maxBytes: 4 * 1024 * 1024, w: 256, h: 256, label: 'A foto' },
  banner: { maxBytes: 8 * 1024 * 1024, w: 960, h: 384, label: 'O banner' }
};

// Confere o tipo REAL do arquivo pelos primeiros bytes (não confia na extensão)
async function sniff(file) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const hex = (i, n) => Array.from(b.slice(i, i + n)).map((x) => x.toString(16).padStart(2, '0')).join('');
  if (hex(0, 8) === '89504e470d0a1a0a') return 'image/png';
  if (hex(0, 3) === 'ffd8ff') return 'image/jpeg';
  if (hex(0, 4) === '47494638') return 'image/gif';
  if (hex(0, 4) === '52494646' && hex(8, 4) === '57454250') return 'image/webp';
  return null;
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Retorna { blob, type, ext } pronto para enviar
export async function prepareImage(file, kind) {
  const lim = LIMITS[kind];
  if (!file) throw new Error('Nenhum arquivo escolhido.');
  if (file.size > lim.maxBytes) throw new Error(`${lim.label} pode ter no máximo ${lim.maxBytes / 1024 / 1024} MB.`);
  const type = await sniff(file);
  if (!type) throw new Error('Formato não aceito. Use PNG, JPG, WebP ou GIF.');

  // GIF fica como está para manter a animação
  if (type === 'image/gif') return { blob: file, type, ext: 'gif' };

  // Outras imagens: recorta no tamanho certo e recria o arquivo (isso também apaga dados EXIF, como localização)
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (_) { throw new Error('Não consegui ler essa imagem.'); }
  if (bmp.width > 8000 || bmp.height > 8000) throw new Error('Imagem grande demais (máximo 8000 px de lado).');
  const canvas = document.createElement('canvas');
  canvas.width = lim.w;
  canvas.height = lim.h;
  const ctx = canvas.getContext('2d');
  const scale = Math.max(lim.w / bmp.width, lim.h / bmp.height);
  const sw = lim.w / scale;
  const sh = lim.h / scale;
  const sx = (bmp.width - sw) / 2;
  const sy = (bmp.height - sh) / 2;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, lim.w, lim.h);
  bmp.close && bmp.close();
  let blob = await toBlob(canvas, 'image/webp', 0.9);
  if (blob && blob.type === 'image/webp') return { blob, type: 'image/webp', ext: 'webp' };
  blob = await toBlob(canvas, 'image/jpeg', 0.9);
  return { blob, type: 'image/jpeg', ext: 'jpg' };
}

// Caminho do arquivo dentro do bucket a partir da URL pública
export function storagePath(url) {
  if (!url) return null;
  const i = url.indexOf('/storage/v1/object/public/perfis/');
  return i === -1 ? null : decodeURIComponent(url.slice(i + '/storage/v1/object/public/perfis/'.length).split('?')[0]);
}

// Imagem para o chat: até 8 MB; GIF vai como está; as outras são reduzidas para no máximo 1600 px
export async function prepareChatImage(file) {
  if (!file) throw new Error('Nenhum arquivo escolhido.');
  if (file.size > 8 * 1024 * 1024) throw new Error('A imagem pode ter no máximo 8 MB.');
  const type = await sniff(file);
  if (!type) throw new Error('Formato não aceito. Use PNG, JPG, WebP ou GIF.');
  if (type === 'image/gif') return { blob: file, type, ext: 'gif' };
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (_) { throw new Error('Não consegui ler essa imagem.'); }
  if (bmp.width > 12000 || bmp.height > 12000) throw new Error('Imagem grande demais.');
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close && bmp.close();
  let blob = await toBlob(canvas, 'image/webp', 0.86);
  if (blob && blob.type === 'image/webp') return { blob, type: 'image/webp', ext: 'webp' };
  blob = await toBlob(canvas, 'image/jpeg', 0.86);
  return { blob, type: 'image/jpeg', ext: 'jpg' };
}
