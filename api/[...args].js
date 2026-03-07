const axios = require("axios");

const manifest = {
  id: "community.multistream.v9",
  version: "9.0.0",
  name: "MultiStream",
  description: "Bollywood, Hollywood, TV Shows & Anime — powered by torrent search.",
  logo: "https://i.imgur.com/uwDqNDd.png",
  catalogs: [
    { type: "movie",  id: "ms_hollywood",  name: "🎬 Hollywood",         extra: [{ name: "search" }, { name: "skip" }] },
    { type: "movie",  id: "ms_bollywood",  name: "🇮🇳 Bollywood & Hindi", extra: [{ name: "search" }, { name: "skip" }] },
    { type: "series", id: "ms_tvshows",    name: "📺 TV Shows",           extra: [{ name: "search" }, { name: "skip" }] },
    { type: "series", id: "ms_anime",      name: "🎌 Anime",              extra: [{ name: "search" }, { name: "skip" }] }
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

// ── apibay via working proxies ────────────────────────────────
async function tpbSearch(query, cat = "0") {
  const target = `https://apibay.org/q.php?q=${encodeURIComponent(query)}&cat=${cat}`;
  const proxies = [
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    `http://www.whateverorigin.org/get?url=${encodeURIComponent(target)}`,
    `https://crossorigin.me/${target}`,
  ];
  for (const url of proxies) {
    try {
      const r = await axios.get(url, { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } });
      let data = r.data;
      if (data && typeof data === "object" && data.contents) {
        try { data = JSON.parse(data.contents); } catch(e) {}
      }
      if (data && typeof data === "object" && data.get) {
        try { data = JSON.parse(data.get); } catch(e) {}
      }
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch(e) {}
      }
      if (Array.isArray(data) && data.length > 0 && data[0].id !== "0") {
        return data;
      }
    } catch(e) { continue; }
  }
  return [];
}

// ── Nyaa RSS for anime ────────────────────────────────────────
async function nyaaSearch(query, skip = 0) {
  const page = Math.floor(skip / 20);
  const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(query || "anime")}&c=1_0&f=0&p=${page}`;
  const r = await axios.get(url, { timeout: 10000 });
  const items = [];
  for (const m of r.data.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const title = b.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || b.match(/<title>(.*?)<\/title>/)?.[1] || "";
    const magnet = b.match(/<nyaa:magnetURI><!\[CDATA\[(.*?)\]\]><\/nyaa:magnetURI>/)?.[1] || "";
    const hash = magnet.match(/btih:([a-fA-F0-9]{40})/i)?.[1]?.toLowerCase() || "";
    const seeders = b.match(/<nyaa:seeders>(.*?)<\/nyaa:seeders>/)?.[1] || "0";
    const size = b.match(/<nyaa:size>(.*?)<\/nyaa:size>/)?.[1] || "";
    if (title && hash) items.push({ title, hash, seeders, size });
    if (items.length >= 20) break;
  }
  return items;
}

// ── torrents-csv fallback ─────────────────────────────────────
async function csvSearch(query) {
  const url = `https://torrents-csv.com/service/search?size=20&q=${encodeURIComponent(query)}`;
  const r = await axios.get(url, { timeout: 8000 });
  return r.data?.torrents || [];
}

// ── Helpers ───────────────────────────────────────────────────
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
    .replace(/2160p|1080p|720p|480p|4K|UHD|BluRay|WEBRip|WEB-DL|HDTV|DVDRip|x264|x265|HEVC|AAC|DD5\.1|ESub|EZTV|YIFY|YTS|HDR|Atmos/gi, "")
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

function tpbToMeta(t, type) {
  const title = cleanTitle(t.name);
  return {
    id: `ms_${t.info_hash.toLowerCase()}`,
    type,
    name: title || t.name,
    poster: `https://via.placeholder.com/300x450/0f0f1a/818cf8?text=${encodeURIComponent((title || "?").slice(0, 15))}`,
    description: `${quality(t.name)} | 🌱 ${t.seeders} seeds | 💾 ${sizeStr(t.size)}`,
    year: yearFromName(t.name),
    genres: []
  };
}

function nyaaToMeta(item) {
  const name = cleanTitle(item.title.replace(/\[.*?\]/g, "").split(" - ")[0].trim());
  return {
    id: `ms_${item.hash}`,
    type: "series",
    name: name || item.title,
    poster: `https://via.placeholder.com/300x450/0f0f1a/e879f9?text=${encodeURIComponent((name || "Anime").slice(0, 15))}`,
    description: `🎌 Anime | 🌱 ${item.seeders} seeds | ${item.size}`,
    genres: ["Anime"]
  };
}

function csvToMeta(t, type) {
  const title = cleanTitle(t.name || "");
  return {
    id: `ms_${t.infohash?.toLowerCase()}`,
    type,
    name: title || t.name,
    poster: `https://via.placeholder.com/300x450/0f0f1a/818cf8?text=${encodeURIComponent((title || "?").slice(0, 15))}`,
    description: `${quality(t.name)} | 🌱 ${t.seeders} seeds`,
    year: yearFromName(t.name || ""),
    genres: []
  };
}

// ── Main handler ──────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const rawUrl = req.url || "/";
  const path = rawUrl.split("?")[0];

  // MANIFEST
  if (path === "/" || path === "/manifest.json") return respond(res, manifest);

  // CATALOG
  const catMatch = path.match(/^\/catalog\/([^/]+)\/([^/]+?)(?:\/([^/]+?))?\.json$/);
  if (catMatch) {
    const [, type, id, extraStr] = catMatch;
    const extra = parseExtra(extraStr);
    const search = extra.search || "";
    const skip = parseInt(extra.skip || 0);
    const cat = CATS[id] || "0";
    const query = search || QUERIES[id] || "movie";

    try {
      // Anime — use Nyaa
      if (id === "ms_anime") {
        const items = await nyaaSearch(query, skip);
        const seen = new Set();
        const metas = [];
        for (const item of items) {
          const m = nyaaToMeta(item);
          if (!seen.has(m.name.toLowerCase())) {
            seen.add(m.name.toLowerCase());
            metas.push(m);
          }
        }
        return respond(res, { metas });
      }

      // Others — use TPB via proxy, fallback to torrents-csv
      let results = await tpbSearch(query, cat);

      if (!results.length) {
        // fallback to torrents-csv
        const csvResults = await csvSearch(query);
        const seen = new Set();
        const metas = [];
        for (const t of csvResults) {
          if (!t.infohash || parseInt(t.seeders) < 1) continue;
          const m = csvToMeta(t, type);
          if (!m.id || seen.has(m.name.toLowerCase())) continue;
          seen.add(m.name.toLowerCase());
          metas.push(m);
          if (metas.length >= 20) break;
        }
        return respond(res, { metas });
      }

      const seen = new Set();
      const metas = [];
      for (const t of results) {
        if (!t.info_hash || parseInt(t.seeders) < 1) continue;
        const m = tpbToMeta(t, type);
        if (!seen.has(m.name.toLowerCase())) {
          seen.add(m.name.toLowerCase());
          metas.push(m);
        }
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
    // Return basic meta — hash is all we need for streaming
    return respond(res, {
      meta: { id, type, name: hash, poster: `https://via.placeholder.com/300x450/0f0f1a/818cf8?text=Loading`, genres: [] }
    });
  }

  // STREAM
  const streamMatch = path.match(/^\/stream\/([^/]+)\/(ms_[^/]+?)\.json$/);
  if (streamMatch) {
    const [, type, id] = streamMatch;
    const hash = id.replace("ms_", "").toLowerCase();
    return respond(res, {
      streams: [{
        name: "MultiStream",
        title: `⚡ Play\n${hash.slice(0, 8)}...`,
        infoHash: hash,
        sources: TRACKERS,
        behaviorHints: { notWebReady: false, bingeGroup: `ms_${hash}` }
      }]
    });
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
};
