/* ============================================================
   peer-mgr.js  —  Reliable PeerJS connection manager
   ─────────────────────────────────────────────────────────
   Primary: 0.peerjs.com (official cloud — always-on, no cold
            starts, supports custom fixed IDs).
   Fallback: celestial-wisp (self-hosted, may sleep on Render).

   Handles:
   • Open watchdog — if 'open' never fires within OPEN_TIMEOUT ms,
     destroy the peer and try the next server in the list.
   • Reconnect vs recreate — if the peer was previously open and
     the signaling WS drops, call peer.reconnect() (keeps data
     connections alive).  If it was never open, destroy+recreate
     (reconnect() is a no-op on a never-opened peer).
   • peer-unavailable errors — silently ignored; the caller's
     retry logic handles them (hub not online yet, etc.).
   • unavailable-id — calls onUnavailable() and stops retrying
     (caller decides what to do, e.g. connect as partner admin).

   Usage:
     const mgr = PeerMgr.connect(peerId, { onOpen, onConnection, onUnavailable });
     // peerId = string for fixed ID, null/undefined for random
     // mgr.destroy() when done
   ============================================================ */
(function (root) {
  'use strict';

  /* ── server list ────────────────────────────────────────── */
  const _locHost = localStorage.getItem('cst-peer-host');
  const _locPort = parseInt(localStorage.getItem('cst-peer-port') || '3001');

  // Allow devs to override via localStorage('cst-peer-host').
  // 'localhost' → single-server mode (no public-cloud fallback).
  // any other custom host → try it first, then fall back to cloud.
  const SERVERS = _locHost
    ? (_locHost === 'localhost'
        ? [{ host: 'localhost', port: _locPort, path: '/peerjs', secure: false, debug: 0 }]
        : [
            { host: _locHost,        port: 443, path: '/peerjs', secure: true, debug: 0 },
            { host: '0.peerjs.com',  port: 443, path: '/',       secure: true, debug: 0 },
          ])
    : [
        { host: '0.peerjs.com',                port: 443, path: '/',       secure: true, debug: 0 },
        { host: 'celestial-wisp.onrender.com', port: 443, path: '/peerjs', secure: true, debug: 0 },
      ];

  const OPEN_TIMEOUT = 6000;  // ms to wait for 'open' before trying next server
  const RETRY_DELAY  = 2000;  // ms between attempts

  /* ── connect ────────────────────────────────────────────── */
  /**
   * PeerMgr.connect(peerId, handlers) → manager
   *
   * peerId   – string for a fixed known ID, null/undefined for random
   * handlers – { onOpen(peer, id), onConnection(conn), onUnavailable() }
   *
   * Returns  – { peer, open, destroy() }
   *   .peer   – current Peer instance (may change on recreation)
   *   .open   – true if peer is currently open
   *   .destroy() – stop all retries and destroy the peer
   */
  function connect(peerId, handlers) {
    var h        = handlers || {};
    var peer     = null;
    var sIdx     = 0;       // which server we're currently on
    var watchdog = null;
    var retryTmr = null;
    var dead     = false;   // set by destroy()

    function cleanup() {
      clearTimeout(watchdog); watchdog = null;
      clearTimeout(retryTmr); retryTmr = null;
    }

    function kill(p) {
      if (p && !p.destroyed) { try { p.destroy(); } catch (e) {} }
    }

    function attempt() {
      if (dead) return;
      cleanup();

      var opts = SERVERS[sIdx % SERVERS.length];
      var p    = new Peer(peerId != null ? peerId : undefined, opts);
      peer     = p;

      // Watchdog: if 'open' doesn't fire within OPEN_TIMEOUT, try next server
      watchdog = setTimeout(function () {
        if (p === peer && p && !p.open && !p.destroyed) {
          kill(p); peer = null;
          sIdx++;
          retryTmr = setTimeout(attempt, RETRY_DELAY);
        }
      }, OPEN_TIMEOUT);

      p.on('open', function (id) {
        if (p !== peer) return; // superseded by a newer attempt
        cleanup();
        sIdx = 0; // success — reset server preference to primary
        h.onOpen && h.onOpen(p, id);
      });

      if (h.onConnection) p.on('connection', h.onConnection);

      p.on('disconnected', function () {
        if (p !== peer || p.destroyed) return;
        // If it was open before (has _lastServerId set by PeerJS), the signaling
        // channel dropped — try reconnect() which is cheap and preserves data conns.
        // If it was never open, reconnect() is a silent no-op — destroy+recreate instead.
        if (p._lastServerId) {
          retryTmr = setTimeout(function () {
            if (p === peer && p && !p.destroyed) {
              try { p.reconnect(); }
              catch (e) { fail(p); }
            }
          }, RETRY_DELAY);
        } else {
          fail(p);
        }
      });

      p.on('error', function (err) {
        if (p !== peer) return;
        cleanup();

        if (err.type === 'unavailable-id') {
          // Fixed ID is already taken by another session.
          // Kill the peer and let the caller decide what to do.
          kill(p); peer = null;
          h.onUnavailable && h.onUnavailable();
          return; // do NOT retry automatically
        }

        if (err.type === 'peer-unavailable') {
          // Target peer (e.g. hub) is offline — our own peer is fine.
          // Caller's retry loop handles reconnecting to the target.
          return;
        }

        // Any other error (network, socket, server-error, etc.) — fail over
        fail(p);
      });
    }

    function fail(p) {
      cleanup();
      kill(p); peer = null;
      sIdx++;
      retryTmr = setTimeout(attempt, RETRY_DELAY);
    }

    // Kick off first attempt
    attempt();

    return {
      get peer() { return peer; },
      get open() { return !!(peer && peer.open); },
      destroy: function () {
        dead = true;
        cleanup();
        kill(peer); peer = null;
      },
    };
  }

  root.PeerMgr = { connect: connect, SERVERS: SERVERS };

}(window));
