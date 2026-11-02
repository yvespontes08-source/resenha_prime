// Resenha v2 — app principal: login, salas, cargos, chat salvo e call.
import { createClient } from '@supabase/supabase-js';
import {
  $, h, ICON, avatar, colorFor, toast, openMenu, closeMenu, openModal, closeModal, confirmModal,
  field, linkify, fmtTime, STATUS, statusDot, setBeepsMuted
} from './ui.js';
import { prepareImage, storagePath } from './profile.js';
import {
  call, joinCall, leaveCall, toggleMic, setDeafened, toggleCam, toggleScreen, participants, renderStage,
  getVolume, setVolume, loadSettings, saveSettings, switchDevice, applyAudioFilters, listDevices
} from './call.js';

// ================= Estado =================
let sb = null;
let cfg = null;
let session = null;
let me = null;              // { id, display_name }
let rooms = [];             // salas em que sou membro
let current = null;         // sala aberta
let members = [];           // membros da sala aberta
let roles = [];             // cargos da sala aberta
let view = 'chat';
let roomChannel = null;
let meChannel = null;
let oldestId = null;
let lastMsg = null;
let previewTimer = null;
let callPreview = [];       // quem está na call (antes de eu entrar)
const names = new Map();    // id -> display_name
const profs = new Map();    // id -> { display_name, avatar_url, banner_url }
let myStatus = 'online';    // escolhido: online | idle | dnd | invisible
let autoIdle = false;       // ausente automático por inatividade
let presenceChannel = null;
let presenceState = {};
let lastActivity = Date.now();
let installPrompt = null;
let started = false;

const ROLE_LABEL = { owner: 'Dono', moderator: 'Moderador', member: 'Membro' };
const RANK = { owner: 3, moderator: 2, member: 1 };

// ================= Inicialização =================
boot();

async function boot() {
  const params = new URLSearchParams(location.search);
  const invite = params.get('convite');
  if (invite) {
    sessionStorage.setItem('resenha:invite', invite);
    params.delete('convite');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : ''));
  }
  try {
    cfg = await (await fetch('/config')).json();
  } catch (_) {
    $('boot').textContent = 'Não foi possível carregar. Recarregue a página.';
    return;
  }
  sb = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
  });

  sb.auth.onAuthStateChange((event, s) => {
    session = s;
    if (event === 'PASSWORD_RECOVERY') { showRecovery(); return; }
    if (s && !started && !recovering) setTimeout(startApp, 0);
    if (!s && started) location.reload();
  });
  const { data } = await sb.auth.getSession();
  session = data.session;
  $('boot').hidden = true;
  if (recovering) return;
  if (session) startApp(); else showAuth('login');

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; showInstall(true); });
  window.addEventListener('appinstalled', () => { installPrompt = null; showInstall(false); toast('App instalado! Procure por Resenha no menu Iniciar.', 4000); });
  $('install-auth').addEventListener('click', installApp);
  $('install-rail').addEventListener('click', installApp);
}

// ================= Instalar como app =================
function showInstall(v) {
  $('install-auth').hidden = !v;
  $('install-rail').hidden = !v;
}
async function installApp() {
  if (!installPrompt) {
    toast('Use o ícone de instalar na barra de endereço do Chrome ou do Edge.', 4000);
    return;
  }
  installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  installPrompt = null;
  showInstall(false);
  if (choice && choice.outcome === 'accepted') toast('Instalando…');
}

// ================= Login =================
let authMode = 'login';
function showAuth(mode) {
  authMode = mode;
  $('auth-screen').hidden = false;
  $('app').hidden = true;
  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';
  $('auth-title').textContent = isSignup ? 'Criar conta' : isForgot ? 'Recuperar senha' : isReset ? 'Nova senha' : 'Bem-vindo de volta!';
  $('auth-sub').textContent = isSignup ? 'É rapidinho.' : isForgot ? 'Vamos te mandar um link por e-mail.' : isReset ? 'Escolha uma senha nova.' : 'Entre para ver suas salas.';
  $('name-field').hidden = !isSignup;
  $('auth-name').required = isSignup;
  $('email-field').hidden = isReset;
  $('auth-email').required = !isReset;
  $('pass-field').hidden = isForgot;
  $('auth-pass').required = !isForgot;
  $('auth-pass').autocomplete = isSignup || isReset ? 'new-password' : 'current-password';
  $('forgot-link').hidden = mode !== 'login';
  $('oauth-box').hidden = isForgot || isReset;
  $('auth-submit').textContent = isSignup ? 'Criar conta' : isForgot ? 'Enviar link' : isReset ? 'Salvar senha' : 'Entrar';
  $('switch-text').textContent = isSignup ? 'Já tem conta?' : isForgot || isReset ? '' : 'Ainda não tem conta?';
  $('switch-btn').textContent = isSignup || isForgot || isReset ? 'Voltar para o login' : 'Criar conta';
  $('auth-msg').textContent = '';
  $('auth-msg').className = 'msg';
}

let recovering = false;
function showRecovery() {
  recovering = true;
  showAuth('reset');
}

$('switch-btn').addEventListener('click', () => showAuth(authMode === 'login' ? 'signup' : 'login'));
$('forgot-link').addEventListener('click', () => showAuth('forgot'));

$('google-btn').addEventListener('click', async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
  if (error) authMsg(traduzir(error.message));
});

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('auth-email').value.trim();
  const pass = $('auth-pass').value;
  const btn = $('auth-submit');
  btn.disabled = true;
  authMsg('');
  try {
    if (authMode === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
    } else if (authMode === 'signup') {
      const name = $('auth-name').value.trim();
      const { data, error } = await sb.auth.signUp({
        email, password: pass, options: { data: { display_name: name }, emailRedirectTo: location.origin }
      });
      if (error) throw error;
      if (!data.session) authMsg('Conta criada! Confira seu e-mail para confirmar e depois entre.', true);
    } else if (authMode === 'forgot') {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
      if (error) throw error;
      authMsg('Se esse e-mail tiver conta, o link de recuperação chega em instantes.', true);
    } else if (authMode === 'reset') {
      const { error } = await sb.auth.updateUser({ password: pass });
      if (error) throw error;
      authMsg('Senha alterada!', true);
      setTimeout(() => location.replace('/'), 800);
    }
  } catch (err) {
    authMsg(traduzir(err.message));
  } finally {
    btn.disabled = false;
  }
});

function authMsg(text, ok) {
  $('auth-msg').textContent = text;
  $('auth-msg').className = 'msg' + (ok ? ' ok' : '');
}

function traduzir(msg) {
  const m = String(msg || '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).';
  if (/User already registered/i.test(m)) return 'Esse e-mail já tem conta. Tente entrar.';
  if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/rate limit|security purposes/i.test(m)) return 'Muitas tentativas. Espere um pouco e tente de novo.';
  if (/provider is not enabled/i.test(m)) return 'Login com Google ainda não foi ativado no projeto.';
  if (/JWT|session/i.test(m) && /expired|missing/i.test(m)) return 'Sua sessão expirou. Entre de novo.';
  return m || 'Algo deu errado.';
}

// ================= App =================
async function api(path, body) {
  const { data } = await sb.auth.getSession();
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session ? data.session.access_token : ''}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Erro no servidor.');
  return json;
}

async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(traduzir(error.message));
  return data;
}

async function startApp() {
  if (started || recovering) return;
  started = true;
  $('auth-screen').hidden = true;
  $('app').hidden = false;

  const uid = session.user.id;
  let prof = null;
  for (let i = 0; i < 5 && !prof; i++) {
    const { data } = await sb.from('profiles').select('id, display_name, avatar_url, banner_url').eq('id', uid).maybeSingle();
    prof = data;
    if (!prof) await new Promise((r) => setTimeout(r, 400));
  }
  me = prof || { id: uid, display_name: session.user.email.split('@')[0] };
  setProf(me);
  try {
    const { data: st } = await sb.from('user_status').select('status').eq('user_id', uid).maybeSingle();
    if (st && STATUS[st.status]) myStatus = st.status;
  } catch (_) {}
  setBeepsMuted(myStatus === 'dnd');
  renderMe();
  startPresence();

  call.onChange = onCallChange;
  call.avatarUrl = (id) => (profs.get(id) || {}).avatar_url || null;
  wireStatic();
  subscribeMe();
  await loadRooms();

  const last = localStorage.getItem('resenha:last-room');
  const pick = rooms.find((r) => r.id === last) || rooms[0];
  if (pick) await openRoom(pick.id); else renderEmpty();

  const invite = sessionStorage.getItem('resenha:invite');
  if (invite) { sessionStorage.removeItem('resenha:invite'); handleInvite(invite); }
  onCallChange();
}

function setProf(p) {
  if (!p || !p.id) return;
  const old = profs.get(p.id) || {};
  const merged = { ...old, ...p };
  profs.set(p.id, merged);
  if (merged.display_name) names.set(p.id, merged.display_name);
}
function avatarOf(id, name, cls, withStatus) {
  const p = profs.get(id) || {};
  return avatar(id, name || p.display_name || names.get(id), cls, p.avatar_url, withStatus ? statusOf(id) : null);
}

function renderMe() {
  $('me-name').textContent = me.display_name;
  const a = avatarOf(me.id, me.display_name, '', true);
  a.id = 'me-avatar';
  $('me-avatar').replaceWith(a);
  document.querySelector('.me-sub').textContent = STATUS[shownStatus()].label;
}

// ---------- Status e presença ----------
// O status que eu mostro para os outros (ausente automático conta aqui)
function shownStatus() {
  if (myStatus === 'invisible') return 'invisible';
  if (myStatus === 'online' && autoIdle) return 'idle';
  return myStatus;
}
// Status de qualquer pessoa como eu enxergo
function statusOf(id) {
  if (me && id === me.id) {
    const s = shownStatus();
    return s === 'invisible' ? 'offline' : s;
  }
  const entry = presenceState[id] && presenceState[id][0];
  return entry && STATUS[entry.status] ? entry.status : 'offline';
}

function startPresence() {
  presenceChannel = sb.channel('presenca', { config: { presence: { key: me.id } } });
  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      presenceState = presenceChannel.presenceState();
      renderMembers();
      renderCallList();
    })
    .subscribe((st) => { if (st === 'SUBSCRIBED') publishPresence(); });

  const activity = () => {
    lastActivity = Date.now();
    if (autoIdle) { autoIdle = false; publishPresence(); renderMe(); }
  };
  ['mousemove', 'keydown', 'mousedown', 'touchstart', 'focus'].forEach((ev) => window.addEventListener(ev, activity, { passive: true }));
  setInterval(() => {
    if (myStatus === 'online' && !autoIdle && Date.now() - lastActivity > 10 * 60 * 1000 && !(call.room && !call.muted)) {
      autoIdle = true;
      publishPresence();
      renderMe();
    }
  }, 30000);
}

async function publishPresence() {
  if (!presenceChannel) return;
  try {
    if (myStatus === 'invisible') await presenceChannel.untrack();
    else await presenceChannel.track({ status: shownStatus(), at: Date.now() });
  } catch (_) {}
}

async function setMyStatus(s) {
  myStatus = s;
  autoIdle = false;
  setBeepsMuted(s === 'dnd');
  renderMe();
  renderMembers();
  publishPresence();
  const { error } = await sb.from('user_status').upsert({ user_id: me.id, status: s, updated_at: new Date().toISOString() });
  if (error) toast('Não consegui salvar o status (rodou o SQL do perfil?).');
  else toast(`Status: ${STATUS[s].label}`);
}

function renderEmpty() {
  current = null;
  $('room-title').textContent = 'Nenhuma sala';
  $('messages').innerHTML = '';
  $('messages').append(h('div', { class: 'empty-chat' },
    h('h2', null, 'Você ainda não está em nenhuma sala'),
    h('p', null, 'Crie uma sala no botão + ou entre por um link de convite.')));
  $('chat-input').disabled = true;
  $('members-panel').innerHTML = '';
  $('call-list').innerHTML = '';
  setView('chat');
}

// ---------- Salas ----------
async function loadRooms() {
  const { data, error } = await sb.from('room_members')
    .select('joined_at, rooms(id, name, is_public, invite_code, owner_id)')
    .eq('user_id', me.id)
    .order('joined_at', { ascending: true });
  if (error) { toast('Erro ao carregar suas salas.'); return; }
  rooms = (data || []).map((r) => r.rooms).filter(Boolean);
  renderRail();
}

function renderRail() {
  const box = $('rail-rooms');
  box.innerHTML = '';
  for (const r of rooms) {
    const b = h('button', {
      class: 'rail-room' + (current && current.id === r.id ? ' active' : ''),
      title: r.name, 'aria-label': r.name, style: { background: current && current.id === r.id ? '' : undefined }
    }, r.name.trim().charAt(0).toUpperCase());
    if (call.room && call.roomId === r.id) b.append(h('span', { class: 'live-dot', title: 'Você está na call desta sala' }));
    b.addEventListener('click', () => {
      if (innerWidth <= 560 && current && current.id === r.id) { $('app').classList.toggle('show-side'); return; }
      openRoom(r.id);
      if (innerWidth <= 560) $('app').classList.add('show-side');
    });
    box.append(b);
  }
}

async function openRoom(id) {
  const r = rooms.find((x) => x.id === id);
  if (!r) return;
  current = r;
  localStorage.setItem('resenha:last-room', id);
  $('room-title').textContent = r.name;
  $('chat-input').disabled = false;
  $('chat-input').placeholder = `Conversar em #chat`;
  renderRail();
  await Promise.all([loadMembers(), loadMessages(true)]);
  subscribeRoom(id);
  startPreviewPolling();
  setView(call.room && call.roomId === id ? 'call' : 'chat');
  onCallChange();
}

async function loadMembers() {
  if (!current) return;
  const id = current.id;
  const [m, rl] = await Promise.all([
    sb.from('room_members').select('user_id, base_role, role_id, joined_at, profiles(display_name, avatar_url, banner_url)').eq('room_id', id),
    sb.from('room_roles').select('*').eq('room_id', id).order('created_at')
  ]);
  if (!current || current.id !== id) return;
  members = (m.data || []).map((x) => ({ ...x, name: x.profiles ? x.profiles.display_name : 'Alguém' }));
  roles = rl.data || [];
  for (const x of members) setProf({ id: x.user_id, ...(x.profiles || {}) });
  const mine = members.find((x) => x.user_id === me.id);
  if (mine && mine.name !== me.display_name) { me.display_name = mine.name; renderMe(); }
  renderMembers();
}

function myMember() { return members.find((x) => x.user_id === me.id); }
function roleOf(m) { return m && m.role_id ? roles.find((r) => r.id === m.role_id) : null; }
function can(perm) {
  const m = myMember();
  if (!m) return false;
  if (m.base_role === 'owner' || m.base_role === 'moderator') return true;
  const r = roleOf(m);
  if (!r) return false;
  return { kick: r.can_kick, ban: r.can_ban, manage_roles: r.can_manage_roles, delete_messages: r.can_delete_messages }[perm] || false;
}
function canActOn(target, perm) {
  const mine = myMember();
  if (!mine || !target || target.user_id === me.id || !can(perm)) return false;
  if (target.base_role === 'owner') return false;
  return RANK[mine.base_role] > RANK[target.base_role] || target.base_role === 'member';
}
function nameColor(m) { const r = roleOf(m); return r ? r.color : null; }

function renderMembers() {
  const panel = $('members-panel');
  panel.innerHTML = '';
  if (!members.length) return;
  const groups = [];
  const online = members.filter((m) => statusOf(m.user_id) !== 'offline');
  const offline = members.filter((m) => statusOf(m.user_id) === 'offline');
  const owner = online.filter((m) => m.base_role === 'owner');
  const mods = online.filter((m) => m.base_role === 'moderator');
  groups.push(['Dono', owner], ['Moderadores', mods]);
  const rest = online.filter((m) => m.base_role === 'member');
  for (const r of roles) groups.push([r.name, rest.filter((m) => m.role_id === r.id)]);
  groups.push(['Online', rest.filter((m) => !m.role_id || !roles.some((r) => r.id === m.role_id))]);
  groups.push(['Offline', offline]);
  for (const [title, list] of groups) {
    if (!list.length) continue;
    panel.append(h('div', { class: 'mem-group' }, `${title} — ${list.length}`));
    for (const m of list.sort((a, b) => a.name.localeCompare(b.name))) {
      const st = statusOf(m.user_id);
      const b = h('button', { class: 'mem' + (st === 'offline' ? ' offline' : '') },
        avatarOf(m.user_id, m.name, '', true),
        h('span', { class: 'name', style: { color: nameColor(m) || '' } }, m.name),
        m.base_role === 'owner' ? h('span', { class: 'crown', html: ICON.crown, title: 'Dono' }) : null,
        m.base_role === 'moderator' ? h('span', { class: 'crown', html: ICON.shield, title: 'Moderador', style: { color: 'var(--accent)' } }) : null);
      b.addEventListener('click', () => memberMenu(b, m.user_id));
      panel.append(b);
    }
  }
}

function memberMenu(anchor, userId) {
  const m = members.find((x) => x.user_id === userId);
  const name = m ? m.name : names.get(userId) || 'Alguém';
  const items = [{ node: profileCard(userId, name, m) }];

  const inCall = call.room && call.room.remoteParticipants.get(userId);
  if (inCall) {
    const val = Math.round(getVolume(userId) * 100);
    const label = h('span', null, `Volume: ${val}%`);
    const range = h('input', { type: 'range', min: '0', max: '200', step: '5', value: String(val), 'aria-label': `Volume de ${name}` });
    range.addEventListener('input', () => { label.textContent = `Volume: ${range.value}%`; setVolume(userId, Number(range.value) / 100); });
    items.push('sep', { node: h('div', { class: 'menu-range' }, label, range) });
  }

  if (m && current) {
    const mod = [];
    if (canActOn(m, 'manage_roles')) {
      mod.push({ title: 'Cargo' });
      for (const r of roles) {
        mod.push({ label: (m.role_id === r.id ? '✓ ' : '') + r.name, swatch: r.color, onClick: () => doRpc('assign_role', { p_room: current.id, p_user: userId, p_role: r.id }, 'Cargo atualizado.') });
      }
      if (m.role_id) mod.push({ label: 'Remover cargo', onClick: () => doRpc('assign_role', { p_room: current.id, p_user: userId, p_role: null }, 'Cargo removido.') });
      if (!roles.length) mod.push({ label: 'Criar cargos…', onClick: rolesModal });
    }
    const mine = myMember();
    if (mine && mine.base_role === 'owner' && userId !== me.id) {
      mod.push('sep');
      if (m.base_role === 'member') mod.push({ label: 'Tornar moderador', onClick: () => doRpc('set_moderator', { p_room: current.id, p_user: userId, p_value: true }, `${name} agora é moderador.`) });
      if (m.base_role === 'moderator') mod.push({ label: 'Remover moderador', onClick: () => doRpc('set_moderator', { p_room: current.id, p_user: userId, p_value: false }, 'Moderador removido.') });
      mod.push({ label: 'Passar a posse da sala', onClick: async () => {
        if (await confirmModal({ title: 'Passar a posse', text: `${name} vira dono da sala e você vira moderador. Continuar?`, confirm: 'Passar posse', danger: true })) {
          doRpc('transfer_ownership', { p_room: current.id, p_user: userId }, 'Posse transferida.');
        }
      } });
    }
    if (canActOn(m, 'kick') || canActOn(m, 'ban')) mod.push('sep');
    if (canActOn(m, 'kick')) mod.push({ label: `Expulsar ${name}`, danger: true, onClick: () => moderate(userId, name, 'kick') });
    if (canActOn(m, 'ban')) mod.push({ label: `Banir ${name}`, danger: true, onClick: () => moderate(userId, name, 'ban') });
    if (mod.length) items.push('sep', ...mod);
  }
  openMenu(anchor, items, { side: anchor.closest('.members-panel') ? undefined : 'right' });
}

async function doRpc(name, args, okMsg) {
  try {
    await rpc(name, args);
    if (okMsg) toast(okMsg);
    await loadMembers();
    if (name === 'transfer_ownership') await loadRooms();
  } catch (err) { toast(err.message); }
}

function moderate(userId, name, action) {
  if (action === 'kick') {
    confirmModal({ title: `Expulsar ${name}?`, text: 'A pessoa sai da sala e da call, mas pode voltar se tiver o convite.', confirm: 'Expulsar', danger: true })
      .then((ok) => ok && runModerate(userId, action));
    return;
  }
  const reason = h('input', { maxlength: '200', placeholder: 'Opcional' });
  const ok = h('button', { class: 'btn danger' }, 'Banir');
  const cancel = h('button', { class: 'btn secondary', onClick: closeModal }, 'Cancelar');
  openModal({ title: `Banir ${name}?`, body: [h('p', { class: 'muted', style: { margin: 0 } }, 'A pessoa sai da sala e não consegue voltar, nem com convite.'), field('Motivo', reason)], actions: [cancel, ok] });
  ok.addEventListener('click', () => { closeModal(); runModerate(userId, action, reason.value.trim()); });
}

async function runModerate(userId, action, reason) {
  try {
    await api('/api/moderate', { roomId: current.id, userId, action, reason });
    toast(action === 'kick' ? 'Pessoa expulsa.' : 'Pessoa banida.');
    await loadMembers();
  } catch (err) { toast(err.message); }
}

// ---------- Tempo real ----------
function subscribeRoom(id) {
  if (roomChannel) sb.removeChannel(roomChannel);
  roomChannel = sb.channel('sala-' + id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${id}` }, (p) => {
      if (current && current.id === id) appendMessage(p.new, true);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => {
      const el = document.querySelector(`[data-mid="${p.old.id}"]`);
      if (el) el.remove();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${id}` }, () => loadMembers())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_roles', filter: `room_id=eq.${id}` }, () => loadMembers())
    .subscribe();
}

function subscribeMe() {
  meChannel = sb.channel('eu-' + me.id)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (p) => {
      if (!p.new || !p.new.id) return;
      setProf(p.new);
      if (p.new.id === me.id) { Object.assign(me, p.new); renderMe(); }
      const mem = members.find((x) => x.user_id === p.new.id);
      if (mem) { mem.name = p.new.display_name; renderMembers(); }
      renderCallList();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_members', filter: `user_id=eq.${me.id}` }, () => loadRooms())
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'room_members' }, async (p) => {
      const o = p.old || {};
      if (current && o.room_id === current.id && o.user_id !== me.id) { loadMembers(); return; }
      if (o.user_id !== me.id) return;
      const r = rooms.find((x) => x.id === o.room_id);
      if (!r) return;
      if (call.roomId === r.id) leaveCall();
      toast(`Você saiu ou foi removido da sala ${r.name}.`, 4000);
      await loadRooms();
      if (current && current.id === r.id) { if (rooms[0]) openRoom(rooms[0].id); else renderEmpty(); }
    })
    .subscribe();
}

// ---------- Chat ----------
async function loadMessages(reset) {
  if (!current) return;
  const id = current.id;
  let q = sb.from('messages').select('id, user_id, content, created_at').eq('room_id', id).order('id', { ascending: false }).limit(50);
  if (!reset && oldestId) q = q.lt('id', oldestId);
  const { data, error } = await q;
  if (error || !current || current.id !== id) return;
  const list = (data || []).reverse();
  await ensureNames(list.map((m) => m.user_id));
  const box = $('messages');
  if (reset) {
    box.innerHTML = '';
    lastMsg = null;
    oldestId = null;
  }
  const prevHeight = box.scrollHeight;
  const frag = document.createDocumentFragment();
  let prev = null;
  for (const m of list) { frag.append(messageEl(m, prev)); prev = m; }
  const oldMore = box.querySelector('.load-more, .empty-chat');
  if (oldMore) oldMore.remove();
  box.prepend(frag);
  if (list.length === 50) {
    const more = h('button', { class: 'btn secondary load-more' }, 'Carregar mensagens antigas');
    more.addEventListener('click', () => loadMessages(false));
    box.prepend(more);
  } else if (reset || !list.length) {
    box.prepend(h('div', { class: 'empty-chat' }, h('h2', null, `Bem-vindo a ${current.name}!`), h('p', null, 'Este é o começo do chat da sala.')));
  }
  if (list.length) oldestId = list[0].id;
  if (reset) { lastMsg = list[list.length - 1] || null; box.scrollTop = box.scrollHeight; }
  else box.scrollTop = box.scrollHeight - prevHeight;
}

async function ensureNames(ids) {
  const missing = [...new Set(ids)].filter((id) => !names.has(id));
  if (!missing.length) return;
  const { data } = await sb.from('profiles').select('id, display_name, avatar_url, banner_url').in('id', missing);
  for (const p of data || []) setProf(p);
}

function messageEl(m, prev) {
  const cont = prev && prev.user_id === m.user_id && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60 * 1000;
  const name = names.get(m.user_id) || 'Alguém';
  const mem = members.find((x) => x.user_id === m.user_id);
  const body = h('div', { class: 'msg-body' });
  if (!cont) {
    body.append(h('div', { class: 'msg-meta' },
      h('span', { class: 'msg-name', style: { color: nameColor(mem) || colorFor(m.user_id) } }, name),
      h('span', { class: 'msg-time' }, fmtTime(m.created_at))));
  }
  const text = h('div', { class: 'msg-text', title: cont ? fmtTime(m.created_at) : null });
  linkify(text, m.content);
  body.append(text);
  const row = h('div', { class: 'msg-row' + (cont ? ' cont' : ''), 'data-mid': String(m.id) }, avatarOf(m.user_id, name), body);
  if (m.user_id === me.id || can('delete_messages')) {
    const del = h('button', { class: 'icon-btn msg-del', title: 'Apagar mensagem', 'aria-label': 'Apagar mensagem', html: ICON.trash });
    del.addEventListener('click', async () => {
      const { error } = await sb.from('messages').delete().eq('id', m.id);
      if (error) toast('Não foi possível apagar.'); else row.remove();
    });
    row.append(del);
  }
  const nameEl = row.querySelector('.msg-name');
  if (nameEl) { nameEl.style.cursor = 'pointer'; nameEl.addEventListener('click', () => memberMenu(nameEl, m.user_id)); }
  return row;
}

async function appendMessage(m, live) {
  if (document.querySelector(`[data-mid="${m.id}"]`)) return;
  await ensureNames([m.user_id]);
  const box = $('messages');
  const empty = box.querySelector('.empty-chat');
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  box.append(messageEl(m, lastMsg));
  lastMsg = m;
  if (empty && live) { /* mantém a mensagem de boas-vindas */ }
  if (near || m.user_id === me.id) box.scrollTop = box.scrollHeight;
}

function wireChat() {
  const input = $('chat-input');
  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 200) + 'px'; };
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(); }
  });
  $('chat-form').addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });
  async function sendMessage() {
    const text = input.value.trim();
    if (!text || !current) return;
    input.value = '';
    autosize();
    const { data, error } = await sb.from('messages').insert({ room_id: current.id, user_id: me.id, content: text.slice(0, 2000) }).select().single();
    if (error) { toast(traduzir(error.message)); input.value = text; autosize(); return; }
    appendMessage(data, true);
  }
}

// ---------- Visões (chat / call) ----------
function setView(v) {
  view = v;
  $('ch-updates').classList.toggle('active', v === 'updates');
  $('ch-chat').classList.toggle('active', v === 'chat');
  $('ch-call').classList.toggle('active', v === 'call');
  $('updates-view').hidden = v !== 'updates';
  $('chat-view').hidden = v !== 'chat';
  $('call-view').hidden = v !== 'call';
  const icons = { updates: ICON.megaphone, chat: '#', call: ICON.mic };
  const titles = { updates: 'atualizações', chat: 'chat', call: 'Call' };
  $('top-icon').innerHTML = icons[v];
  $('top-title').textContent = titles[v];
  $('app').classList.remove('show-side');
  if (v === 'updates') renderUpdates();
  onCallChange();
}

// ---------- Canal de atualizações ----------
let updates = [];
async function loadUpdates() {
  try {
    const res = await fetch('/atualizacoes.json', { cache: 'no-cache' });
    updates = await res.json();
  } catch (_) { updates = []; }
  const latest = updates[0] && updates[0].versao;
  const seen = localStorage.getItem('resenha:versao-vista');
  $('updates-badge').hidden = !latest || seen === latest;
}

function renderUpdates() {
  const list = $('updates-list');
  list.innerHTML = '';
  list.append(h('div', { class: 'updates-head' },
    h('h2', null, 'O que há de novo no Resenha'),
    h('p', null, 'Toda atualização aparece aqui. Para pegar a versão nova, recarregue a página ou reabra o app.')));
  updates.forEach((u, i) => {
    const date = new Date(u.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    list.append(h('article', { class: 'update-card' + (i === 0 ? ' latest' : '') },
      h('div', { class: 'update-meta' },
        h('span', { class: 'update-version' }, 'v' + u.versao),
        i === 0 ? h('span', { class: 'new-badge' }, 'ATUAL') : null,
        h('span', { class: 'update-date' }, date)),
      h('h3', null, u.titulo),
      h('ul', null, u.itens.map((t) => h('li', null, t)))));
  });
  if (updates[0]) {
    localStorage.setItem('resenha:versao-vista', updates[0].versao);
    $('updates-badge').hidden = true;
  }
}

// ---------- Call: prévia de quem está lá ----------
function startPreviewPolling() {
  clearInterval(previewTimer);
  const tick = async () => {
    if (!current || (call.room && call.roomId === current.id) || !cfg.livekitReady) { callPreview = []; renderCallList(); return; }
    try {
      const id = current.id;
      const { participants: list } = await api(`/api/call-participants?roomId=${id}`);
      if (current && current.id === id) { callPreview = list || []; renderCallList(); renderCallEmpty(); }
    } catch (_) {}
  };
  tick();
  previewTimer = setInterval(tick, 15000);
}

function renderCallList() {
  const ul = $('call-list');
  ul.innerHTML = '';
  if (!current) return;
  const inThis = call.room && call.roomId === current.id;
  if (inThis) {
    for (const x of participants()) {
      const li = h('li', { 'data-identity': x.identity, class: x.speaking ? 'speaking' : '' },
        avatarOf(x.identity, x.name, 'sm ring'),
        h('span', { class: 'name', style: { color: nameColor(members.find((m) => m.user_id === x.identity)) || '' } }, x.name),
        h('span', { class: 'badges' },
          x.screen && !x.screen.isMuted ? h('span', { class: 'live-badge' }, 'AO VIVO') : null,
          x.camera && !x.camera.isMuted ? h('span', { html: ICON.smallCam, style: { display: 'inline-flex' } }) : null,
          x.muted ? h('span', { html: ICON.smallMicOff, style: { display: 'inline-flex' } }) : null,
          x.deafened ? h('span', { html: ICON.smallHeadOff, style: { display: 'inline-flex' } }) : null));
      if (!x.local) {
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => memberMenu(li, x.identity));
      }
      ul.append(li);
    }
  } else {
    for (const p of callPreview) {
      ul.append(h('li', null, avatarOf(p.identity, p.name, 'sm'), h('span', { class: 'name' }, p.name)));
    }
  }
}

function renderCallEmpty() {
  const inThis = call.room && call.roomId === current?.id;
  $('call-empty').hidden = inThis;
  $('stage-bar').hidden = !inThis;
  if (inThis || !current) return;
  const btn = $('join-call-btn');
  btn.disabled = call.connecting;
  if (!cfg.livekitReady) {
    $('call-empty-sub').textContent = 'A call ainda não foi configurada no servidor (faltam as chaves do LiveKit).';
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  if (call.connecting) btn.textContent = 'Conectando…';
  else if (call.room) btn.textContent = `Sair de ${call.roomName} e entrar aqui`;
  else btn.textContent = 'Entrar na call';
  $('call-empty-sub').textContent = callPreview.length
    ? `${callPreview.map((p) => p.name).join(', ')} ${callPreview.length === 1 ? 'está' : 'estão'} na call.`
    : 'Ninguém na call ainda. Que tal começar?';
}

function setBtn(el, on, iconOn, iconOff, labelOn, labelOff) {
  el.innerHTML = on ? iconOn : iconOff;
  el.title = on ? labelOn : labelOff;
  el.setAttribute('aria-label', el.title);
}

function onCallChange() {
  // Controles do painel do usuário
  setBtn($('mic-btn'), !call.muted, ICON.mic, ICON.micOff, 'Desativar microfone', 'Ativar microfone');
  $('mic-btn').classList.toggle('off', call.muted);
  setBtn($('deaf-btn'), !call.deafened, ICON.head, ICON.headOff, 'Desativar áudio', 'Ativar áudio');
  $('deaf-btn').classList.toggle('off', call.deafened);
  $('settings-btn').innerHTML = ICON.gear;

  const connected = Boolean(call.room);
  $('voice-bar').hidden = !connected && !call.connecting;
  if (connected || call.connecting) {
    const state = call.room ? call.room.state : 'connecting';
    const ok = state === 'connected';
    $('vb-title').className = 'vb-title' + (ok ? '' : ' warn');
    $('vb-title').innerHTML = '';
    $('vb-title').append(h('span', { class: 'dot' }), ok ? 'Voz conectada' : state === 'reconnecting' ? 'Reconectando…' : 'Conectando…');
    $('vb-sub').textContent = `Call / ${call.roomName}`;
    $('hangup-btn').innerHTML = ICON.hangup;
    const lp = call.room ? call.room.localParticipant : null;
    const camOn = Boolean(lp && lp.isCameraEnabled);
    const scrOn = Boolean(lp && lp.isScreenShareEnabled);
    setBtn($('cam-btn'), !camOn, ICON.cam, ICON.camOff, 'Ligar câmera', 'Desligar câmera');
    $('cam-btn').classList.toggle('on', camOn);
    setBtn($('screen-btn'), !scrOn, ICON.screen, ICON.screenOff, 'Transmitir tela', 'Parar transmissão');
    $('screen-btn').classList.toggle('on', scrOn);
    // Barra do palco
    setBtn($('mic-btn-2'), !call.muted, ICON.mic, ICON.micOff, 'Desativar microfone', 'Ativar microfone');
    $('mic-btn-2').classList.toggle('off', call.muted);
    setBtn($('cam-btn-2'), !camOn, ICON.cam, ICON.camOff, 'Ligar câmera', 'Desligar câmera');
    $('cam-btn-2').classList.toggle('on', camOn);
    setBtn($('screen-btn-2'), !scrOn, ICON.screen, ICON.screenOff, 'Transmitir tela', 'Parar transmissão');
    $('screen-btn-2').classList.toggle('on', scrOn);
    $('hangup-btn-2').innerHTML = ICON.hangup;
  }
  if (!current) return;
  const inThis = connected && call.roomId === current.id;
  $('top-sub').textContent = view === 'call' && inThis ? `${participants().length} na call` : '';
  renderCallList();
  renderCallEmpty();
  if (view === 'call' && inThis) renderStage();
  else $('stage').innerHTML = '';
  renderRail();
}

async function enterCall() {
  if (!current) return;
  if (!cfg.livekitReady) { toast('A call ainda não foi configurada no servidor.'); return; }
  setView('call');
  await joinCall(current.id, current.name, (roomId) => api('/api/livekit-token', { roomId }));
  startPreviewPolling();
}

// ---------- Modais ----------
function createRoomModal() {
  const name = h('input', { maxlength: '50', placeholder: 'Ex.: Resenha dos amigos', required: true });
  const pub = h('input', { type: 'checkbox' });
  const msg = h('p', { class: 'msg' });
  const ok = h('button', { class: 'btn primary' }, 'Criar sala');
  openModal({
    title: 'Criar uma sala',
    body: [field('Nome da sala', name), h('label', { class: 'check' }, pub, 'Sala pública (aparece em Explorar)'), msg],
    actions: [h('button', { class: 'btn secondary', onClick: closeModal }, 'Cancelar'), ok]
  });
  const submit = async () => {
    if (!name.value.trim()) { msg.textContent = 'Dê um nome para a sala.'; return; }
    ok.disabled = true;
    try {
      const room = await rpc('create_room', { p_name: name.value.trim(), p_public: pub.checked });
      closeModal();
      await loadRooms();
      await openRoom(room.id);
      inviteModal();
    } catch (err) { msg.textContent = err.message; ok.disabled = false; }
  };
  ok.addEventListener('click', submit);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

async function exploreModal() {
  const list = h('div', { class: 'list' }, h('p', { class: 'muted' }, 'Carregando…'));
  openModal({ title: 'Salas públicas', body: list });
  const { data } = await sb.from('rooms').select('id, name').eq('is_public', true).order('created_at', { ascending: false }).limit(50);
  list.innerHTML = '';
  const others = (data || []).filter((r) => !rooms.some((x) => x.id === r.id));
  if (!others.length) { list.append(h('p', { class: 'muted' }, 'Nenhuma sala pública nova por enquanto.')); return; }
  for (const r of others) {
    const b = h('button', { class: 'btn primary' }, 'Entrar');
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { await rpc('join_room', { p_room: r.id, p_code: null }); closeModal(); await loadRooms(); openRoom(r.id); }
      catch (err) { toast(err.message); b.disabled = false; }
    });
    list.append(h('div', { class: 'list-item' }, avatar(r.id, r.name), h('div', { class: 'grow' }, h('div', { class: 'title' }, r.name)), b));
  }
}

function inviteLink() { return `${location.origin}/?convite=${current.invite_code}`; }

function inviteModal() {
  if (!current) return;
  const input = h('input', { readonly: true, value: inviteLink(), 'aria-label': 'Link de convite' });
  const copy = h('button', { class: 'btn primary' }, 'Copiar');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(input.value); copy.textContent = 'Copiado!'; }
    catch (_) { input.select(); document.execCommand('copy'); copy.textContent = 'Copiado!'; }
  });
  const body = [h('p', { class: 'muted', style: { margin: 0 } }, 'Mande este link para a galera. Quem abrir entra na sala depois de fazer login.'), h('div', { class: 'invite-box' }, input, copy)];
  const mine = myMember();
  if (mine && RANK[mine.base_role] >= 2) {
    const reset = h('button', { class: 'link' }, 'Gerar um link novo (o antigo para de funcionar)');
    reset.addEventListener('click', async () => {
      try {
        const code = await rpc('reset_invite', { p_room: current.id });
        current.invite_code = code;
        input.value = inviteLink();
        copy.textContent = 'Copiar';
        toast('Novo link gerado.');
      } catch (err) { toast(err.message); }
    });
    body.push(reset);
  }
  openModal({ title: `Convidar para ${current.name}`, body });
}

async function handleInvite(code) {
  try {
    const data = await rpc('invite_preview', { p_code: code });
    const info = Array.isArray(data) ? data[0] : null;
    if (!info) { toast('Esse convite não existe mais.'); return; }
    if (info.already_member) { await loadRooms(); openRoom(info.room_id); return; }
    if (info.banned) { toast('Você foi banido dessa sala.'); return; }
    const ok = h('button', { class: 'btn primary' }, 'Entrar na sala');
    openModal({
      title: 'Você foi convidado!',
      body: h('div', { class: 'list-item' }, avatar(info.room_id, info.name, 'lg'), h('div', { class: 'grow' }, h('div', { class: 'title' }, info.name), h('div', { class: 'sub' }, `${info.member_count} ${info.member_count == 1 ? 'membro' : 'membros'}`))),
      actions: [h('button', { class: 'btn secondary', onClick: closeModal }, 'Agora não'), ok]
    });
    ok.addEventListener('click', async () => {
      ok.disabled = true;
      try { const id = await rpc('join_room', { p_room: null, p_code: code }); closeModal(); await loadRooms(); openRoom(id); }
      catch (err) { toast(err.message); ok.disabled = false; }
    });
  } catch (err) { toast(err.message); }
}

function roomSettingsModal() {
  const name = h('input', { maxlength: '50', value: current.name });
  const pub = h('input', { type: 'checkbox', checked: current.is_public });
  const save = h('button', { class: 'btn primary' }, 'Salvar');
  const del = h('button', { class: 'btn danger', style: { marginRight: 'auto' } }, 'Excluir sala');
  openModal({
    title: 'Configurações da sala',
    body: [field('Nome da sala', name), h('label', { class: 'check' }, pub, 'Sala pública (aparece em Explorar)')],
    actions: [del, h('button', { class: 'btn secondary', onClick: closeModal }, 'Cancelar'), save]
  });
  save.addEventListener('click', async () => {
    try {
      await rpc('update_room', { p_room: current.id, p_name: name.value.trim(), p_public: pub.checked });
      closeModal(); await loadRooms(); openRoom(current.id); toast('Sala atualizada.');
    } catch (err) { toast(err.message); }
  });
  del.addEventListener('click', async () => {
    const ok = await confirmModal({ title: `Excluir ${current.name}?`, text: 'Todas as mensagens e cargos serão apagados. Isso não tem volta.', confirm: 'Excluir', danger: true });
    if (!ok) return;
    try {
      const id = current.id;
      if (call.roomId === id) await leaveCall();
      await rpc('delete_room', { p_room: id });
      await loadRooms();
      if (rooms[0]) openRoom(rooms[0].id); else renderEmpty();
      toast('Sala excluída.');
    } catch (err) { toast(err.message); }
  });
}

const ROLE_COLORS = ['#99aab5', '#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#e91e63', '#f1c40f', '#e67e22', '#e74c3c', '#607d8b'];

function rolesModal() {
  const list = h('div', { class: 'list' });
  const render = () => {
    list.innerHTML = '';
    if (!roles.length) list.append(h('p', { class: 'muted', style: { margin: 0 } }, 'Nenhum cargo ainda. Crie um para organizar a galera.'));
    for (const r of roles) {
      const perms = [r.can_kick && 'expulsar', r.can_ban && 'banir', r.can_manage_roles && 'gerenciar cargos', r.can_delete_messages && 'apagar mensagens'].filter(Boolean);
      const count = members.filter((m) => m.role_id === r.id).length;
      const edit = h('button', { class: 'btn secondary' }, 'Editar');
      edit.addEventListener('click', () => roleEditModal(r));
      list.append(h('div', { class: 'list-item' },
        h('span', { class: 'swatch', style: { background: r.color, width: '16px', height: '16px' } }),
        h('div', { class: 'grow' }, h('div', { class: 'title', style: { color: r.color } }, r.name),
          h('div', { class: 'sub' }, `${count} ${count === 1 ? 'pessoa' : 'pessoas'} · ${perms.length ? perms.join(', ') : 'sem permissões extras'}`)),
        edit));
    }
  };
  render();
  const add = h('button', { class: 'btn primary' }, 'Criar cargo');
  add.addEventListener('click', () => roleEditModal(null));
  openModal({
    title: 'Cargos', wide: true,
    body: [h('p', { class: 'hint' }, 'Para dar um cargo a alguém, clique no nome da pessoa na lista de membros.'), list],
    actions: [h('button', { class: 'btn secondary', onClick: closeModal }, 'Fechar'), add]
  });
}

function roleEditModal(role) {
  const name = h('input', { maxlength: '32', value: role ? role.name : '', placeholder: 'Ex.: Veterano' });
  let color = role ? role.color : ROLE_COLORS[1];
  const row = h('div', { class: 'color-row' });
  const custom = h('input', { type: 'color', value: color, 'aria-label': 'Cor personalizada' });
  const paint = () => row.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.c === color));
  for (const c of ROLE_COLORS) {
    const b = h('button', { type: 'button', 'data-c': c, style: { background: c }, 'aria-label': `Cor ${c}` });
    b.addEventListener('click', () => { color = c; custom.value = c; paint(); });
    row.append(b);
  }
  custom.addEventListener('input', () => { color = custom.value; paint(); });
  row.append(custom);
  paint();
  const perm = (label, key, permName) => {
    const cb = h('input', { type: 'checkbox', checked: role ? role[key] : false, disabled: !can(permName) });
    return { cb, el: h('label', { class: 'check', title: can(permName) ? '' : 'Você não tem essa permissão para dar' }, cb, label) };
  };
  const pk = perm('Expulsar membros', 'can_kick', 'kick');
  const pb = perm('Banir membros', 'can_ban', 'ban');
  const pm = perm('Gerenciar cargos', 'can_manage_roles', 'manage_roles');
  const pd = perm('Apagar mensagens dos outros', 'can_delete_messages', 'delete_messages');
  const save = h('button', { class: 'btn primary' }, role ? 'Salvar' : 'Criar');
  const actions = [h('button', { class: 'btn secondary', onClick: rolesModal }, 'Voltar'), save];
  if (role) {
    const del = h('button', { class: 'btn danger', style: { marginRight: 'auto' } }, 'Apagar cargo');
    del.addEventListener('click', async () => {
      try { await rpc('delete_role', { p_role: role.id }); await loadMembers(); rolesModal(); toast('Cargo apagado.'); }
      catch (err) { toast(err.message); }
    });
    actions.unshift(del);
  }
  openModal({
    title: role ? `Editar ${role.name}` : 'Novo cargo',
    body: [field('Nome do cargo', name), h('div', { class: 'field' }, h('span', { class: 'label' }, 'Cor'), row),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Permissões'), h('div', { class: 'perm-grid' }, pk.el, pb.el, pm.el, pd.el))],
    actions
  });
  save.addEventListener('click', async () => {
    if (!name.value.trim()) { toast('Dê um nome para o cargo.'); return; }
    const args = { p_name: name.value.trim(), p_color: color, p_kick: pk.cb.checked, p_ban: pb.cb.checked, p_manage: pm.cb.checked, p_delete: pd.cb.checked };
    try {
      if (role) await rpc('update_role', { p_role: role.id, ...args });
      else await rpc('create_role', { p_room: current.id, ...args });
      await loadMembers();
      rolesModal();
      toast(role ? 'Cargo salvo.' : 'Cargo criado.');
    } catch (err) { toast(err.message); }
  });
}

async function bansModal() {
  const list = h('div', { class: 'list' }, h('p', { class: 'muted' }, 'Carregando…'));
  openModal({ title: 'Banidos', body: list });
  try {
    const data = await rpc('list_bans', { p_room: current.id });
    list.innerHTML = '';
    if (!data.length) { list.append(h('p', { class: 'muted', style: { margin: 0 } }, 'Ninguém foi banido.')); return; }
    for (const b of data) {
      const un = h('button', { class: 'btn secondary' }, 'Desbanir');
      un.addEventListener('click', async () => {
        try { await rpc('unban_member', { p_room: current.id, p_user: b.user_id }); bansModal(); toast('Desbanido.'); }
        catch (err) { toast(err.message); }
      });
      list.append(h('div', { class: 'list-item' }, avatarOf(b.user_id, b.display_name),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, b.display_name), h('div', { class: 'sub' }, b.reason || 'Sem motivo')), un));
    }
  } catch (err) { list.innerHTML = ''; list.append(h('p', { class: 'msg' }, err.message)); }
}

// Cartão de perfil (aparece no menu ao clicar em alguém)
function profileCard(userId, name, m) {
  const p = profs.get(userId) || {};
  const st = statusOf(userId);
  const banner = h('div', { class: 'pcard-banner', style: { background: p.banner_url ? 'var(--bg-0)' : colorFor(userId) } },
    p.banner_url ? h('img', { src: p.banner_url, alt: '', referrerpolicy: 'no-referrer' }) : null);
  const role = m ? `${ROLE_LABEL[m.base_role]}${roleOf(m) ? ' · ' + roleOf(m).name : ''}` : null;
  return h('div', { class: 'pcard' },
    banner,
    h('div', { class: 'pcard-body' },
      avatar(userId, name, 'xl', p.avatar_url, st),
      h('div', { class: 'pcard-name', style: { color: m ? nameColor(m) || '' : '' } }, name),
      h('div', { class: 'pcard-status' }, statusDot(st), STATUS[st].label),
      role ? h('div', { class: 'pcard-role' }, role) : null));
}

function profileModal() {
  const draft = { avatar_url: me.avatar_url || null, banner_url: me.banner_url || null };
  const pending = { avatar: null, banner: null };    // arquivos novos escolhidos
  const remove = { avatar: false, banner: false };
  const urls = [];
  const name = h('input', { maxlength: '32', value: me.display_name });
  const preview = h('div', { class: 'pcard pcard-preview' });
  const msg = h('p', { class: 'msg' });

  const render = () => {
    preview.innerHTML = '';
    const av = pending.avatar ? pending.avatar.url : remove.avatar ? null : draft.avatar_url;
    const bn = pending.banner ? pending.banner.url : remove.banner ? null : draft.banner_url;
    preview.append(
      h('div', { class: 'pcard-banner', style: { background: bn ? 'var(--bg-0)' : colorFor(me.id) } }, bn ? h('img', { src: bn, alt: '' }) : null),
      h('div', { class: 'pcard-body' },
        avatar(me.id, name.value || me.display_name, 'xl', av, statusOf(me.id)),
        h('div', { class: 'pcard-name' }, name.value || me.display_name),
        h('div', { class: 'pcard-status' }, statusDot(statusOf(me.id)), STATUS[statusOf(me.id)].label)));
  };
  name.addEventListener('input', render);

  const picker = (kind) => {
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      msg.textContent = '';
      try {
        const out = await prepareImage(file, kind);
        const url = URL.createObjectURL(out.blob);
        urls.push(url);
        pending[kind] = { ...out, url };
        remove[kind] = false;
        render();
      } catch (err) { msg.textContent = err.message; }
    });
    return input;
  };
  const avIn = picker('avatar');
  const bnIn = picker('banner');
  const btnRow = (label, input, kind) => h('div', { class: 'pbtn-row' },
    h('span', { class: 'label' }, label),
    h('button', { type: 'button', class: 'btn secondary', onClick: () => input.click() }, 'Trocar'),
    h('button', { type: 'button', class: 'btn secondary', onClick: () => { pending[kind] = null; remove[kind] = true; render(); } }, 'Remover'),
    input);

  const save = h('button', { class: 'btn primary' }, 'Salvar');
  openModal({
    title: 'Seu perfil',
    body: [
      preview,
      btnRow('Foto de perfil', avIn, 'avatar'),
      btnRow('Banner', bnIn, 'banner'),
      h('p', { class: 'hint' }, 'PNG, JPG, WebP ou GIF. Foto até 4 MB e banner até 8 MB. GIF continua animado.'),
      field('Nome de exibição', name),
      msg
    ],
    actions: [h('button', { class: 'btn secondary', onClick: closeModal }, 'Cancelar'), save]
  });
  render();

  save.addEventListener('click', async () => {
    const v = name.value.trim();
    if (!v) { msg.textContent = 'Coloque um nome.'; return; }
    save.disabled = true;
    save.textContent = 'Salvando…';
    msg.textContent = '';
    const patch = { display_name: v };
    const toDelete = [];
    try {
      for (const kind of ['avatar', 'banner']) {
        const col = kind + '_url';
        if (pending[kind]) {
          const path = `${me.id}/${kind}-${Date.now()}.${pending[kind].ext}`;
          const up = await sb.storage.from('perfis').upload(path, pending[kind].blob, { contentType: pending[kind].type, cacheControl: '31536000', upsert: false });
          if (up.error) throw new Error('Falha ao enviar a imagem: ' + up.error.message);
          patch[col] = sb.storage.from('perfis').getPublicUrl(path).data.publicUrl;
          if (me[col]) toDelete.push(storagePath(me[col]));
        } else if (remove[kind]) {
          patch[col] = null;
          if (me[col]) toDelete.push(storagePath(me[col]));
        }
      }
      const { error } = await sb.from('profiles').update(patch).eq('id', me.id);
      if (error) throw new Error('Não foi possível salvar o perfil.');
      const old = toDelete.filter(Boolean);
      if (old.length) sb.storage.from('perfis').remove(old).catch(() => {});
      Object.assign(me, patch);
      setProf(me);
      renderMe();
      closeModal();
      urls.forEach((u) => URL.revokeObjectURL(u));
      loadMembers();
      toast('Perfil atualizado!');
    } catch (err) {
      msg.textContent = err.message;
      save.disabled = false;
      save.textContent = 'Salvar';
    }
  });
}

async function settingsModal() {
  const s = loadSettings();
  const mk = async (kind, label) => {
    const sel = h('select');
    sel.append(h('option', { value: '' }, 'Padrão do sistema'));
    for (const d of await listDevices(kind)) {
      if (d.deviceId === 'default') continue;
      sel.append(h('option', { value: d.deviceId }, d.label || `${label} ${sel.options.length}`));
    }
    sel.value = s[kind] || '';
    sel.addEventListener('change', () => switchDevice(kind, sel.value));
    return field(label, sel);
  };
  const filters = [['echoCancellation', 'Cancelamento de eco'], ['noiseSuppression', 'Supressão de ruído'], ['autoGainControl', 'Ajuste automático de volume do microfone']]
    .map(([k, label]) => {
      const cb = h('input', { type: 'checkbox', checked: s[k] });
      cb.addEventListener('change', async () => {
        const cur = loadSettings(); cur[k] = cb.checked; saveSettings(cur);
        await applyAudioFilters();
      });
      return h('label', { class: 'check' }, cb, label);
    });
  const meter = h('div', { class: 'meter' }, h('div'));
  const body = [
    await mk('audioinput', 'Microfone'),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Teste do microfone'), meter),
    await mk('audiooutput', 'Saída de áudio'),
    await mk('videoinput', 'Câmera'),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Processamento de voz'), ...filters),
    h('p', { class: 'hint' }, 'Se os nomes dos dispositivos não aparecerem, permita o microfone no navegador e abra de novo.')
  ];
  openModal({ title: 'Áudio e vídeo', body, actions: [h('button', { class: 'btn primary', onClick: closeModal }, 'Pronto')] });
  // Medidor de volume do microfone
  let stream, raf, actx;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: s.audioinput || undefined } });
    actx = new AudioContext();
    const an = actx.createAnalyser();
    an.fftSize = 512;
    actx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const bar = meter.firstChild;
    const loop = () => {
      if (!meter.isConnected) { stream.getTracks().forEach((t) => t.stop()); actx.close(); return; }
      an.getByteTimeDomainData(buf);
      let sum = 0; for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
      bar.style.width = Math.min(100, Math.sqrt(sum / buf.length) * 400) + '%';
      raf = requestAnimationFrame(loop);
    };
    loop();
  } catch (_) {}
}

function roomMenu() {
  if (!current) return;
  const mine = myMember();
  const items = [{ label: 'Convidar pessoas', onClick: inviteModal }];
  if (mine && mine.base_role === 'owner') items.push({ label: 'Configurações da sala', onClick: roomSettingsModal });
  if (can('manage_roles')) items.push({ label: 'Cargos', onClick: rolesModal });
  if (can('ban')) items.push({ label: 'Banidos', onClick: bansModal });
  if (mine && mine.base_role !== 'owner') {
    items.push('sep', { label: 'Sair da sala', danger: true, onClick: async () => {
      if (!(await confirmModal({ title: `Sair de ${current.name}?`, text: 'Você pode voltar depois com um convite.', confirm: 'Sair', danger: true }))) return;
      try {
        if (call.roomId === current.id) await leaveCall();
        await rpc('leave_room', { p_room: current.id });
        await loadRooms();
        if (rooms[0]) openRoom(rooms[0].id); else renderEmpty();
      } catch (err) { toast(err.message); }
    } });
  }
  openMenu($('room-menu-btn'), items);
}

function meMenu() {
  const items = [{ node: profileCard(me.id, me.display_name, myMember()) }, { title: 'Status' }];
  for (const k of ['online', 'idle', 'dnd', 'invisible']) {
    const b = h('button', { class: 'menu-item status-item' + (myStatus === k ? ' selected' : ''), role: 'menuitemradio', 'aria-checked': String(myStatus === k) },
      statusDot(k === 'invisible' ? 'offline' : k),
      h('span', { class: 'status-text' }, h('span', null, STATUS[k].label), STATUS[k].hint ? h('small', null, STATUS[k].hint) : null));
    b.addEventListener('click', () => { closeMenu(); setMyStatus(k); });
    items.push({ node: b });
  }
  items.push('sep',
    { label: 'Editar perfil', onClick: profileModal },
    { label: 'Áudio e vídeo', onClick: settingsModal });
  if (installPrompt) items.push({ label: 'Instalar app no PC', onClick: installApp });
  items.push('sep', { label: 'Sair da conta', danger: true, onClick: async () => { if (call.room) await leaveCall(true); await sb.auth.signOut(); location.reload(); } });
  openMenu($('me-btn'), items, { above: true });
}

// ---------- Botões fixos ----------
function wireStatic() {
  wireChat();
  $('create-room-btn').addEventListener('click', createRoomModal);
  $('explore-btn').addEventListener('click', exploreModal);
  $('room-menu-btn').addEventListener('click', roomMenu);
  $('me-btn').addEventListener('click', meMenu);
  $('ch-chat').addEventListener('click', () => current && setView('chat'));
  $('ch-updates').addEventListener('click', () => setView('updates'));
  loadUpdates();
  $('ch-call').addEventListener('click', () => {
    if (!current) return;
    if (call.room && call.roomId === current.id) setView('call');
    else enterCall();
  });
  $('join-call-btn').addEventListener('click', enterCall);
  $('mic-btn').addEventListener('click', toggleMic);
  $('mic-btn-2').addEventListener('click', toggleMic);
  $('deaf-btn').addEventListener('click', () => setDeafened(!call.deafened));
  $('settings-btn').addEventListener('click', settingsModal);
  $('cam-btn').addEventListener('click', toggleCam);
  $('cam-btn-2').addEventListener('click', toggleCam);
  $('screen-btn').addEventListener('click', toggleScreen);
  $('screen-btn-2').addEventListener('click', toggleScreen);
  $('hangup-btn').addEventListener('click', () => leaveCall().then(startPreviewPolling));
  $('hangup-btn-2').addEventListener('click', () => leaveCall().then(startPreviewPolling));
  $('members-toggle').addEventListener('click', () => {
    const p = $('members-panel');
    if (innerWidth <= 1100) p.classList.toggle('open');
    else p.classList.toggle('closed');
  });
  $('side-toggle').addEventListener('click', () => $('app').classList.toggle('show-side'));
  $('vb-sub').addEventListener('click', () => { if (call.roomId) { openRoom(call.roomId); } });
  window.addEventListener('beforeunload', () => { if (call.room) call.room.disconnect(); });
}
