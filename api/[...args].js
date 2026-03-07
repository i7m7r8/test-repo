const axios = require("axios");

const manifest = {
  id: "community.multistream.v8",
  version: "8.0.0",
  name: "MultiStream",
  description: "Debug version",
  logo: "https://i.imgur.com/uwDqNDd.png",
  catalogs: [],
  resources: [],
  types: ["movie", "series"],
  idPrefixes: ["ms_"],
  behaviorHints: { adult: true, p2p: true }
};

function respond(res, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const path = (req.url || "/").split("?")[0];

  if (path === "/" || path === "/manifest.json") return respond(res, manifest);

  if (path === "/debug") {
    const TPB = "https://apibay.org/q.php?q=batman&cat=207";

    const tests = [
      // Direct torrent APIs
      { name: "yts",              url: "https://yts.mx/api/v2/list_movies.json?limit=1" },
      { name: "eztvx",            url: "https://eztvx.to/api/get-torrents?limit=1" },
      { name: "nyaa",             url: "https://nyaa.si/?page=rss&q=anime&c=1_0&f=0" },
      { name: "solidtorrents",    url: "https://solidtorrents.to/api/v1/search?q=batman&limit=1" },
      { name: "torrentscsv",      url: "https://torrents-csv.com/service/search?size=1&q=batman" },
      { name: "torrentapi",       url: "https://torrentapi.org/pubapi_v2.php?mode=list&limit=1&format=json_extended&app_id=test123" },
      { name: "cinemeta",         url: "https://v3-cinemeta.strem.io/catalog/movie/top.json" },
      { name: "tmdb",             url: "https://api.themoviedb.org/3/movie/popular?api_key=4ef0d7355d9ffb5151e987764708ce96" },
      { name: "imdb_suggest",     url: "https://v3.sg.media-imdb.com/suggestion/b/batman.json" },

      // apibay via proxies
      { name: "apibay_direct",    url: TPB },
      { name: "proxy_allorigins", url: "https://api.allorigins.win/raw?url=" + encodeURIComponent(TPB) },
      { name: "proxy_codetabs",   url: "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(TPB) },
      { name: "proxy_htmldriven", url: "https://api.htmldriven.com/proxy?url=" + encodeURIComponent(TPB) },
      { name: "proxy_whateverorigin", url: "http://www.whateverorigin.org/get?url=" + encodeURIComponent(TPB) },
      { name: "proxy_yacdn",      url: "https://yacdn.org/proxy/" + TPB },
      { name: "proxy_cors_sh",    url: "https://proxy.cors.sh/" + TPB },
      { name: "proxy_crossorigin",url: "https://crossorigin.me/" + TPB },
      { name: "proxy_corsbridge", url: "https://cors-anywhere.azm.workers.dev/" + TPB },
      { name: "proxy_getproxi",   url: "https://getproxi.es/" + TPB },
    ];

    const results = [];
    for (const t of tests) {
      try {
        const r = await axios.get(t.url, {
          timeout: 7000,
          headers: { "User-Agent": "Mozilla/5.0", "Origin": "https://stremio.com" }
        });
        let data = r.data;
        if (data && data.contents) {
          try { data = JSON.parse(data.contents); } catch(e) {}
        }
        const preview = JSON.stringify(data).slice(0, 100);
        results.push({ name: t.name, status: "OK", preview });
      } catch (e) {
        results.push({ name: t.name, status: "FAIL", error: e.code || e.message });
      }
    }
    return respond(res, { results });
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
};
