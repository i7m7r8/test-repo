const axios = require("axios");

const manifest = {
  id: "community.multistream.v10",
  version: "10.0.0",
  name: "MultiStream",
  description: "Bollywood, Hollywood, TV Shows & Anime",
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

// ── Title cleaner ─────────────────────────────────────────────
function clean(name) {
  let t = name || "";
  t = t.replace(/\[.*?\]/g, " ");
  t = t.replace(/\(.*?\)/g, " ");
  t = t.replace(/S\d+E\d+.*/i, " ");
  t = t.replace(/\b(19|20)\d{2}\b.*/, "");
  t = t.replace(/\b(2160p|1080p|720p|480p|4K|UHD|HDR|BluRay|BRRip|WEBRip|WEB-DL|WEB|HDTS|HDCAM|CAMRip|HDTC|DVDSCR|HDTV|DVDRip|x264|x265|HEVC|AAC|DDP|DD5|AC3|ESub|EZTV|YIFY|YTS|Atmos|SDR|10bit|REMUX|REPACK|PROPER|EXTENDED|UNRATED|COMPLETE|SEASON|EPISODE|MULTI|BLURAY)\b.*/gi, "");
  t = t.replace(/[-._]+/g, " ");
  t = t.replace(/\s+/g, " ");
  t = t.replace(/[\s,;:\-]+$/, "");
  return t.trim();
}

function quality(name) {
  if (/2160p|4K|UHD/i.test(name)) return "4K";
  if (/1080p/i.test(name)) return "1080p";
  if (/720p/i.test(name)) return "720p";
  if (/480p/i.test(name)) return "480p";
  return "SD";
}

function sizeStr(b) {
  const n = parseInt(b) || 0;
  if (n > 1073741824) return (n / 1073741824).toFixed(1) + " GB";
  if (n > 1048576) return (n / 1048576).toFixed(0) + " MB";
  return n + " B";
}

function year(name) {
  return (name || "").match(/\b(19|20)\d{2}\b/)?.[0] || "";
}

function poster(title) {
  const t = encodeURIComponent((title || "?").slice(0, 18));
  return `https://via.placeholder.com/300x450/0f0f1a/818cf8?text=${t}`;
}

// ── apibay via working proxies ────────────────────────────────
async function tpbSearch(q, cat) {
  const target = `https://apibay.org/q.php?q=${encodeURIComponent(q)}&cat=${cat}`;
  const urls = [
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    `http://www.whateverorigin.org/get?url=${encodeURIComponent(target)}`,
    `https://crossorigin.me/${target}`,
  ];
  for (const url of urls) {
    try {
      const r = await axios.get(url, { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } });
      let d = r.data;
      if (d && d.contents) { try { d = JSON.parse(d.contents); } catch(e) {} }
      if (d && d.get)      { try { d = JSON.parse(d.get); }      catch(e) {} }
      if (typeof d === "string") { try { d = JSON.parse(d); } catch(e) {} }
      if (Array.isArray(d) && d.length > 0 && d[0].id !== "0") return d;
    } catch(e) { continue; }
  }
  return [];
}

// ── Nyaa RSS for anime ────────────────────────────────────────
async function nyaaSearch(q) {
  const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(q || "anime")}&c=1_2&f=0`;
  const r = await axios.get(url, { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } });
  const items = [];
  for (const block of r.data.split("<item>").slice(1)) {
    const title    = block.match(/<title>(.*?)<\/title>/s)?.[1]?.trim() || "";
    const hash     = block.match(/<nyaa:infoHash>([a-fA-F0-9]{40})<\/nyaa:infoHash>/i)?.[1]?.toLowerCase() || "";
    const seeders  = block.match(/<nyaa:seeders>(\d+)<\/nyaa:seeders>/)?.[1] || "0";
    const size     = block.match(/<nyaa:size>(.*?)<\/nyaa:size>/)?.[1] || "";
    if (title && hash && parseInt(seeders) > 0) items.push({ title, hash, seeders, size });
    if (items.length >= 20) break;
  }
  return items;
}

// ── Response helper ───────────────────────────────────────────
function respond(res, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function parseExtra(str) {
  const out = {};
  if (!str) return out;
  for (const p of str.split("&")) {
    const i = p.indexOf("=");
    if (i > 0) out[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1));
  }
  return out;
}

// ── Main ──────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const path = (req.url || "/").split("?")[0];

  // MANIFEST
  if (path === "/" || path === "/manifest.json") return respond(res, manifest);

  // CATALOG
  const cm = path.match(/^\/catalog\/([^/]+)\/([^/]+?)(?:\/([^/]+?))?\.json$/);
  if (cm) {
    const [, type, id, extraStr] = cm;
    const extra = parseExtra(extraStr);
    const search = extra.search || "";

    try {
      // ── Anime via Nyaa
      if (id === "ms_anime") {
        const items = await nyaaSearch(search || "anime 1080p");
        const seen = new Set();
        const metas = [];
        for (const item of items) {
          const name = clean(item.title.replace(/^\[.*?\]\s*/, ""));
          if (!name || seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          metas.push({
            id: `ms_${item.hash}`,
            type: "series",
            name,
            poster: poster(name),
            description: `🎌 ${quality(item.title)} | 🌱 ${item.seeders} seeds | ${item.size}`,
            genres: ["Anime"]
          });
        }
        return respond(res, { metas });
      }

      // ── Others via apibay
      const catMap = { ms_hollywood: "207", ms_bollywood: "200", ms_tvshows: "205" };
      const queryMap = {
        ms_hollywood: "movie 1080p english",
        ms_bollywood: "hindi 1080p",
        ms_tvshows: "season complete 1080p"
      };
      const q = search || queryMap[id] || "movie";
      const cat = catMap[id] || "0";

      const results = await tpbSearch(q, cat);
      const seen = new Set();
      const metas = [];
      for (const t of results) {
        if (!t.info_hash || parseInt(t.seeders) < 1) continue;
        const name = clean(t.name);
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        metas.push({
          id: `ms_${t.info_hash.toLowerCase()}`,
          type,
          name,
          poster: poster(name),
          description: `${quality(t.name)} | 🌱 ${t.seeders} seeds | 💾 ${sizeStr(t.size)}`,
          year: year(t.name),
          genres: []
        });
        if (metas.length >= 20) break;
      }
      return respond(res, { metas });

    } catch(e) {
      console.error(e.message);
      return respond(res, { metas: [] });
    }
  }

  // META
  const mm = path.match(/^\/meta\/([^/]+)\/(ms_[^/]+?)\.json$/);
  if (mm) {
    const [, type, id] = mm;
    return respond(res, {
      meta: { id, type, name: id.replace("ms_", ""), poster: poster("?"), genres: [] }
    });
  }

  // STREAM
  const sm = path.match(/^\/stream\/([^/]+)\/(ms_[^/]+?)\.json$/);
  if (sm) {
    const [, , id] = sm;
    const hash = id.replace("ms_", "").toLowerCase();
    return respond(res, {
      streams: [{
        name: "MultiStream",
        title: "⚡ Play",
        infoHash: hash,
        sources: TRACKERS,
        behaviorHints: { notWebReady: false, bingeGroup: `ms_${hash}` }
      }]
    });
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
};
