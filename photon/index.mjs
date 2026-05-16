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
    const scheme = remote.tls ? "https" : "http";
    const defaultPort = remote.tls ? 443 : 80;
    const portStr = remote.port && remote.port !== defaultPort ? `:${remote.port}` : "";
    const targetUrl = `${scheme}://${remote.host}${portStr}${remote.path}`;

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
