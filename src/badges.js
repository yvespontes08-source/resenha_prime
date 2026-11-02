// Ícones das insígnias (desenhados para o Resenha, em SVG próprio)
import { h } from './ui.js';

const svg = (body) => `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
  fundador: svg('<path d="M12 2.5 14.6 8l6 .7-4.4 4.1 1.2 5.9L12 15.8l-5.4 2.9 1.2-5.9L3.4 8.7l6-.7z"/><path d="M12 7v5"/>'),
  veterano: svg('<path d="M12 3 4 6v5c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
  'papo-longo': svg('<path d="M4 15V6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-4 3z"/><path d="M20 9v8l-3-2.5H11"/>'),
  tagarela: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>'),
  coruja: svg('<path d="M5 8c0-3 3-5 7-5s7 2 7 5v6c0 4-3 7-7 7s-7-3-7-7z"/><circle cx="9" cy="10" r="2"/><circle cx="15" cy="10" r="2"/><path d="m11 14 1 1.2 1-1.2"/><path d="M5 5 3 3M19 5l2-2"/>'),
  madrugador: svg('<path d="M3 18h18"/><path d="M6.5 18a5.5 5.5 0 0 1 11 0"/><path d="M12 4v3M4.9 8.9 7 11M19.1 8.9 17 11M2 14h2M20 14h2"/>'),
  apresentador: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="m10 8 4 2-4 2z"/>'),
  cineasta: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="m3 7 3-4h3l-3 4M10 7l3-4h3l-3 4M17 7l3-4"/><path d="m10.5 11 4 2.5-4 2.5z"/>'),
  personalizado: svg('<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8h2.1A4.3 4.3 0 0 0 21 10.7C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>')
};

const RARITY_LABEL = { comum: 'Comum', rara: 'Rara', lendaria: 'Lendária' };

export function badgeIcon(def, earnedAt, opts = {}) {
  const date = earnedAt ? new Date(earnedAt).toLocaleDateString('pt-BR') : null;
  const title = `${def.name} (${RARITY_LABEL[def.rarity] || def.rarity}): ${def.description}` + (date ? ` · conquistada em ${date}` : ' · ainda não conquistada');
  return h('span', {
    class: `badge r-${def.rarity}` + (earnedAt ? '' : ' locked') + (opts.small ? ' small' : ''),
    title, role: 'img', 'aria-label': title, html: ICONS[def.icon] || ICONS.fundador
  });
}

export function badgeRow(defs, earned, max = 8) {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const list = earned.filter((e) => byId.has(e.badge_id)).sort((a, b) => byId.get(a.badge_id).sort - byId.get(b.badge_id).sort);
  if (!list.length) return null;
  const row = h('div', { class: 'badge-row' });
  list.slice(0, max).forEach((e) => row.append(badgeIcon(byId.get(e.badge_id), e.earned_at, { small: true })));
  if (list.length > max) row.append(h('span', { class: 'badge-more', title: `Mais ${list.length - max}` }, `+${list.length - max}`));
  return row;
}

export { RARITY_LABEL };
