/* ============================================================
   peer-mgr.js  —  Reliable PeerJS connection manager
   ─────────────────────────────────────────────────────────
   Server priority (first that opens wins):
     1. localhost:9001     — serve.js built-in, only when on localhost
     2. PROD_PEER          — always-on host (Fly.io / Railway) if configured
     3. 0.peerjs.com       — official public cloud
     4. RENDER_PEER        — Render free tier; cold-starts handled with
                             pre-wake HTTP ping + 45 s extended timeout

   Cold-start handling for Render (slowStart servers):
     • As soon as peer-mgr.js loads, a no-cors fetch is fired at the
       Render URL.  This hits Render's HTTP layer, which starts the
       container.  Render typically wakes in 15–30 s.
     • The same wake fetch is repeated when that server is actually
       attempted, in case it was skipped for a while.
     • The open watchdog is extended to SLOW_OPEN_TIMEOUT (45 s) so
       PeerJS has time to connect once the container is up.
     • If Render still hasn't answered after 45 s it's treated as down
       and we cycle back to the top of the list.

   Handles:
   • Open watchdog — if 'open' never fires within timeout, destroy and
     try the next server.
   • Reconnect vs recreate — signaling WS drop → reconnect(); never-
     opened peer → destroy+recreate.
   • peer-unavailable — silently ignored (hub offline, caller retries).
   • unavailable-id   — calls onUnavailable(), stops retrying.

   Usage:
     const mgr = PeerMgr.connect(peerId, { onOpen, onConnection, onUnavailable });
     mgr.destroy()  // when done
   ============================================================ */
(function (root) {
  'use strict';

  /* ── configure your servers here ───────────────────────── */

  // Always-on self-hosted server (Fly.io or Railway — never sleeps).
  // Set to the hostname after deploying peerserver/.
  // e.g. 'celestial-peer.fly.dev'  or  'celestial-peer.up.railway.app'
  // Leave '' to skip.
  const PROD_PEER = '';

  // Render free-tier server — will cold-start but peer-mgr will pre-wake it.
  // Deploy peerserver/ to Render and paste the hostname here.
  // e.g. 'celestial-peer-xxxx.onrender.com'
  // Leave '' to skip.
  const RENDER_PEER = '';

  /* ── timeouts ───────────────────────────────────────────── */
  const OPEN_TIMEOUT      =  6000;  // ms — fast servers (local / cloud)
  const SLOW_OPEN_TIMEOUT = 45000;  // ms — Render cold-start window
  const RETRY_DELAY       =  2000;  // ms between connection attempts

  /* ── server list ────────────────────────────────────────── */
  const _locHost = localStorage.getItem('cst-peer-host');
  const _locPort = parseInt(localStorage.getItem('cst-peer-port') || '0');
  const _isLocal = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

  // Server descriptors.  Extra fields:
  //   slowStart: true  →  use SLOW_OPEN_TIMEOUT + pre-wake fetch
  //   wakeUrl          →  URL to fetch for wake-up (defaults to https://host/)
  const _local  = { host: 'localhost', port: _locPort || 9001, path: '/', secure: false, debug: 0 };
  const _prod   = PROD_PEER   ? { host: PROD_PEER,   port: 443, path: '/', secure: true,  debug: 0 } : null;
  const _cloud  = { host: '0.peerjs.com', port: 443, path: '/', secure: true,  debug: 0 };
  const _render = RENDER_PEER ? {
    host:      RENDER_PEER, port: 443, path: '/', secure: true, debug: 0,
    slowStart: true,
    wakeUrl:   'https://' + RENDER_PEER + '/',
  } : null;

  function _buildServers() {
    // localStorage manual override always wins
    if (_locHost) {
      if (_locHost === 'localhost')
        return [{ host: 'localhost', port: _locPort || 9001, path: '/', secure: false, debug: 0 }];
      const custom = { host: _locHost, port: _locPort || 443, path: '/peerjs', secure: true, debug: 0 };
      return [custom, _prod, _cloud, _render].filter(Boolean);
    }
    // IMPORTANT: cloud server MUST come first for ALL instances (local and remote alike)
    // so peers can find each other regardless of which hostname they loaded from.
    // Local PeerJS server (localhost:9001) is appended as a fallback ONLY.
    if (_isLocal) return [_prod, _cloud, _render, _local].filter(Boolean);
    return          [_prod, _cloud, _render].filter(Boolean);
  }

  const SERVERS = _buildServers();

  /* ── pre-wake all slow-start servers immediately ────────── */
  // Fire-and-forget HTTP pings as soon as peer-mgr.js loads.
  // This starts Render's container warm-up long before it's needed.
  SERVERS.forEach(function (s) {
    if (s.slowStart && s.wakeUrl) {
      fetch(s.wakeUrl, { mode: 'no-cors', cache: 'no-store' }).catch(function () {});
    }
  });

  /* ── helpers ────────────────────────────────────────────── */
  function _wake(s) {
    // Re-ping a slow-start server right before attempting its WebSocket.
    // If it's still starting, this extends the keep-alive on Render's side.
    if (s.slowStart && s.wakeUrl) {
      fetch(s.wakeUrl, { mode: 'no-cors', cache: 'no-store' }).catch(function () {});
    }
  }

  /* ── connect ────────────────────────────────────────────── */
  /**
   * PeerMgr.connect(peerId, handlers) → manager
   *
   * peerId   – string for a fixed known ID, null/undefined for random
   * handlers – { onOpen(peer, id), onConnection(conn), onUnavailable() }
   *
   * Returns  – { peer, open, destroy() }
   */
  function connect(peerId, handlers) {
    var h            = handlers || {};
    var peer         = null;
    var sIdx         = 0;
    var failCount    = 0;       // total consecutive failures across all servers
    var retryDelay   = RETRY_DELAY;
    var firstFail    = 0;       // timestamp of first failure in this streak
    var notifiedFail = false;   // have we shown the "can't connect" banner yet?
    var watchdog     = null;
    var retryTmr     = null;
    var notifyTmr    = null;    // delayed banner for slow-start servers
    var dead         = false;

    function cleanup() {
      clearTimeout(watchdog);  watchdog  = null;
      clearTimeout(retryTmr);  retryTmr  = null;
      clearTimeout(notifyTmr); notifyTmr = null;
    }

    function kill(p) {
      if (p && !p.destroyed) { try { p.destroy(); } catch (e) {} }
    }

    function _notify(msg, type, dur) {
      if (typeof window.notify === 'function') window.notify(msg, type, dur);
    }

    function attempt() {
      if (dead) return;
      cleanup();

      var s       = SERVERS[sIdx % SERVERS.length];
      var timeout = s.slowStart ? SLOW_OPEN_TIMEOUT : OPEN_TIMEOUT;

      // Re-ping slow-start (Render) servers right before attempting WS.
      _wake(s);

      // Slow-start banner: if still not open after 3 s, Render is sleeping.
      if (s.slowStart) {
        notifyTmr = setTimeout(function () {
          notifyTmr = null;
          _notify('Waking signaling server up, please wait…', 'info', 40000);
        }, 3000);
      }

      // Generic failure banner: if we've been failing for > 10 s total and
      // haven't shown anything yet, let the user know rather than silent retries.
      if (failCount > 0 && !notifiedFail && (Date.now() - firstFail) > 10000) {
        notifiedFail = true;
        _notify('Signaling server unavailable, retrying…', 'warning', 30000);
      }

      var p = new Peer(peerId != null ? peerId : undefined, {
        host:   s.host,
        port:   s.port,
        path:   s.path,
        secure: s.secure,
        debug:  s.debug,
      });
      peer = p;

      // Watchdog: bail if 'open' doesn't fire within the timeout window.
      watchdog = setTimeout(function () {
        if (p === peer && p && !p.open && !p.destroyed) {
          kill(p); peer = null;
          sIdx++;
          retryTmr = setTimeout(attempt, retryDelay);
        }
      }, timeout);

      p.on('open', function (id) {
        if (p !== peer) return;
        cleanup();
        // Reset failure state on success.
        sIdx         = 0;
        failCount    = 0;
        retryDelay   = RETRY_DELAY;
        firstFail    = 0;
        notifiedFail = false;
        h.onOpen && h.onOpen(p, id);
      });

      if (h.onConnection) p.on('connection', h.onConnection);

      p.on('disconnected', function () {
        if (p !== peer || p.destroyed) return;
        // Previously-open peer: reconnect() keeps data connections alive.
        // Never-opened peer: reconnect() is a no-op — destroy+recreate.
        if (p._lastServerId) {
          retryTmr = setTimeout(function () {
            if (p === peer && p && !p.destroyed) {
              try { p.reconnect(); } catch (e) { fail(p); }
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
          kill(p); peer = null;
          h.onUnavailable && h.onUnavailable();
          return;
        }

        if (err.type === 'peer-unavailable') {
          return; // hub offline — caller's retry loop handles it
        }

        fail(p);
      });
    }

    function fail(p) {
      cleanup();
      kill(p); peer = null;

      failCount++;
      if (!firstFail) firstFail = Date.now();

      // Exponential backoff: 2 s → 4 → 8 → 16 → 30 s max.
      // Keeps the server cycling but stops hammering every 2 s forever.
      retryDelay = Math.min(retryDelay * (failCount > 1 ? 2 : 1), 30000);

      sIdx++;
      retryTmr = setTimeout(attempt, retryDelay);
    }

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
