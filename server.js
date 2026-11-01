// Resenha — servidor de sinalização
// Serve o site e repassa as mensagens WebRTC entre os participantes de cada sala.
// O áudio e a tela vão direto de navegador para navegador (peer-to-peer).

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const MAX_PER_ROOM = Number(process.env.MAX_PER_ROOM || 8);
const MAX_MESSAGES = 100;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });

app.use(express.static(path.join(__dirname, 'public')));

// Servidores ICE: STUN do Google sempre; TURN opcional via variáveis de ambiente.
app.get('/config', (req, res) => {
  const iceServers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
  ];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(',').map((s) => s.trim()),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }
  res.json({ iceServers });
});

app.get('/health', (req, res) => res.send('ok'));

// sala -> { users: Map<socketId, user>, messages: [] }
const rooms = new Map();

function clean(str, max) {
  return String(str || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

function roomCode(str) {
  return clean(str, 40).toLowerCase().replace(/[^a-z0-9-_]/g, '');
}

io.on('connection', (socket) => {
  socket.on('join', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const room = roomCode(payload && payload.room);
    const name = clean(payload && payload.name, 32) || 'Anônimo';
    if (!room) return ack({ error: 'Código de sala inválido.' });
    if (socket.data.room) return ack({ error: 'Você já está numa sala.' });

    if (!rooms.has(room)) rooms.set(room, { users: new Map(), messages: [] });
    const r = rooms.get(room);
    if (r.users.size >= MAX_PER_ROOM) {
      return ack({ error: `A sala está cheia (máximo ${MAX_PER_ROOM}).` });
    }

    const user = { id: socket.id, name, muted: false, deafened: false, sharing: false };
    socket.join(room);
    socket.data.room = room;

    ack({ ok: true, self: user, peers: [...r.users.values()], messages: r.messages });
    r.users.set(socket.id, user);
    socket.to(room).emit('user-joined', user);
  });

  // Repasse de ofertas, respostas e candidatos ICE
  socket.on('signal', (payload) => {
    const r = rooms.get(socket.data.room);
    if (!r || !payload || !r.users.has(payload.to)) return;
    io.to(payload.to).emit('signal', { from: socket.id, data: payload.data });
  });

  socket.on('state', (patch) => {
    const r = rooms.get(socket.data.room);
    if (!r || !patch) return;
    const user = r.users.get(socket.id);
    if (!user) return;
    for (const key of ['muted', 'deafened', 'sharing']) {
      if (typeof patch[key] === 'boolean') user[key] = patch[key];
    }
    io.to(socket.data.room).emit('user-updated', user);
  });

  socket.on('chat', (text) => {
    const r = rooms.get(socket.data.room);
    if (!r) return;
    const user = r.users.get(socket.id);
    const body = clean(text, 2000);
    if (!user || !body) return;
    const msg = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, userId: user.id, name: user.name, text: body, ts: Date.now() };
    r.messages.push(msg);
    if (r.messages.length > MAX_MESSAGES) r.messages.shift();
    io.to(socket.data.room).emit('chat', msg);
  });

  socket.on('disconnect', () => {
    const room = socket.data.room;
    const r = rooms.get(room);
    if (!r) return;
    r.users.delete(socket.id);
    socket.to(room).emit('user-left', socket.id);
    if (r.users.size === 0) rooms.delete(room);
  });
});

server.listen(PORT, () => {
  console.log(`Resenha rodando em http://localhost:${PORT}`);
});
