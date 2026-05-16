/**
 * photon client transport for BRC (bumblcat rewrite controller)
 * Routes requests through the bumblcat-photon Cloudflare Worker.
 * Server handles TLS natively — no WASM SSL, no error 35.
 */

const PHOTON_SERVER = "https://bumblcat-photon.bumblcat.workers.dev";

export default class PhotonTransport {
  constructor({ server } = {}) {
    this.server = (server || PHOTON_SERVER).replace(/\/$/, "");
  }

  async init() {}

  async request(remote, method, body, headers, signal) {
    // remote is a URL object (BRC passes new URL(e))
    const targetUrl = remote instanceof URL ? remote.href
      : `${remote.tls ? "https" : "http"}://${remote.hostname || remote.host}${remote.port ? `:${remote.port}` : ""}${remote.pathname || remote.path || "/"}`;

    // Normalize headers to plain object
    const headersObj = {};
    if (Array.isArray(headers)) {
      for (const [k, v] of headers) headersObj[k] = v;
    } else if (headers && typeof headers === "object") {
      Object.assign(headersObj, headers);
    }

    const resp = await fetch(`${this.server}/proxy`, {
      method: "POST",
      headers: {
        "X-Photon-URL": btoa(targetUrl),
        "X-Photon-Method": method,
        "X-Photon-Headers": JSON.stringify(headersObj),
      },
      body: ["GET", "HEAD"].includes(method.toUpperCase()) ? undefined : body,
      signal,
    });

    if (!resp.ok && resp.status >= 500) {
      throw new Error(`photon: server error ${resp.status}`);
    }

    const status = parseInt(resp.headers.get("X-Photon-Status") ?? "200", 10);
    let responseHeaders = [];
    try {
      responseHeaders = JSON.parse(resp.headers.get("X-Photon-Resp-Headers") ?? "[]");
    } catch {}

    return {
      status,
      headers: responseHeaders,
      body: resp.body,
    };
  }
}
