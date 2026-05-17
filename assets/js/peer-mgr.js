/* ============================================================
   peer-mgr.js  —  Reliable PeerJS connection manager
   ─────────────────────────────────────────────────────────
   Local dev  : ws://localhost:9001  (serve.js built-in, never sleeps)
   Production : 0.peerjs.com (official cloud — no cold starts)
   Auto-switch: checks location.hostname; localhost → local first.

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

  /* ── production peer server ─────────────────────────────── */
  // Set this to the hostname of your deployed PeerJS server (peerserver/).
  // After deploying to Fly.io: 'celestial-peer.fly.dev'   (or your app name)
  // Leave as '' to use 0.peerjs.com only (less reliable — no SLA).
  const PROD_PEER = '';

  /* ── server list ────────────────────────────────────────── */
  const _locHost = localStorage.getItem('cst-peer-host');
  const _locPort = parseInt(localStorage.getItem('cst-peer-port') || '0');

  // When the page is served from localhost (via serve.js), the local PeerJS
  // server on port 9001 is always available and never cold-starts.
  // Chrome allows ws://localhost from https://localhost pages because localhost
  // is a "potentially trustworthy" origin — no extra cert bypass needed.
  const _isLocal = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  const _localPeer  = { host: 'localhost',  port: _locPort || 9001, path: '/', secure: false, debug: 0 };
  const _prodPeer   = PROD_PEER ? { host: PROD_PEER, port: 443, path: '/', secure: true, debug: 0 } : null;
  const _cloudPeer  = { host: '0.peerjs.com', port: 443, path: '/', secure: true, debug: 0 };

  // Priority order:
  //   local dev   → localhost:9001  →  PROD_PEER (if set)  →  0.peerjs.com
  //   production  → PROD_PEER (if set)  →  0.peerjs.com
  //   localStorage override → custom host  →  PROD_PEER  →  0.peerjs.com
  function _buildServers() {
    // Manual localStorage override always wins
    if (_locHost) {
      if (_locHost === 'localhost')
        return [{ host: 'localhost', port: _locPort || 9001, path: '/', secure: false, debug: 0 }];
      const custom = { host: _locHost, port: _locPort || 443, path: '/peerjs', secure: true, debug: 0 };
      return _prodPeer ? [custom, _prodPeer, _cloudPeer] : [custom, _cloudPeer];
    }
    // Local dev: local first, then prod, then cloud
    if (_isLocal)
      return _prodPeer ? [_localPeer, _prodPeer, _cloudPeer] : [_localPeer, _cloudPeer];
    // Production: self-hosted first, cloud fallback
    return _prodPeer ? [_prodPeer, _cloudPeer] : [_cloudPeer];
  }

  const SERVERS = _buildServers();

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
