// Resenha v2 — servidor
// - Serve o site (front-end compilado em public/dist)
// - Gera tokens do LiveKit só para membros da sala (checado no Supabase com o login da pessoa)
// - Executa expulsar/banir no banco e derruba a pessoa da call

const path = require('path');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

const PORT = process.env.PORT || 3000;

// Valores públicos do projeto Supabase (a chave publicável pode ficar no front-end).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bwcfcielvdrdpseftstk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_UokYqYrRLJGbjeMfUK38NQ_63wdReB_';

// LiveKit Cloud: configure no Render (Environment)
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const livekitReady = Boolean(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
const roomService = livekitReady
  ? new RoomServiceClient(LIVEKIT_URL.replace(/^ws/, 'http'), LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
  : null;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));

// Cabeçalhos básicos de segurança
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self)');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.get('/health', (req, res) => res.send('ok'));

app.get('/config', (req, res) => {
  res.json({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY, livekitUrl: LIVEKIT_URL, livekitReady });
});

// ---------- Limite simples de requisições por IP ----------
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = hits.get(key) || { count: 0, start: now };
    if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
    entry.count += 1;
    hits.set(key, entry);
    if (entry.count > max) return res.status(429).json({ error: 'Muitas tentativas. Espere um pouco.' });
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.start > 120000) hits.delete(k);
}, 60000).unref();

// ---------- Autenticação via Supabase ----------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getUser(req) {
  const header = req.get('authorization') || '';
  const jwt = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!jwt) return null;
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data || !data.user) return null;
  return { user: data.user, db };
}

function requireLivekit(res) {
  if (livekitReady) return true;
  res.status(503).json({ error: 'A call ainda não foi configurada (faltam as chaves do LiveKit no servidor).' });
  return false;
}

// Token para entrar na call
app.post('/api/livekit-token', rateLimit(30, 60000), async (req, res) => {
  try {
    if (!requireLivekit(res)) return;
    const roomId = String((req.body && req.body.roomId) || '');
    if (!UUID.test(roomId)) return res.status(400).json({ error: 'Sala inválida.' });
    const auth = await getUser(req);
    if (!auth) return res.status(401).json({ error: 'Faça login de novo.' });

    const { data, error } = await auth.db.rpc('call_access', { p_room: roomId });
    if (error) throw error;
    const access = Array.isArray(data) ? data[0] : null;
    if (!access) return res.status(403).json({ error: 'Você não é membro desta sala.' });

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: auth.user.id,
      name: access.display_name,
      ttl: '6h',
      metadata: JSON.stringify({ role: access.base_role })
    });
    at.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true
    });
    res.json({ token: await at.toJwt(), url: LIVEKIT_URL });
  } catch (err) {
    console.error('livekit-token', err);
    res.status(500).json({ error: 'Não foi possível entrar na call agora.' });
  }
});

// Quem está na call agora (para mostrar antes de entrar)
app.get('/api/call-participants', rateLimit(60, 60000), async (req, res) => {
  try {
    if (!livekitReady) return res.json({ participants: [] });
    const roomId = String(req.query.roomId || '');
    if (!UUID.test(roomId)) return res.status(400).json({ error: 'Sala inválida.' });
    const auth = await getUser(req);
    if (!auth) return res.status(401).json({ error: 'Faça login de novo.' });
    const { data } = await auth.db.rpc('call_access', { p_room: roomId });
    if (!Array.isArray(data) || !data.length) return res.status(403).json({ error: 'Você não é membro desta sala.' });
    let list = [];
    try { list = await roomService.listParticipants(roomId); } catch (_) { list = []; }
    res.json({ participants: list.map((p) => ({ identity: p.identity, name: p.name })) });
  } catch (err) {
    console.error('call-participants', err);
    res.status(500).json({ error: 'Erro ao listar a call.' });
  }
});

// Expulsar ou banir: a permissão é checada no banco (RPC); depois derruba da call.
app.post('/api/moderate', rateLimit(30, 60000), async (req, res) => {
  try {
    const { roomId, userId, action, reason } = req.body || {};
    if (!UUID.test(String(roomId)) || !UUID.test(String(userId))) return res.status(400).json({ error: 'Dados inválidos.' });
    if (!['kick', 'ban'].includes(action)) return res.status(400).json({ error: 'Ação inválida.' });
    const auth = await getUser(req);
    if (!auth) return res.status(401).json({ error: 'Faça login de novo.' });

    const rpc = action === 'kick'
      ? auth.db.rpc('kick_member', { p_room: roomId, p_user: userId })
      : auth.db.rpc('ban_member', { p_room: roomId, p_user: userId, p_reason: reason ? String(reason).slice(0, 200) : null });
    const { error } = await rpc;
    if (error) return res.status(403).json({ error: error.message });

    if (roomService) {
      try { await roomService.removeParticipant(roomId, userId); } catch (_) { /* não estava na call */ }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('moderate', err);
    res.status(500).json({ error: 'Não foi possível concluir a ação.' });
  }
});

// Qualquer outra rota volta para o app (links de convite etc.)
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Resenha rodando em http://localhost:${PORT}`);
  if (!livekitReady) console.log('Aviso: LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET não configurados — a call fica desativada.');
});
