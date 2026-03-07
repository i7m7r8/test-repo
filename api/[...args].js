const axios = require("axios");

const manifest = {
  id: "community.multistream.v3",
  version: "3.0.0",
  name: "MultiStream",
  description: "Bollywood, Hollywood, TV Shows & Anime — Massive content via torrent search.",
  logo: "https://i.imgur.com/uwDqNDd.png",
  catalogs: [
    {
      type: "movie",
      id: "ms_hollywood",
      name: "🎬 Hollywood",
      extra: [{ name: "search" }, { name: "skip" }]
    },
    {
      type: "movie",
      id: "ms_bollywood",
      name: "🇮🇳 Bollywood & Hindi",
      extra: [{ name: "search" }, { name: "skip" }]
    },
    {
      type: "series",
      id: "ms_tvshows",
      name: "📺 TV Shows",
      extra: [{ name: "search" }, { name: "skip" }]
    },
    {
      type: "series",
      id: "ms_anime",
      name: "🎌 Anime",
      extra: [{ name: "search" }, { name: "skip" }]
    }
  ],
  resources: ["catalog", "stream", "meta"],
  types: ["movie", "series"],
  idPrefixes: ["ms_"],
  behaviorHints: { adult: true, p2p: true }
};

const TRACKERS = [
  "tracker:udp://open.demonii.com:1337/announce",
  "tracker:udp://tracker.openbittorrent.com:80",
  "tracker:udp://tracker.coppersurfer.tk:6969",
  "tracker:udp://tracker.opentrackr.org:1337/announce",
  "tracker:udp://tracker.leechers-paradise.org:6969",
  "tracker:udp://p4p.arenabg.com:1337"
];

const CATALOG_QUERIES = {
  ms_hollywood: "movie 1080p",
  ms_bollywood: "hindi 1080p",
  ms_tvshows:   "tv show season",
  ms_anime:     "anime 1080p"
};

// Category filters for TPB
// 200=video, 205=TV, 207=HD Movies, 208=HD TV
const CATALOG_CATS = {
  ms_hollywood: "207",
  ms_bollywood: "200",
  ms_tvshows:   "205",
  ms_anime:     "205"
};

function respond(res, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function parseExtra(str) {
  const out = {};
  if (!str) return out;
  str.split("&").forEach(p => {
    const i = p.indexOf("=");
    if (i > 0) out[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1));
  });
  return out;
}

async function tpbSearch(query, cat = "0", skip = 0) {
  const page = Math.floor(skip / 20);
  const url = `https://apibay.org/q.php?q=${encodeURIComponent(query)}&cat=${cat}&p=${page}`;
  const res = await axios.get(url, { timeout: 10000 });
  const data = res.data;
  if (!Array.isArray(data) || (data.length === 1 && data[0].id === "0")) return [];
  return data;
}

function sizeStr(bytes) {
  const n = parseInt(bytes) || 0;
  if (n > 1073741824) return (n / 1073741824).toFixed(2) + " GB";
  if (n > 1048576) return (n / 1048576).toFixed(0) + " MB";
  return n + " B";
}

function qualityFromName(name) {
  if (/2160p|4K|UHD/i.test(name)) return "4K";
  if (/1080p/i.test(name)) return "1080p";
  if (/720p/i.test(name)) return "720p";
  if (/480p/i.test(name)) return "480p";
  return "SD";
}

function yearFromName(name) {
  const m = name.match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : "";
}

function cleanTitle(name) {
  return name
    .replace(/\(?\d{4}\)?/, "")
    .replace(/1080p|720p|480p|4K|2160p|BluRay|WEBRip|WEB-DL|HDTV|DVDRip|x264|x265|HEVC|AAC|DD5\.1|ESub|YIFY|YTS|EZTV/gi, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[-._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function torrentToMeta(t, type) {
  const title = cleanTitle(t.name);
  const year = yearFromName(t.name);
  const quality = qualityFromName(t.name);
  return {
    id: `ms_${t.info_hash.toLowerCase()}`,
    type,
    name: title || t.name,
    poster: `https://via.placeholder.com/300x450/1a1a2e/818cf8?text=${encodeURIComponent(title.slice(0, 20))}`,
    description: `${quality} | Seeds: ${t.seeders} | Size: ${sizeStr(t.size)}`,
    year,
    genres: []
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const rawUrl = req.url || "/";
  const path = rawUrl.split("?")[0];

  // MANIFEST
  if (path === "/" || path === "/manifest.json") {
    return respond(res, manifest);
  }

  // CATALOG  /catalog/:type/:id/:extra.json
  const catMatch = path.match(/^\/catalog\/([^/]+)\/([^/]+?)(?:\/([^/]+?))?\.json$/);
  if (catMatch) {
    const [, type, id, extraStr] = catMatch;
    const extra = parseExtra(extraStr);
    const search = extra.search || "";
    const skip = parseInt(extra.skip || 0);

    const baseQuery = CATALOG_QUERIES[id] || "movie";
    const cat = CATALOG_CATS[id] || "0";
    const query = search || baseQuery;

    try {
      const results = await tpbSearch(query, cat, skip);

      // Deduplicate by cleaned title
      const seen = new Set();
      const metas = [];
      for (const t of results) {
        if (!t.info_hash || t.seeders === "0") continue;
        const title = cleanTitle(t.name);
        if (!seen.has(title.toLowerCase())) {
          seen.add(title.toLowerCase());
          metas.push(torrentToMeta(t, type));
        }
      }

      return respond(res, { metas: metas.slice(0, 20) });
    } catch (e) {
      console.error("Catalog error:", e.message);
      return respond(res, { metas: [] });
    }
  }

  // META  /meta/:type/:id.json
  const metaMatch = path.match(/^\/meta\/([^/]+)\/(ms_[^/]+?)\.json$/);
  if (metaMatch) {
    const [, type, id] = metaMatch;
    const hash = id.replace("ms_", "");
    try {
      const url = `https://apibay.org/t.php?h=${hash}`;
      const r = await axios.get(url, { timeout: 8000 });
      const t = r.data;
      if (t && t.info_hash) {
        const title = cleanTitle(t.name);
        const year = yearFromName(t.name);
        return respond(res, {
          meta: {
            id,
            type,
            name: title || t.name,
            poster: `https://via.placeholder.com/300x450/1a1a2e/818cf8?text=${encodeURIComponent(title.slice(0,20))}`,
            description: `${qualityFromName(t.name)} | Seeds: ${t.seeders} | Size: ${sizeStr(t.size)}\n\n${t.name}`,
            year,
            genres: []
          }
        });
      }
    } catch (e) {
      console.error("Meta error:", e.message);
    }
    return respond(res, { meta: { id, type, name: id } });
  }

  // STREAM  /stream/:type/:id.json
  const streamMatch = path.match(/^\/stream\/([^/]+)\/(ms_[^/]+?)\.json$/);
  if (streamMatch) {
    const [, type, id] = streamMatch;
    const hash = id.replace("ms_", "").toLowerCase();

    try {
      // Get torrent details
      const url = `https://apibay.org/t.php?h=${hash}`;
      const r = await axios.get(url, { timeout: 8000 });
      const t = r.data;
      const name = t?.name || hash;
      const quality = qualityFromName(name);
      const size = sizeStr(t?.size || 0);
      const seeds = t?.seeders || "?";

      return respond(res, {
        streams: [{
          name: `MultiStream\n${quality}`,
          title: `${name}\n💾 ${size} | 🌱 ${seeds} seeds`,
          infoHash: hash,
          sources: TRACKERS,
          behaviorHints: {
            notWebReady: false,
            bingeGroup: `ms_${hash}`
          }
        }]
      });
    } catch (e) {
      // Fallback — return stream with just hash
      return respond(res, {
        streams: [{
          name: "MultiStream",
          title: "Stream",
          infoHash: hash,
          sources: TRACKERS,
          behaviorHints: { notWebReady: false }
        }]
      });
    }
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
};
