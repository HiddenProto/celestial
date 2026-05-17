'use strict';
// Celestial PeerJS signaling server
// Designed to run on Fly.io free tier (auto_stop_machines = false → never sleeps)
// Render free tier will sleep; use Fly.io for always-on.

const { PeerServer } = require('peer');
const PORT = Number(process.env.PORT) || 9000;

const peerServer = PeerServer({
  port:            PORT,
  path:            '/',           // WS endpoint: /peerjs
  allow_discovery: false,         // don't expose peer list to clients
});

peerServer.on('connection', client => {
  console.log(`[${new Date().toISOString()}] + ${client.getId()}`);
});
peerServer.on('disconnect', client => {
  console.log(`[${new Date().toISOString()}] - ${client.getId()}`);
});
peerServer.on('error', err => {
  console.error(`[peer] error:`, err.message);
});

console.log(`[peer] Signaling server listening on port ${PORT}`);
console.log(`[peer] WS endpoint: wss://YOUR-APP.fly.dev/peerjs`);
