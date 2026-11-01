// Call de voz/vídeo/tela com LiveKit (SFU).
import {
  Room, RoomEvent, Track, DisconnectReason, ConnectionState, ScreenSharePresets, VideoPresets
} from 'livekit-client';
import { $, h, ICON, avatar, toast, beep } from './ui.js';

const SETTINGS_KEY = 'resenha:av';
const VOL_KEY = 'resenha:volumes';

export const call = {
  room: null,
  roomId: null,
  roomName: '',
  connecting: false,
  muted: false,
  deafened: false,
  focusKey: null,
  onChange: () => {}
};

// ---------- Preferências (dispositivos, filtros, volumes) ----------
export function loadSettings() {
  const def = { audioinput: '', audiooutput: '', videoinput: '', echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (_) { return def; }
}
export function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function loadVolumes() {
  try { return JSON.parse(localStorage.getItem(VOL_KEY) || '{}'); } catch (_) { return {}; }
}
export function getVolume(identity) {
  const v = loadVolumes()[identity];
  return typeof v === 'number' ? v : 1;
}
export function setVolume(identity, value) {
  const all = loadVolumes();
  all[identity] = value;
  localStorage.setItem(VOL_KEY, JSON.stringify(all));
  applyVolume(identity);
}
function applyVolume(identity) {
  if (!call.room) return;
  const p = call.room.remoteParticipants.get(identity);
  if (!p) return;
  const v = call.deafened ? 0 : getVolume(identity);
  p.setVolume(v, Track.Source.Microphone);
  p.setVolume(v, Track.Source.ScreenShareAudio);
}
function applyAllVolumes() {
  if (!call.room) return;
  for (const id of call.room.remoteParticipants.keys()) applyVolume(id);
}

function audioOptions(s) {
  return {
    deviceId: s.audioinput || undefined,
    echoCancellation: s.echoCancellation,
    noiseSuppression: s.noiseSuppression,
    autoGainControl: s.autoGainControl
  };
}

// ---------- Entrar e sair ----------
export async function joinCall(roomId, roomName, getToken) {
  if (call.connecting) return;
  if (call.room && call.roomId === roomId) return;
  if (call.room) await leaveCall(true);

  call.connecting = true;
  call.roomId = roomId;
  call.roomName = roomName;
  call.onChange();
  try {
    const { token, url } = await getToken(roomId);
    const s = loadSettings();
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      webAudioMix: true,
      audioCaptureDefaults: audioOptions(s),
      audioOutput: s.audiooutput ? { deviceId: s.audiooutput } : undefined,
      videoCaptureDefaults: { deviceId: s.videoinput || undefined, resolution: VideoPresets.h720.resolution },
      publishDefaults: {
        simulcast: true,
        dtx: true,
        red: true,
        screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
        screenShareSimulcastLayers: [ScreenSharePresets.h720fps15]
      }
    });
    wireRoom(room);
    call.room = room;
    await room.connect(url, token);

    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      if (call.muted || call.deafened) await room.localParticipant.setMicrophoneEnabled(false);
    } catch (err) {
      call.muted = true;
      toast('Não consegui acessar seu microfone. Você está só ouvindo.');
    }
    await syncAttributes();
    applyAllVolumes();
    beep(660, 880);
  } catch (err) {
    console.error(err);
    if (call.room) { try { await call.room.disconnect(); } catch (_) {} }
    call.room = null;
    call.roomId = null;
    const msg = String((err && err.message) || '');
    toast(/signal connection|Failed to fetch|websocket/i.test(msg)
      ? 'Não consegui conectar na call. Confira sua internet ou as chaves do LiveKit no servidor.'
      : msg || 'Não foi possível entrar na call.', 4500);
  } finally {
    call.connecting = false;
    call.onChange();
  }
}

export async function leaveCall(silent) {
  const room = call.room;
  call.room = null;
  call.roomId = null;
  call.focusKey = null;
  $('audio-bin').innerHTML = '';
  for (const v of videoEls.values()) { if (v._track) { try { v._track.detach(v); } catch (_) {} } }
  videoEls.clear();
  if (room) { try { await room.disconnect(); } catch (_) {} }
  if (!silent) beep(880, 520);
  call.onChange();
}

function wireRoom(room) {
  const changed = () => call.onChange();
  room
    .on(RoomEvent.ParticipantConnected, (p) => { applyVolume(p.identity); beep(660, 880); changed(); })
    .on(RoomEvent.ParticipantDisconnected, () => { beep(880, 520); changed(); })
    .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.dataset.sid = track.sid;
        $('audio-bin').append(el);
        applyVolume(participant.identity);
      }
      changed();
    })
    .on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((el) => el.remove());
      changed();
    })
    .on(RoomEvent.TrackMuted, changed)
    .on(RoomEvent.TrackUnmuted, changed)
    .on(RoomEvent.LocalTrackPublished, changed)
    .on(RoomEvent.LocalTrackUnpublished, changed)
    .on(RoomEvent.ParticipantAttributesChanged, changed)
    .on(RoomEvent.ActiveSpeakersChanged, updateSpeaking)
    .on(RoomEvent.ConnectionStateChanged, changed)
    .on(RoomEvent.AudioPlaybackStatusChanged, () => {
      $('audio-unlock').hidden = room.canPlaybackAudio;
    })
    .on(RoomEvent.MediaDevicesError, () => toast('Problema ao acessar microfone ou câmera.'))
    .on(RoomEvent.Disconnected, (reason) => {
      if (call.room !== room) return;
      if (reason === DisconnectReason.PARTICIPANT_REMOVED) toast('Você foi removido da call.', 4000);
      else if (reason === DisconnectReason.DUPLICATE_IDENTITY) toast('Você entrou na call em outra aba ou aparelho.', 4000);
      else if (reason !== DisconnectReason.CLIENT_INITIATED) toast('A call caiu. Tente entrar de novo.', 4000);
      leaveCall(true);
    });
}

$('audio-unlock').addEventListener('click', async () => {
  if (call.room) { await call.room.startAudio(); $('audio-unlock').hidden = true; }
});

async function syncAttributes() {
  if (!call.room) return;
  try {
    await call.room.localParticipant.setAttributes({ deafened: call.deafened ? '1' : '0' });
  } catch (_) {}
}

// ---------- Controles ----------
export async function toggleMic() {
  if (call.deafened) { await setDeafened(false); return; }
  call.muted = !call.muted;
  if (call.room) {
    try { await call.room.localParticipant.setMicrophoneEnabled(!call.muted); }
    catch (_) { call.muted = true; toast('Sem acesso ao microfone.'); }
  }
  beep(call.muted ? 520 : 700, call.muted ? 400 : 900);
  call.onChange();
}

export async function setDeafened(value) {
  call.deafened = value;
  if (value) call.muted = true;
  else call.muted = false;
  if (call.room) {
    try { await call.room.localParticipant.setMicrophoneEnabled(!call.muted); } catch (_) {}
    applyAllVolumes();
    await syncAttributes();
  }
  call.onChange();
}

export async function toggleCam() {
  if (!call.room) return;
  const lp = call.room.localParticipant;
  try {
    await lp.setCameraEnabled(!lp.isCameraEnabled);
  } catch (_) {
    toast('Não consegui acessar a câmera.');
  }
  call.onChange();
}

export async function toggleScreen() {
  if (!call.room) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    toast('Seu navegador não permite transmitir a tela (use Chrome ou Edge no computador).');
    return;
  }
  const lp = call.room.localParticipant;
  const on = !lp.isScreenShareEnabled;
  try {
    await lp.setScreenShareEnabled(on, {
      audio: true,
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
      contentHint: 'detail',
      resolution: ScreenSharePresets.h1080fps30.resolution
    });
    if (on) call.focusKey = `${lp.identity}:screen`;
  } catch (err) {
    if (err && err.name !== 'NotAllowedError') toast('Não foi possível transmitir a tela.');
  }
  call.onChange();
}

// Troca de dispositivo (funciona durante a call)
export async function switchDevice(kind, deviceId) {
  const s = loadSettings();
  s[kind] = deviceId;
  saveSettings(s);
  if (call.room) {
    try { await call.room.switchActiveDevice(kind, deviceId); } catch (_) { toast('Não foi possível trocar o dispositivo.'); }
  }
}

// Reaplica cancelamento de eco/ruído criando uma nova faixa de microfone
export async function applyAudioFilters() {
  if (!call.room) return;
  const lp = call.room.localParticipant;
  const pub = lp.getTrackPublication(Track.Source.Microphone);
  if (pub && pub.track) {
    const t = pub.track;
    await lp.unpublishTrack(t);
    t.stop();
  }
  try {
    await lp.setMicrophoneEnabled(true, audioOptions(loadSettings()));
    if (call.muted) await lp.setMicrophoneEnabled(false);
  } catch (_) {}
  call.onChange();
}

export async function listDevices(kind) {
  try { return await Room.getLocalDevices(kind, true); } catch (_) { return []; }
}

// ---------- Estado para a interface ----------
export function participants() {
  if (!call.room) return [];
  const all = [call.room.localParticipant, ...call.room.remoteParticipants.values()];
  return all.map((p) => {
    const mic = p.getTrackPublication(Track.Source.Microphone);
    return {
      p,
      identity: p.identity,
      name: p.name || 'Alguém',
      local: p === call.room.localParticipant,
      speaking: p.isSpeaking,
      muted: !mic || mic.isMuted,
      deafened: p.attributes && p.attributes.deafened === '1',
      camera: p.getTrackPublication(Track.Source.Camera),
      screen: p.getTrackPublication(Track.Source.ScreenShare)
    };
  });
}

function updateSpeaking() {
  if (!call.room) return;
  const speaking = new Set(call.room.activeSpeakers.map((p) => p.identity));
  document.querySelectorAll('[data-identity]').forEach((el) => {
    el.classList.toggle('speaking', speaking.has(el.dataset.identity));
  });
}

// ---------- Palco ----------
const videoEls = new Map();

function videoFor(key, track) {
  let v = videoEls.get(key);
  if (!v) {
    v = h('video', { autoplay: true, playsInline: true, muted: true });
    videoEls.set(key, v);
  }
  if (v._track !== track) {
    if (v._track) { try { v._track.detach(v); } catch (_) {} }
    track.attach(v);
    v._track = track;
  }
  return v;
}

function liveTrack(pub) {
  return pub && pub.track && !pub.isMuted ? pub.track : null;
}

function screenTile(item, big) {
  const key = `${item.identity}:screen`;
  const track = liveTrack(item.screen);
  const tile = h('div', { class: 'tile' + (big ? '' : ' clickable') },
    videoFor(key, track),
    h('div', { class: 'label' }, h('span', { class: 'live-badge' }, 'AO VIVO'), h('span', null, item.local ? 'Sua tela' : `Tela de ${item.name}`)));
  const fs = h('button', { class: 'fs', 'aria-label': 'Tela cheia', title: 'Tela cheia', html: ICON.full });
  fs.addEventListener('click', (e) => {
    e.stopPropagation();
    if (document.fullscreenElement) document.exitFullscreen();
    else tile.requestFullscreen && tile.requestFullscreen();
  });
  tile.append(fs);
  if (!big) tile.addEventListener('click', () => { call.focusKey = key; renderStage(); });
  return tile;
}

function personTile(item) {
  const cam = liveTrack(item.camera);
  const tile = h('div', { class: 'tile' + (cam ? ' cam' : ''), 'data-identity': item.identity });
  if (item.speaking) tile.classList.add('speaking');
  if (cam) tile.append(videoFor(`${item.identity}:cam`, cam));
  else tile.append(avatar(item.identity, item.name, 'lg'));
  tile.append(h('div', { class: 'label' },
    item.muted ? h('span', { html: ICON.smallMicOff, style: { display: 'inline-flex' } }) : null,
    h('span', null, item.name + (item.local ? ' (você)' : ''))));
  return tile;
}

export function renderStage() {
  const stage = $('stage');
  stage.innerHTML = '';
  const list = participants();
  if (!list.length) return;
  const screens = list.filter((x) => liveTrack(x.screen));
  // Até 4 câmeras em destaque; o resto aparece como avatar (economiza banda)
  let camCount = 0;
  for (const x of list) {
    if (liveTrack(x.camera)) {
      camCount += 1;
      if (camCount > 4 && !x.local) x.camera = null;
    }
  }
  if (!screens.length) {
    stage.className = 'stage grid';
    list.forEach((x) => stage.append(personTile(x)));
  } else {
    const keys = screens.map((x) => `${x.identity}:screen`);
    if (!keys.includes(call.focusKey)) call.focusKey = keys[0];
    const main = screens.find((x) => `${x.identity}:screen` === call.focusKey);
    stage.className = 'stage focus';
    stage.append(h('div', { class: 'focus-main' }, screenTile(main, true)));
    const strip = h('div', { class: 'focus-strip' });
    screens.filter((x) => x !== main).forEach((x) => strip.append(screenTile(x, false)));
    list.forEach((x) => strip.append(personTile(x)));
    stage.append(strip);
  }
  // Remove vídeos que não estão mais na tela
  for (const [key, v] of videoEls) {
    if (!v.isConnected) {
      if (v._track) { try { v._track.detach(v); } catch (_) {} }
      videoEls.delete(key);
    }
  }
}
