import { config } from '../config.js';

/** Détecte le vrai type d'image à partir des premiers octets (le nom/type déclaré n'est pas fiable). */
export function sniffImageType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => bytes[i] === b)) return 'image/png';
  const ascii = (from, to) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function validateImageFile(file, maxBytes = config.maxImageBytes) {
  if (!file) return { ok: false, error: 'Aucun fichier sélectionné.' };
  if (file.size === 0) return { ok: false, error: 'Le fichier est vide.' };
  if (file.size > maxBytes) return { ok: false, error: `Image trop lourde (maximum ${Math.round(maxBytes / 1048576)} Mo).` };
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const type = sniffImageType(head);
  if (!type) return { ok: false, error: 'Format non pris en charge. Utilisez JPG, PNG ou WebP.' };
  return { ok: true, type, ext: EXT[type] };
}
