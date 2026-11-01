// Service worker mínimo: permite instalar o Resenha como app.
// Não guarda nada em cache — a call precisa de internet de qualquer jeito.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
