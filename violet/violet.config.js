self.__uv$config = {
  prefix: "/service/ultra/",
  encodeUrl: (str) => {
    if (!str) return str;
    return encodeURIComponent(str);
  },
  decodeUrl: (str) => {
    if (!str) return str;
    return decodeURIComponent(str);
  },
  handler:
    "/violet/violet.handler.js",
  client:
    "/violet/violet.client.js",
  bundle:
    "/violet/violet.bundle.js",
  config: "/violet/violet.config.js",
  sw: "/violet/violet.sw.js",
}
