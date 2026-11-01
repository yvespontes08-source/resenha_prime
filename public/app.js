/* Resenha — cliente
 * Voz e tela via WebRTC em malha (cada um conecta com cada um),
 * usando o padrão "perfect negotiation" para renegociar quando alguém liga/desliga a tela.
 */
(() => {
  'use strict';

  // ---------- Ícones ----------
  const ICON = {
    mic: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l20 20"/><path d="M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 5.1 2.1"/><path d="M19 10v1a7 7 0 0 1-.9 3.4M16.9 16.9A7 7 0 0 1 5 11v-1M12 18v4M8 22h8"/></svg>',
    head: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
    headOff: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l20 20"/><path d="M3 18v-6a9 9 0 0 1 3-6.7M9.5 3.3A9 9 0 0 1 21 12v6"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
    screen: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="m9 10 3-3 3 3M12 7v6"/></svg>',
    screenOff: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="m9 7 6 6M15 7l-6 6"/></svg>',
    full: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    smallMicOff: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M2 2l20 20"/><path d="M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 5.1 2.1M19 10v1a7 7 0 0 1-.9 3.4M16.9 16.9A7 7 0 0 1 5 11v-1M12 18v4"/></svg>',
    smallHeadOff: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M2 2l20 20"/><path d="M3 18v-6a9 9 0 0 1 3-6.7M9.5 3.3A9 9 0 0 1 21 12v6"/></svg>'
  };

  const COLORS = ['#4c6ef5', '#e8590c', '#2f9e44', '#c2255c', '#7048e8', '#1098ad', '#d9480f', '#5c7cfa'];
  function colorFor(id) {
    let h = 0;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
  }
  function initial(name) { return (name || '?').trim().charAt(0).toUpperCase() || '?'; }
  function avatarEl(user, cls) {
    const a = document.createElement('div');
    a.className = 'avatar' + (cls ? ' ' + cls : '');
    a.style.background = colorFor(user.id);
    a.textContent = initial(user.name);
    return a;
  }

  const $ = (id) => document.getElementById(id);

  // ---------- Estado ----------
  const socket = io({ autoConnect: false });
  let iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  let me = null;
  let roomName = '';
  let localMic = null;
  let screenStream = null;
  let muted = false;
  let deafened = false;
  let audioCtx = null;
  let focusKey = null; // tela em destaque

  const users = new Map();   // id -> user
  const peers = new Map();   // id -> { pc, polite, makingOffer, ignoreOffer, screenSenders, audioEls, micStreamId, videoStream }
  const speaking = new Set();
  const videoCache = new Map(); // chave -> <video>

  // ---------- Tela de entrada ----------
  const params = new URLSearchParams(location.search);
  $('name-input').value = localStorage.getItem('resenha:name') || '';
  $('room-input').value = params.get('sala') || localStorage.getItem('resenha:room') || '';

  $('join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('name-input').value.trim();
    const room = $('room-input').value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');
    if (!name || !room) return;
    $('join-btn').disabled = true;
    $('join-error').textContent = '';
    try {
      await joinRoom(name, room);
    } catch (err) {
      $('join-error').textContent = err.message || 'Não foi possível entrar.';
      $('join-btn').disabled = false;
    }
  });

  async function joinRoom(name, room) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const res = await fetch('/config');
      if (res.ok) iceConfig = await res.json();
    } catch (_) { /* usa STUN padrão */ }

    try {
      localMic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (_) {
      localMic = null;
      toast('Sem acesso ao microfone. Você entrou só para ouvir.');
    }

    socket.connect();
    const res = await new Promise((resolve) => socket.emit('join', { room, name }, resolve));
    if (res.error) {
      socket.disconnect();
      if (localMic) localMic.getTracks().forEach((t) => t.stop());
      throw new Error(res.error);
    }

    localStorage.setItem('resenha:name', name);
    localStorage.setItem('resenha:room', room);
    history.replaceState(null, '', `?sala=${encodeURIComponent(room)}`);

    me = res.self;
    roomName = room;
    users.set(me.id, me);
    if (!localMic) { muted = true; sendState({ muted: true }); me.muted = true; }
    if (localMic) watchSpeaking(me.id, localMic);

    for (const u of res.peers) {
      users.set(u.id, u);
      createPeer(u.id, true);
    }
    for (const m of res.messages) renderMessage(m);
    systemMessage(`Você entrou na sala ${room}.`);

    $('join-screen').hidden = true;
    $('app').hidden = false;
    $('room-title').textContent = room;
    $('rail-room').textContent = initial(room);
    $('vs-sub').textContent = `Sala de voz / ${room}`;
    $('me-name').textContent = me.name;
    const av = $('me-avatar');
    av.style.background = colorFor(me.id);
    av.textContent = initial(me.name);
    if (window.innerWidth <= 900) $('chat').classList.add('closed');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      $('screen-btn').hidden = true;
      $('screen-btn-2').hidden = true;
    }
    beep(660, 880);
    renderAll();
  }

  // ---------- Socket ----------
  socket.on('user-joined', (user) => {
    users.set(user.id, user);
    systemMessage(`${user.name} entrou na sala.`);
    beep(660, 880);
    renderAll();
  });

  socket.on('user-left', (id) => {
    const u = users.get(id);
    closePeer(id);
    users.delete(id);
    speaking.delete(id);
    if (u) systemMessage(`${u.name} saiu da sala.`);
    beep(880, 520);
    renderAll();
  });

  socket.on('user-updated', (user) => {
    const old = users.get(user.id);
    users.set(user.id, user);
    if (user.id === (me && me.id)) me = user;
    if (old && old.sharing && !user.sharing) {
      const p = peers.get(user.id);
      if (p) p.videoStream = null;
    }
    if (old && !old.sharing && user.sharing && user.id !== me.id) {
      systemMessage(`${user.name} começou a transmitir a tela.`);
    }
    renderAll();
  });

  socket.on('signal', onSignal);
  socket.on('chat', renderMessage);

  socket.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') return;
    toast('Conexão perdida. Recarregue a página para voltar.');
  });

  function sendState(patch) { socket.emit('state', patch); }

  // ---------- WebRTC ----------
  // Quem chega na sala inicia a conexão (initiator = true). Quem já estava
  // só cria a conexão quando recebe a primeira oferta e adiciona seus áudios
  // nesse momento — assim os dois lados nunca ofertam ao mesmo tempo.
  function addLocalTracks(p, withScreen) {
    const pc = p.pc;
    if (localMic) localMic.getTracks().forEach((t) => pc.addTrack(t, localMic));
    if (withScreen) addScreenTracks(p);
    p.tracksAdded = true;
  }

  function addScreenTracks(p) {
    if (!screenStream || p.screenSenders.length) return;
    p.screenSenders = screenStream.getTracks().map((t) => p.pc.addTrack(t, screenStream));
  }

  function createPeer(id, initiator) {
    if (peers.has(id)) return peers.get(id);
    const pc = new RTCPeerConnection(iceConfig);
    const p = {
      pc,
      polite: me.id < id,
      makingOffer: false,
      ignoreOffer: false,
      tracksAdded: false,
      screenSenders: [],
      audioEls: new Map(),
      micStreamId: null,
      videoStream: null
    };
    peers.set(id, p);

    if (initiator) {
      addLocalTracks(p, true);
      // Sem microfone e sem tela: ainda assim precisamos ofertar para ouvir os outros.
      if (!localMic && !screenStream) pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onnegotiationneeded = async () => {
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        socket.emit('signal', { to: id, data: { description: pc.localDescription } });
      } catch (err) {
        console.error('negociação', err);
      } finally {
        p.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('signal', { to: id, data: { candidate } });
    };
    pc.ontrack = ({ track, streams }) => handleTrack(id, track, streams[0] || new MediaStream([track]));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
      renderUsers();
    };
    return p;
  }

  async function onSignal({ from, data }) {
    if (!users.has(from)) return;
    const p = createPeer(from, false);
    const pc = p.pc;
    try {
      if (data.description) {
        const d = data.description;
        const collision = d.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && collision;
        if (p.ignoreOffer) return;
        await pc.setRemoteDescription(d);
        if (d.type === 'offer') {
          const first = !p.tracksAdded;
          if (first) addLocalTracks(p, false);
          await pc.setLocalDescription();
          socket.emit('signal', { to: from, data: { description: pc.localDescription } });
          // Se eu já estava transmitindo, mando a tela numa renegociação logo depois.
          if (first && screenStream) addScreenTracks(p);
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (err) {
          if (!p.ignoreOffer) console.warn('ice', err);
        }
      }
    } catch (err) {
      console.error('sinal', err);
    }
  }

  function handleTrack(id, track, stream) {
    const p = peers.get(id);
    if (!p) return;
    if (track.kind === 'audio') {
      if (!p.audioEls.has(stream.id)) {
        const el = document.createElement('audio');
        el.autoplay = true;
        el.srcObject = stream;
        el.muted = deafened;
        $('audio-bin').appendChild(el);
        el.play().catch(() => {});
        p.audioEls.set(stream.id, el);
        if (!p.micStreamId) {
          p.micStreamId = stream.id;
          watchSpeaking(id, stream);
        }
      }
    } else {
      p.videoStream = stream;
      const clear = () => {
        if (p.videoStream === stream && !stream.getVideoTracks().some((t) => t.readyState === 'live')) {
          p.videoStream = null;
          renderStage();
        }
      };
      stream.addEventListener('removetrack', clear);
      track.addEventListener('ended', clear);
      renderStage();
    }
  }

  function closePeer(id) {
    const p = peers.get(id);
    if (!p) return;
    try { p.pc.close(); } catch (_) {}
    for (const el of p.audioEls.values()) { el.srcObject = null; el.remove(); }
    videoCache.delete('screen:' + id);
    peers.delete(id);
  }

  // ---------- Controles ----------
  function toggleMic() {
    if (!localMic) { toast('Nenhum microfone disponível.'); return; }
    if (deafened) { setDeafened(false); return; }
    muted = !muted;
    localMic.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    sendState({ muted });
    beep(muted ? 520 : 700, muted ? 400 : 900);
    renderControls();
  }

  function setDeafened(value) {
    deafened = value;
    for (const p of peers.values()) for (const el of p.audioEls.values()) el.muted = deafened;
    if (localMic) {
      if (deafened) muted = true;
      else muted = false;
      localMic.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    }
    sendState({ deafened, muted });
    renderControls();
  }

  async function toggleScreen() {
    if (screenStream) { stopScreen(); return; }
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 }, width: { max: 1920 }, height: { max: 1080 } },
        audio: true
      });
    } catch (_) {
      return; // cancelou a escolha
    }
    const vt = screenStream.getVideoTracks()[0];
    if (vt) {
      vt.contentHint = 'detail';
      vt.addEventListener('ended', stopScreen);
    }
    for (const p of peers.values()) {
      if (!p.tracksAdded) continue; // entra logo depois que a conexão começar
      addScreenTracks(p);
    }
    focusKey = 'screen:' + me.id;
    sendState({ sharing: true });
    renderAll();
  }

  function stopScreen() {
    if (!screenStream) return;
    screenStream.getTracks().forEach((t) => t.stop());
    for (const p of peers.values()) {
      for (const s of p.screenSenders) { try { p.pc.removeTrack(s); } catch (_) {} }
      p.screenSenders = [];
    }
    screenStream = null;
    videoCache.delete('screen:' + me.id);
    sendState({ sharing: false });
    renderAll();
  }

  function leave() {
    stopScreen();
    for (const id of [...peers.keys()]) closePeer(id);
    if (localMic) localMic.getTracks().forEach((t) => t.stop());
    socket.disconnect();
    location.href = location.pathname + '?sala=' + encodeURIComponent(roomName);
  }

  function copyInvite() {
    const link = `${location.origin}${location.pathname}?sala=${encodeURIComponent(roomName)}`;
    const done = () => toast('Link de convite copiado!');
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => prompt('Copie o link:', link));
    else prompt('Copie o link:', link);
  }

  $('mic-btn').addEventListener('click', toggleMic);
  $('mic-btn-2').addEventListener('click', toggleMic);
  $('deaf-btn').addEventListener('click', () => setDeafened(!deafened));
  $('screen-btn').addEventListener('click', toggleScreen);
  $('screen-btn-2').addEventListener('click', toggleScreen);
  $('leave-btn').addEventListener('click', leave);
  $('leave-btn-2').addEventListener('click', leave);
  $('invite-btn').addEventListener('click', copyInvite);
  $('invite-rail').addEventListener('click', copyInvite);
  $('chat-toggle').addEventListener('click', () => $('chat').classList.toggle('closed'));
  $('chat-close').addEventListener('click', () => $('chat').classList.add('closed'));

  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('chat-input');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('chat', text);
    input.value = '';
  });

  // ---------- Detecção de fala ----------
  function watchSpeaking(id, stream) {
    if (!audioCtx || !stream.getAudioTracks().length) return;
    let source;
    try { source = audioCtx.createMediaStreamSource(stream); } catch (_) { return; }
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let lastLoud = 0;
    const tick = () => {
      if (!users.has(id)) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / data.length);
      const now = performance.now();
      const isMe = me && id === me.id;
      if (rms > 0.035 && !(isMe && muted)) lastLoud = now;
      const talking = now - lastLoud < 250;
      if (talking !== speaking.has(id)) {
        if (talking) speaking.add(id); else speaking.delete(id);
        document.querySelectorAll(`[data-uid="${CSS.escape(id)}"]`).forEach((el) => el.classList.toggle('speaking', talking));
      }
      requestAnimationFrame(tick);
    };
    if (audioCtx.state === 'suspended') audioCtx.resume();
    tick();
  }

  // ---------- Render ----------
  function renderAll() {
    renderUsers();
    renderControls();
    renderStage();
  }

  function renderControls() {
    const setBtn = (el, on, iconOn, iconOff, labelOn, labelOff, round) => {
      el.innerHTML = on ? iconOn : iconOff;
      el.title = on ? labelOn : labelOff;
      el.setAttribute('aria-label', el.title);
      el.setAttribute('aria-pressed', String(!on));
      el.classList.toggle('off', !on);
    };
    setBtn($('mic-btn'), !muted, ICON.mic, ICON.micOff, 'Desativar microfone', 'Ativar microfone');
    setBtn($('mic-btn-2'), !muted, ICON.mic, ICON.micOff, 'Desativar microfone', 'Ativar microfone');
    setBtn($('deaf-btn'), !deafened, ICON.head, ICON.headOff, 'Desativar áudio', 'Ativar áudio');
    for (const id of ['screen-btn', 'screen-btn-2']) {
      const b = $(id);
      b.innerHTML = screenStream ? ICON.screenOff : ICON.screen;
      b.title = screenStream ? 'Parar transmissão' : 'Transmitir tela';
      b.setAttribute('aria-label', b.title);
      b.setAttribute('aria-pressed', String(!!screenStream));
      b.classList.toggle('on', !!screenStream);
      b.classList.remove('off');
    }
  }

  function renderUsers() {
    const list = $('voice-users');
    list.innerHTML = '';
    const all = [...users.values()];
    $('count').textContent = `${all.length} ${all.length === 1 ? 'pessoa' : 'pessoas'}`;
    for (const u of all) {
      const li = document.createElement('li');
      li.dataset.uid = u.id;
      if (speaking.has(u.id)) li.classList.add('speaking');
      li.appendChild(avatarEl(u, 'sm'));
      const n = document.createElement('span');
      n.className = 'name';
      n.textContent = u.name + (me && u.id === me.id ? ' (você)' : '');
      li.appendChild(n);
      const b = document.createElement('span');
      b.className = 'badges';
      if (u.sharing) { const l = document.createElement('span'); l.className = 'live-badge'; l.textContent = 'AO VIVO'; b.appendChild(l); }
      if (u.muted) b.insertAdjacentHTML('beforeend', ICON.smallMicOff);
      if (u.deafened) b.insertAdjacentHTML('beforeend', ICON.smallHeadOff);
      const p = peers.get(u.id);
      if (p && ['failed', 'disconnected'].includes(p.pc.connectionState)) {
        n.textContent += ' · reconectando';
      }
      li.appendChild(b);
      list.appendChild(li);
    }
  }

  function getVideo(key, stream, isLocal) {
    let v = videoCache.get(key);
    if (!v) {
      v = document.createElement('video');
      v.autoplay = true;
      v.playsInline = true;
      v.muted = true; // o áudio da tela toca pelo <audio>
      videoCache.set(key, v);
    }
    if (v.srcObject !== stream) v.srcObject = stream;
    v.play().catch(() => {});
    return v;
  }

  function screenTiles() {
    const tiles = [];
    if (screenStream && me) tiles.push({ key: 'screen:' + me.id, user: me, stream: screenStream, local: true });
    for (const [id, p] of peers) {
      const u = users.get(id);
      if (u && p.videoStream && p.videoStream.getVideoTracks().length) {
        tiles.push({ key: 'screen:' + id, user: u, stream: p.videoStream, local: false });
      }
    }
    return tiles;
  }

  function screenTile(t, big) {
    const tile = document.createElement('div');
    tile.className = 'tile screen';
    tile.appendChild(getVideo(t.key, t.stream, t.local));
    const label = document.createElement('div');
    label.className = 'label';
    const live = document.createElement('span');
    live.className = 'live-badge';
    live.textContent = 'AO VIVO';
    const txt = document.createElement('span');
    txt.textContent = t.local ? 'Sua tela' : `Tela de ${t.user.name}`;
    label.append(live, txt);
    tile.appendChild(label);
    const fs = document.createElement('button');
    fs.className = 'fs';
    fs.innerHTML = ICON.full;
    fs.setAttribute('aria-label', 'Tela cheia');
    fs.title = 'Tela cheia';
    fs.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = videoCache.get(t.key);
      const target = tile;
      if (document.fullscreenElement) document.exitFullscreen();
      else if (target.requestFullscreen) target.requestFullscreen();
      else if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    });
    tile.appendChild(fs);
    if (!big) tile.addEventListener('click', () => { focusKey = t.key; renderStage(); });
    return tile;
  }

  function personTile(u) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.uid = u.id;
    if (speaking.has(u.id)) tile.classList.add('speaking');
    tile.appendChild(avatarEl(u));
    const label = document.createElement('div');
    label.className = 'label';
    if (u.muted) label.insertAdjacentHTML('beforeend', ICON.smallMicOff);
    const txt = document.createElement('span');
    txt.textContent = u.name + (me && u.id === me.id ? ' (você)' : '');
    label.appendChild(txt);
    tile.appendChild(label);
    return tile;
  }

  function renderStage() {
    const stage = $('stage');
    stage.innerHTML = '';
    const screens = screenTiles();
    const people = [...users.values()];

    if (!screens.length) {
      stage.className = 'stage grid';
      people.forEach((u) => stage.appendChild(personTile(u)));
      return;
    }

    if (!screens.some((s) => s.key === focusKey)) focusKey = screens[0].key;
    const main = screens.find((s) => s.key === focusKey);
    stage.className = 'stage focus';
    const mainBox = document.createElement('div');
    mainBox.className = 'focus-main';
    mainBox.appendChild(screenTile(main, true));
    stage.appendChild(mainBox);

    const strip = document.createElement('div');
    strip.className = 'focus-strip';
    screens.filter((s) => s !== main).forEach((s) => strip.appendChild(screenTile(s, false)));
    people.forEach((u) => strip.appendChild(personTile(u)));
    stage.appendChild(strip);
  }

  // ---------- Chat ----------
  let lastMsgUser = null;
  let lastMsgTs = 0;
  function linkify(container, text) {
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    for (const part of parts) {
      if (/^https?:\/\//.test(part)) {
        const a = document.createElement('a');
        a.href = part; a.textContent = part; a.target = '_blank'; a.rel = 'noopener noreferrer';
        container.appendChild(a);
      } else if (part) {
        container.appendChild(document.createTextNode(part));
      }
    }
  }

  function renderMessage(m) {
    const box = $('messages');
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const cont = lastMsgUser === m.userId && m.ts - lastMsgTs < 5 * 60 * 1000;
    const row = document.createElement('div');
    row.className = 'msg' + (cont ? ' cont' : '');
    row.appendChild(avatarEl({ id: m.userId, name: m.name }));
    const body = document.createElement('div');
    body.className = 'msg-body';
    if (!cont) {
      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      const n = document.createElement('span');
      n.className = 'msg-name';
      n.style.color = colorFor(m.userId);
      n.textContent = m.name;
      const t = document.createElement('span');
      t.className = 'msg-time';
      t.textContent = new Date(m.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      meta.append(n, t);
      body.appendChild(meta);
    }
    const text = document.createElement('div');
    text.className = 'msg-text';
    linkify(text, m.text);
    body.appendChild(text);
    row.appendChild(body);
    box.appendChild(row);
    lastMsgUser = m.userId;
    lastMsgTs = m.ts;
    if (nearBottom || (me && m.userId === me.id)) box.scrollTop = box.scrollHeight;
  }

  function systemMessage(text) {
    const box = $('messages');
    const d = document.createElement('div');
    d.className = 'sys';
    d.textContent = text;
    box.appendChild(d);
    lastMsgUser = null;
    box.scrollTop = box.scrollHeight;
  }

  // ---------- Utilidades ----------
  let toastTimer = null;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function beep(from, to) {
    if (!audioCtx || deafened) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(from, audioCtx.currentTime);
      o.frequency.linearRampToValueAtTime(to, audioCtx.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.2);
    } catch (_) {}
  }

  window.addEventListener('beforeunload', () => { socket.disconnect(); });

  // Expor para testes/depuração
  window.__resenha = { peers, users, get screenStream() { return screenStream; } };
})();
