// Piccole funzioni di utilità condivise. Solo API web: niente moduli Node,
// così il codice gira identico in Cloudflare Workers e in Node.

export function roundQuarter(value) {
  return Math.round(value * 4) / 4;
}

/** 12.5 -> "12,5"; 10 -> "10". */
export function formatPoints(points) {
  const rounded = Math.round(points * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
}

export function slugify(value) {
  const slug = String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "verifica";
}

/** Identificatore casuale di 22 caratteri URL-safe. */
export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** "2026-11-12" -> "12/11/2026"; altrimenti stringa vuota. */
export function formatDateIt(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

export function letterFor(index) {
  return String.fromCharCode(97 + index);
}
