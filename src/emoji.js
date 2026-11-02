// Seletor de emojis simples (sem bibliotecas de fora)
import { h, closeMenu } from './ui.js';

const CATS = [
  ['Rostos', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👻 👽 🤖'],
  ['Gestos', '👋 🤚 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 💪 🦾 🫡 🫶 👀 🧠 🗣️'],
  ['Corações', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 ⚡'],
  ['Jogos e coisas', '🎮 🕹️ 🎧 🎤 🎵 🎶 📺 💻 🖥️ 📱 ⌨️ 🖱️ 📷 🎬 🏆 🥇 🥈 🥉 🎯 🎲 ♟️ ⚽ 🏀 🏐 🎉 🎊 🎁 🎈 💰 💸 📌 📎 ✏️ 📚 📝 ⏰ 🔔 🔕 💡 🔒 🔑 🛠️ 🚀 ✈️ 🚗 🏠'],
  ['Comida', '🍕 🍔 🍟 🌭 🥪 🌮 🌯 🍝 🍜 🍣 🍱 🍗 🥩 🥓 🍳 🥞 🧇 🍞 🧀 🥗 🍿 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍦 🍉 🍓 🍇 🍌 🍍 🥭 🍎 ☕ 🍵 🧃 🥤 🍺 🍻 🧉'],
  ['Natureza', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦅 🦉 🐺 🐴 🦄 🐝 🦋 🐌 🐢 🐍 🦖 🐙 🦈 🐬 🐳 🌵 🌴 🌲 🌻 🌹 🍀 🌈 ☀️ 🌙 ⛈️ ❄️ 🌊']
];

const RECENT_KEY = 'resenha:emojis-recentes';
function recents() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (_) { return []; }
}
function pushRecent(e) {
  const list = [e, ...recents().filter((x) => x !== e)].slice(0, 24);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

// Abre o seletor acima do botão; onPick(emoji) insere no texto
export function openEmojiPicker(anchor, onPick) {
  const layer = document.getElementById('menu-layer');
  closeMenu();
  const grid = h('div', { class: 'emoji-grid', role: 'listbox', 'aria-label': 'Emojis' });
  const tabs = h('div', { class: 'emoji-tabs', role: 'tablist' });
  const cats = [['Recentes', recents().join(' ')], ...CATS].filter(([, list]) => list.trim());
  const show = (i) => {
    grid.innerHTML = '';
    tabs.querySelectorAll('button').forEach((b, j) => b.classList.toggle('active', j === i));
    for (const e of cats[i][1].split(' ').filter(Boolean)) {
      const b = h('button', { type: 'button', class: 'emoji-btn', title: e, 'aria-label': e }, e);
      b.addEventListener('click', () => { pushRecent(e); onPick(e); });
      grid.append(b);
    }
  };
  cats.forEach(([name, list], i) => {
    const first = list.split(' ').filter(Boolean)[0];
    const t = h('button', { type: 'button', class: 'emoji-tab', title: name, 'aria-label': name, role: 'tab' }, first);
    t.addEventListener('click', () => show(i));
    tabs.append(t);
  });
  const pop = h('div', { class: 'menu emoji-pop' }, tabs, grid);
  layer.append(pop);
  show(0);
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.right - pop.offsetWidth, innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = Math.max(8, r.top - pop.offsetHeight - 8) + 'px';
  setTimeout(() => {
    const off = (e) => {
      if (pop.contains(e.target) || anchor.contains(e.target)) return;
      closeMenu();
      document.removeEventListener('mousedown', off);
    };
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { closeMenu(); document.removeEventListener('keydown', esc); } });
  });
}
