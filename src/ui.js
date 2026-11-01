// Utilidades de interface: criação de elementos, ícones, toast, menus e modais.

export const $ = (id) => document.getElementById(id);

// h('div', {class: 'x', onClick: fn}, 'texto', outroEl)
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v; // só com conteúdo nosso (ícones)
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const svg = (body, size = 20, sw = 2) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  mic: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/>'),
  micOff: svg('<path d="M2 2l20 20"/><path d="M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 5.1 2.1"/><path d="M19 10v1a7 7 0 0 1-.9 3.4M16.9 16.9A7 7 0 0 1 5 11v-1M12 18v4M8 22h8"/>'),
  head: svg('<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>'),
  headOff: svg('<path d="M2 2l20 20"/><path d="M3 18v-6a9 9 0 0 1 3-6.7M9.5 3.3A9 9 0 0 1 21 12v6"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>'),
  cam: svg('<path d="m22 8-6 4 6 4z"/><rect x="2" y="6" width="14" height="12" rx="2"/>'),
  camOff: svg('<path d="M2 2l20 20"/><path d="M16 16v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2m5 0h5a1 1 0 0 1 1 1v3.3l1 1L22 8v8"/>'),
  screen: svg('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="m9 10 3-3 3 3M12 7v6"/>'),
  screenOff: svg('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="m9 7 6 6M15 7l-6 6"/>'),
  hangup: svg('<path d="M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.5 12.8 12.8 0 0 0 2.8.7A2 2 0 0 1 22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9"/><path d="M22 2 2 22"/>'),
  gear: svg('<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
  full: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>', 18),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', 16),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>', 20),
  crown: svg('<path d="m2 18 2-11 5 5 3-7 3 7 5-5 2 11z"/>', 14),
  shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', 14),
  smallMicOff: svg('<path d="M2 2l20 20"/><path d="M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 5.1 2.1M19 10v1a7 7 0 0 1-.9 3.4M16.9 16.9A7 7 0 0 1 5 11v-1M12 18v4"/>', 14, 2.4),
  smallHeadOff: svg('<path d="M2 2l20 20"/><path d="M3 18v-6a9 9 0 0 1 3-6.7M9.5 3.3A9 9 0 0 1 21 12v6"/>', 14, 2.4),
  smallCam: svg('<path d="m22 8-6 4 6 4z"/><rect x="2" y="6" width="14" height="12" rx="2"/>', 14, 2.4)
};

export function iconEl(name, cls) {
  return h('span', { class: cls || 'ico', html: ICON[name], style: { display: 'inline-flex' } });
}

const COLORS = ['#4c6ef5', '#e8590c', '#2f9e44', '#c2255c', '#7048e8', '#1098ad', '#d9480f', '#5c7cfa', '#0ca678', '#ae3ec9'];
export function colorFor(id) {
  let x = 0;
  for (const c of String(id)) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[x % COLORS.length];
}
export function initial(name) {
  return (String(name || '?').trim().charAt(0) || '?').toUpperCase();
}
export function avatar(id, name, cls) {
  return h('span', { class: 'avatar' + (cls ? ' ' + cls : ''), style: { background: colorFor(id) }, 'aria-hidden': 'true' }, initial(name));
}

// ---------- Toast ----------
let toastTimer;
export function toast(text, ms = 2800) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- Menu de contexto ----------
export function closeMenu() { $('menu-layer').innerHTML = ''; }

// items: [{label, onClick, danger, icon}, 'sep', {title}, {node}]
export function openMenu(anchor, items, opts = {}) {
  closeMenu();
  const menu = h('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (!it) continue;
    if (it === 'sep') { menu.append(h('div', { class: 'menu-sep' })); continue; }
    if (it.title) { menu.append(h('div', { class: 'menu-title' }, it.title)); continue; }
    if (it.node) { menu.append(it.node); continue; }
    const b = h('button', { class: 'menu-item' + (it.danger ? ' danger' : ''), role: 'menuitem' }, it.swatch ? h('span', { class: 'swatch', style: { background: it.swatch } }) : null, it.label);
    b.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); it.onClick && it.onClick(); });
    menu.append(b);
  }
  $('menu-layer').append(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = opts.side === 'right' ? r.right + 8 : r.left;
  let y = opts.side === 'right' ? r.top : r.bottom + 6;
  if (opts.above) y = r.top - mh - 6;
  x = Math.max(8, Math.min(x, innerWidth - mw - 8));
  y = Math.max(8, Math.min(y, innerHeight - mh - 8));
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  const first = menu.querySelector('button');
  if (first) first.focus({ preventScroll: true });
  setTimeout(() => {
    const off = (e) => {
      if (menu.contains(e.target)) return;
      closeMenu();
      document.removeEventListener('mousedown', off);
      document.removeEventListener('keydown', esc);
    };
    const esc = (e) => { if (e.key === 'Escape') { closeMenu(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', esc);
  });
  return menu;
}

// ---------- Modal ----------
export function closeModal() { $('modal-layer').innerHTML = ''; }

export function openModal({ title, body, actions = [], wide }) {
  closeModal();
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' },
      h('h2', null, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Fechar', html: ICON.close, onClick: closeModal })),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-foot' }, actions) : null);
  const bg = h('div', { class: 'modal-bg' }, box);
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) closeModal(); });
  bg.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  $('modal-layer').append(bg);
  const f = box.querySelector('input, select, textarea, .modal-foot button');
  if (f) f.focus();
  return box;
}

export function confirmModal({ title, text, confirm = 'Confirmar', danger }) {
  return new Promise((resolve) => {
    const ok = h('button', { class: 'btn ' + (danger ? 'danger' : 'primary') }, confirm);
    const cancel = h('button', { class: 'btn secondary' }, 'Cancelar');
    openModal({ title, body: h('p', { class: 'muted', style: { margin: 0 } }, text), actions: [cancel, ok] });
    ok.addEventListener('click', () => { closeModal(); resolve(true); });
    cancel.addEventListener('click', () => { closeModal(); resolve(false); });
  });
}

export function field(label, input) {
  const id = 'f-' + Math.random().toString(36).slice(2, 8);
  input.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), input);
}

export function linkify(container, text) {
  for (const part of text.split(/(https?:\/\/[^\s<]+)/g)) {
    if (/^https?:\/\//.test(part)) container.append(h('a', { href: part, target: '_blank', rel: 'noopener noreferrer' }, part));
    else if (part) container.append(document.createTextNode(part));
  }
}

export function fmtTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Hoje às ${time}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Ontem às ${time}`;
  return `${d.toLocaleDateString('pt-BR')} ${time}`;
}

let ctx;
export function beep(from, to) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(from, ctx.currentTime);
    o.frequency.linearRampToValueAtTime(to, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.2);
  } catch (_) {}
}
