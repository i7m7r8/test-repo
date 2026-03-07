const axios = require("axios");

const manifest = {
  id: "community.multistream.v5",
  version: "5.0.0",
  name: "MultiStream",
  description: "Bollywood, Hollywood, TV Shows & Anime — massive torrent catalog.",
  logo: "https://i.imgur.com/uwDqNDd.png",
  catalogs: [
    { type: "movie",  id: "ms_hollywood",  name: "🎬 Hollywood",        extra: [{ name: "search" }, { name: "skip" }] },
    { type: "movie",  id: "ms_bollywood",  name: "🇮🇳 Bollywood & Hindi", extra: [{ name: "search" }, { name: "skip" }] },
    { type: "series", id: "ms_tvshows",    name: "📺 TV Shows",          extra: [{ name: "search" }, { name: "skip" }] },
    { type: "series", id: "ms_anime",      name: "🎌 Anime",             extra: [{ name: "search" }, { name: "skip" }] }
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
  "tracker:http://nyaa.tracker.wf:7777/announce"
];

// Multiple apibay mirrors — tries each until one works
const TPB_MIRRORS = [
  "https://apibay.org",
  "https://piratebay.live",
  "https://thepiratebay.org",
];

async function tpbFetch(path) {
  for (const mirror of TPB_MIRRORS) {
    try {
      const res = await axios.get(mirror + path, { timeout: 8000 });
      if (Array.isArray(res.data) && res.data.length > 0 && res.data[0].id !== "0") {
        return res.data;
      }
    } catch (e) {
      continue;
    }
  }
  return [];
}

const QUERIES = {
  ms_hollywood: "movie 1080p english",
  ms_bollywood: "hindi 1080p",
  ms_tvshows:   "season complete 1080p",
  ms_anime:     "anime 1080p"
};

const CATS = {
  ms_hollywood: "207",
  ms_bollywood: "200",
  ms_tvshows:   "205",
  ms_anime:     "205"
};

function sizeStr(b) {
  const n = parseInt(b) || 0;
  if (n > 1073741824) return (n / 1073741824).toFixed(1) + " GB";
  if (n > 1048576) return (n / 1048576).toFixed(0) + " MB";
  return n + " B";
}

function quality(name) {
  if (/2160p|4K|UHD/i.test(name)) return "4K";
  if (/1080p/i.test(name)) return "1080p";
  if (/720p/i.test(name)) return "720p";
  if (/480p/i.test(name)) return "480p";
  return "SD";
}

function cleanTitle(name) {
  return name
    .replace(/S\d+E\d+.*/i, "")
    .replace(/\(?\d{4}\)?/, "")
    .replace(/1080p|720p|480p|4K|2160p|BluRay|WEBRip|WEB[-.]DL|HDTV|DVDRip|x264|x265|HEVC|AAC|DD5\.1|ESub|EZTV|YIFY|YTS|HDR|Atmos/gi, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[-._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function yearFromName(name) {
  return name.match(/\b(19|20)\d{2}\b/)?.[0] || "";
}

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

  // CATALOG
  const catMatch = path.match(/^\/catalog\/([^/]+)\/([^/]+?)(?:\/([^/]+?))?\.json$/);
  if (catMatch) {
    const [, type, id, extraStr] = catMatch;
    const extra = parseExtra(extraStr);
    const search = extra.search || "";
    const skip = parseInt(extra.skip || 0);
    const page = Math.floor(skip / 20);
    const cat = CATS[id] || "0";
    const query = search || QUERIES[id] || "movie";

    try {
      const results = await tpbFetch(`/q.php?q=${encodeURIComponent(query)}&cat=${cat}`);
      const seen = new Set();
      const metas = [];
      for (const t of results) {
        if (!t.info_hash || t.seeders === "0" || parseInt(t.seeders) < 1) continue;
        const title = cleanTitle(t.name);
        if (!title || seen.has(title.toLowerCase())) continue;
        seen.add(title.toLowerCase());
        metas.push({
          id: `ms_${t.info_hash.toLowerCase()}`,
          type,
          name: title,
          poster: `https://via.placeholder.com/300x450/0f0f1a/818cf8?text=${encodeURIComponent(title.slice(0, 15))}`,
          description: `${quality(t.name)} | 🌱 ${t.seeders} seeds | 💾 ${sizeStr(t.size)}`,
          year: yearFromName(t.name),
          genres: []
        });
        if (metas.length >= 20) break;
      }
      return respond(res, { metas });
    } catch (e) {
      console.error("Catalog error:", e.message);
      return respond(res, { metas: [] });
    }
  }

  // META
  const metaMatch = path.match(/^\/meta\/([^/]+)\/(ms_[^/]+?)\.json$/);
  if (metaMatch) {
    const [, type, id] = metaMatch;
    const hash = id.replace("ms_", "");
    try {
      const results = await tpbFetch(`/t.php?h=${hash}`);
      const t = Array.isArray(results) ? results[0] : results;
      if (t && t.name) {
        const title = cleanTitle(t.name);
        return respond(res, {
          meta: {
            id, type,
            name: title,
            poster: `https://via.placeholder.com/300x450/0f0f1a/818cf8?text=${encodeURIComponent(title.slice(0, 15))}`,
            description: `${quality(t.name)} | 🌱 ${t.seeders} seeds | 💾 ${sizeStr(t.size)}\n\nOriginal: ${t.name}`,
            year: yearFromName(t.name),
            genres: []
          }
        });
      }
    } catch (e) {}
    return respond(res, { meta: { id, type, name: id } });
  }

  // STREAM
  const streamMatch = path.match(/^\/stream\/([^/]+)\/(ms_[^/]+?)\.json$/);
  if (streamMatch) {
    const [, type, id] = streamMatch;
    const hash = id.replace("ms_", "").toLowerCase();
    try {
      const results = await tpbFetch(`/t.php?h=${hash}`);
      const t = Array.isArray(results) ? results[0] : results;
      const name = t?.name || "";
      return respond(res, {
        streams: [{
          name: `MultiStream\n${quality(name)}`,
          title: `${name || hash}\n💾 ${sizeStr(t?.size)} | 🌱 ${t?.seeders || "?"} seeds`,
          infoHash: hash,
          sources: TRACKERS,
          behaviorHints: { notWebReady: false, bingeGroup: `ms_${hash}` }
        }]
      });
    } catch (e) {
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
