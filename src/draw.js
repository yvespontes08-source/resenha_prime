// Bot Sorteador: comandos, janela de sorteio e cartão do resultado
import { h, colorFor } from './ui.js';

export const COMMANDS = [
  { cmd: '/times', desc: 'Divide a galera em times', example: '/times 2' },
  { cmd: '/sortear', desc: 'Sorteia pessoas (ex.: quem paga a pizza)', example: '/sortear 1' },
  { cmd: '/escolher', desc: 'Escolhe uma opção de uma lista', example: '/escolher pizza, açaí, hambúrguer' },
  { cmd: '/ordem', desc: 'Embaralha a ordem da galera', example: '/ordem' },
  { cmd: '/dado', desc: 'Rola dados', example: '/dado 2d6' },
  { cmd: '/moeda', desc: 'Cara ou coroa', example: '/moeda' },
  { cmd: '/numero', desc: 'Número aleatório', example: '/numero 1 100' }
];

// Transforma o texto digitado num pedido de sorteio. Retorna null se não for comando.
// { kind, count, min, max, items, modal }  — modal=true quando precisa escolher pessoas
export function parseCommand(text) {
  const t = text.trim();
  if (!t.startsWith('/')) return null;
  const [rawCmd, ...rest] = t.split(/\s+/);
  const cmd = rawCmd.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const arg = t.slice(rawCmd.length).trim();
  const n = (v, d) => { const x = parseInt(v, 10); return Number.isFinite(x) ? x : d; };
  switch (cmd) {
    case '/times': case '/time': return { kind: 'teams', count: n(rest[0], 2) };
    case '/sortear': return { kind: 'people', count: n(rest[0], 1) };
    case '/ordem': return { kind: 'order' };
    case '/escolher': {
      const items = arg.split(/\s*,\s*|\s+ou\s+/i).map((s) => s.trim()).filter(Boolean);
      if (items.length < 2) return { error: 'Escreva pelo menos 2 opções separadas por vírgula. Ex.: /escolher pizza, açaí' };
      return { kind: 'items', items, count: 1 };
    }
    case '/dado': {
      const m = (rest[0] || '1d6').toLowerCase().match(/^(\d+)?d?(\d+)$/);
      if (!m) return { error: 'Use assim: /dado 2d6 (2 dados de 6 lados) ou /dado 20' };
      const dice = m[1] && (rest[0] || '').toLowerCase().includes('d') ? n(m[1], 1) : 1;
      return { kind: 'dice', count: dice, max: n(m[2], 6) };
    }
    case '/moeda': return { kind: 'coin', count: n(rest[0], 1) };
    case '/numero': {
      if (rest.length >= 2) return { kind: 'number', min: n(rest[0], 1), max: n(rest[1], 100), count: 1 };
      if (rest.length === 1) return { kind: 'number', min: 1, max: n(rest[0], 100), count: 1 };
      return { kind: 'number', min: 1, max: 100, count: 1 };
    }
    default: return { error: `Comando ${rawCmd} não existe. Digite / para ver a lista.` };
  }
}

const TEAM_COLORS = ['#4c6ef5', '#e8590c', '#2f9e44', '#c2255c', '#7048e8', '#1098ad', '#d9480f', '#5c7cfa', '#0ca678', '#ae3ec9'];

function playerChip(p, nameColor) {
  return h('span', { class: 'draw-chip' + (p.id ? '' : ' guest'), style: p.id ? { borderColor: nameColor(p.id) || colorFor(p.id) } : null }, p.name);
}

// Cartão do resultado dentro da mensagem do bot
export function resultCard(payload, nameColor) {
  const card = h('div', { class: 'draw-card' });
  if (!payload || !payload.type) return card;
  if (payload.title) card.append(h('div', { class: 'draw-title' }, payload.title));
  const r = payload.result;
  switch (payload.type) {
    case 'teams': {
      const grid = h('div', { class: 'draw-teams' });
      (r || []).forEach((team, i) => {
        grid.append(h('div', { class: 'draw-team', style: { borderTopColor: TEAM_COLORS[i % TEAM_COLORS.length] } },
          h('div', { class: 'draw-team-name' }, team.name, h('span', null, `${team.players.length}`)),
          h('div', { class: 'draw-team-list' }, team.players.map((p) => playerChip(p, nameColor)))));
      });
      card.append(grid);
      break;
    }
    case 'people':
    case 'items':
      card.append(h('div', { class: 'draw-label' }, payload.type === 'people' ? `Sorteado entre ${payload.total}` : `Escolhido entre ${payload.total} opções`),
        h('div', { class: 'draw-winners' }, (r || []).map((p) => h('span', { class: 'draw-winner' }, p.name))));
      break;
    case 'order':
      card.append(h('ol', { class: 'draw-order' }, (r || []).map((p) => h('li', null, playerChip(p, nameColor)))));
      break;
    case 'dice': {
      const rolls = (r && r.rolls) || [];
      card.append(h('div', { class: 'draw-dice' }, rolls.map((v) => h('span', { class: 'die' }, String(v)))));
      if (rolls.length > 1) card.append(h('div', { class: 'draw-label' }, `Total: ${rolls.reduce((a, b) => a + b, 0)} · ${rolls.length}d${r.sides}`));
      else card.append(h('div', { class: 'draw-label' }, `Dado de ${r.sides} lados`));
      break;
    }
    case 'coin':
      card.append(h('div', { class: 'draw-winners' }, (r || []).map((v) => h('span', { class: 'draw-winner coin' }, v === 'Cara' ? '🙂 Cara' : '👑 Coroa'))));
      break;
    case 'number':
      card.append(h('div', { class: 'draw-winners' }, ((r && r.numbers) || []).map((v) => h('span', { class: 'draw-winner' }, String(v)))),
        h('div', { class: 'draw-label' }, `De ${r.min} a ${r.max}`));
      break;
  }
  return card;
}

export const BOT_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 17h5"/><circle cx="12" cy="3" r="1"/></svg>';
export const DICE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"/></svg>';
