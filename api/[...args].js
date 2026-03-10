const axios = require("axios");

const TMDB_KEY = "4ef0d7355d9ffb5151e987764708ce96";

const manifest = {
  id: "community.multistream.v14",
  version: "14.5.0",
  name: "MultiStream",
  description: "Bollywood, Hollywood, TV Shows & Anime",
  logo: "https://i.imgur.com/uwDqNDd.png",
  catalogs: [
    { type: "movie",  id: "ms_hollywood",  name: "🎬 Hollywood",         extra: [{ name: "search" }, { name: "skip" }] },
    { type: "movie",  id: "ms_bollywood",  name: "🇮🇳 Bollywood & Hindi", extra: [{ name: "search" }, { name: "skip" }] },
    { type: "series", id: "ms_tvshows",    name: "📺 TV Shows",           extra: [{ name: "search" }, { name: "skip" }] },
    { type: "series", id: "ms_anime",      name: "🎌 Anime",              extra: [{ name: "search" }, { name: "skip" }] },
    { type: "movie",  id: "ms_xxx",        name: "🔞 Uncensored",         extra: [{ name: "search" }, { name: "skip" }] },
    { type: "series", id: "ms_hentai",     name: "🔞 Hentai",             extra: [{ name: "search" }, { name: "skip" }] }
  ],
  resources: ["catalog", "stream", "meta"],
  types: ["movie", "series"],
  idPrefixes: ["ms_", "tt"],
  behaviorHints: { adult: true, p2p: true }
};

const TRACKERS = [
  "tracker:udp://open.demonii.com:1337/announce",
  "tracker:udp://tracker.openbittorrent.com:80",
  "tracker:udp://tracker.coppersurfer.tk:6969",
  "tracker:udp://tracker.opentrackr.org:1337/announce",
  "tracker:udp://tracker.leechers-paradise.org:6969",
  "tracker:http://nyaa.tracker.wf:7777/announce",
  "tracker:udp://exodus.desync.com:6969/announce",
  "tracker:udp://tracker.torrent.eu.org:451/announce"
];

// ── Helpers ───────────────────────────────────────────────────
function clean(name) {
  let t = name || "";
  t = t.replace(/\[.*?\]/g, " ");
  t = t.replace(/\(.*?\)/g, " ");
  t = t.replace(/\s*[|]\s*.*/g, "");
  t = t.replace(/S\d+E\d+.*/i, " ");
  t = t.replace(/\b(19|20)\d{2}\b.*/, "");
  t = t.replace(/\b(2160p|1080p|720p|480p|4K|UHD|HDR|BluRay|BRRip|WEBRip|WEB-DL|WEB|HDTS|HDCAM|CAMRip|HDTC|DVDSCR|HDTV|DVDRip|x264|x265|HEVC|AAC|DDP|DD5|AC3|ESub|EZTV|YIFY|YTS|Atmos|SDR|10bit|REMUX|REPACK|PROPER|EXTENDED|UNRATED|COMPLETE|SEASON|EPISODE|MULTI|BLURAY|LPCM)\b.*/gi, "");
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

// ── TMDB ──────────────────────────────────────────────────────
async function tmdbSearch(title, type) {
  try {
    const t = type === "series" ? "tv" : "movie";
    const r = await axios.get(
      `https://api.themoviedb.org/3/search/${t}?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}`,
      { timeout: 5000 }
    );
    const res = r.data?.results?.[0];
    if (!res) return null;
    let imdbId = null;
    try {
      const ext = await axios.get(
        `https://api.themoviedb.org/3/${t}/${res.id}/external_ids?api_key=${TMDB_KEY}`,
        { timeout: 5000 }
      );
      imdbId = ext.data?.imdb_id || null;
    } catch(e) {}
    return {
      imdbId,
      name: res.title || res.name || title,
      poster: res.poster_path ? `https://image.tmdb.org/t/p/w300${res.poster_path}` : null,
      bg: res.backdrop_path ? `https://image.tmdb.org/t/p/w780${res.backdrop_path}` : null,
      year: (res.release_date || res.first_air_date || "").slice(0, 4),
      description: res.overview || ""
    };
  } catch(e) { return null; }
}

async function tmdbFindByImdb(imdbId) {
  try {
    const r = await axios.get(
      `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`,
      { timeout: 5000 }
    );
    const found = r.data?.movie_results?.[0] || r.data?.tv_results?.[0];
    if (!found) return null;
    return {
      name: found.title || found.name || imdbId,
      poster: found.poster_path ? `https://image.tmdb.org/t/p/w300${found.poster_path}` : null,
      bg: found.backdrop_path ? `https://image.tmdb.org/t/p/w780${found.backdrop_path}` : null,
      year: (found.release_date || found.first_air_date || "").slice(0, 4),
      description: found.overview || ""
    };
  } catch(e) { return null; }
}

// ── apibay search ─────────────────────────────────────────────
async function tpbSearch(q, cat) {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
  const t1 = `https://apibay.org/q.php?q=${encodeURIComponent(q)}&cat=${cat}`;
  const t2 = `https://apibay.org/q.php?q=${encodeURIComponent(q)}&cat=0`;
  try {
    const [r1, r2] = await Promise.allSettled([
      axios.get(t1, { timeout: 10000, headers: { "User-Agent": UA } }),
      cat !== "0" ? axios.get(t2, { timeout: 10000, headers: { "User-Agent": UA } }) : Promise.resolve({ data: [] })
    ]);
    const arr1 = Array.isArray(r1.value?.data) ? r1.value.data : [];
    const arr2 = Array.isArray(r2.value?.data) ? r2.value.data : [];
    const seen = new Set();
    const merged = [];
    for (const t of [...arr1, ...arr2]) {
      if (!t.info_hash || t.id === "0" || seen.has(t.info_hash.toLowerCase())) continue;
      seen.add(t.info_hash.toLowerCase());
      merged.push(t);
    }
    if (merged.length > 0) {
      merged.sort((a, b) => parseInt(b.seeders) - parseInt(a.seeders));
      return merged;
    }
  } catch(e) {}
  const selfProxy = `https://test-repo-six-sepia.vercel.app/proxy?url=${encodeURIComponent(t1)}`;
  try {
    const r = await axios.get(selfProxy, { timeout: 12000, headers: { "User-Agent": UA } });
    let d = r.data;
    if (typeof d === "string") { try { d = JSON.parse(d); } catch(e) {} }
    if (Array.isArray(d) && d.length > 0 && d[0].id !== "0") return d;
  } catch(e) {}
  return [];
}

// ── Nyaa RSS ──────────────────────────────────────────────────
async function nyaaSearch(q) {
  try {
    const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(q || "anime")}&c=1_2&f=0`;
    const r = await axios.get(url, { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } });
    const items = [];
    for (const block of r.data.split("<item>").slice(1)) {
      const title   = block.match(/<title>(.*?)<\/title>/s)?.[1]?.trim() || "";
      const hash    = block.match(/<nyaa:infoHash>([a-fA-F0-9]{40})<\/nyaa:infoHash>/i)?.[1]?.toLowerCase() || "";
      const seeders = block.match(/<nyaa:seeders>(\d+)<\/nyaa:seeders>/)?.[1] || "0";
      const size    = block.match(/<nyaa:size>(.*?)<\/nyaa:size>/)?.[1] || "";
      if (title && hash && parseInt(seeders) > 0) items.push({ title, hash, seeders, size });
      if (items.length >= 20) break;
    }
    return items;
  } catch(e) { return []; }
}

// ── Nyaa Sukebei RSS (hentai anime) ──────────────────────────
async function nyaaSukebeSearch(q) {
  try {
    const url = `https://sukebei.nyaa.si/?page=rss&q=${encodeURIComponent(q || "hentai")}&c=2_2&f=0`;
    const r = await axios.get(url, { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } });
    const items = [];
    for (const block of r.data.split("<item>").slice(1)) {
      const title   = block.match(/<title>(.*?)<\/title>/s)?.[1]?.trim() || "";
      const hash    = block.match(/<nyaa:infoHash>([a-fA-F0-9]{40})<\/nyaa:infoHash>/i)?.[1]?.toLowerCase() || "";
      const seeders = block.match(/<nyaa:seeders>(\d+)<\/nyaa:seeders>/)?.[1] || "0";
      const size    = block.match(/<nyaa:size>(.*?)<\/nyaa:size>/)?.[1] || "";
      if (title && hash && parseInt(seeders) > 0) items.push({ title, hash, seeders, size });
      if (items.length >= 20) break;
    }
    return items;
  } catch(e) { return []; }
}

// ── Build streams from TPB results ───────────────────────────
function buildStreams(results, refHash) {
  const seen = new Set(refHash ? [refHash] : []);
  const packs = [], singles = [];
  const MAX_BYTES = 10 * 1024 * 1024 * 1024;
  const sorted = [...results].sort((a, b) => parseInt(b.seeders) - parseInt(a.seeders));
  for (const t of sorted) {
    if (!t.info_hash || parseInt(t.seeders) < 1) continue;
    const rawBytes = parseInt(t.size || 0);
    if (rawBytes > MAX_BYTES) continue;
    const h = t.info_hash.toLowerCase();
    if (seen.has(h)) continue;
    seen.add(h);
    const q = quality(t.name);
    const sz = sizeStr(t.size);
    const sd = t.seeders;
    const epMatch = t.name.match(/S(\d+)(?:E(\d+))?/i);
    const isSeasonPack = epMatch && !epMatch[2];
    const epNum = epMatch?.[2] ? parseInt(epMatch[2]) - 1 : 0;
    const shortFile = t.name.length > 60 ? t.name.slice(0, 57) + "..." : t.name;
    const stream = {
      name: `MultiStream\n${q}`,
      title: `${shortFile}\n👤 ${sd} 💾 ${sz}`,
      infoHash: h,
      fileIdx: epNum,
      sources: TRACKERS,
      behaviorHints: { notWebReady: false }
    };
    if (isSeasonPack) packs.push(stream);
    else singles.push(stream);
    if (packs.length + singles.length >= 8) break;
  }
  return [...singles, ...packs].slice(0, 8);
}

// ── Main handler ──────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const path = (req.url || "/").split("?")[0];

  // ── STREAM-PROXY — pipes any video URL with CORS + Range support for Video.js ──
  if (path === "/stream-proxy") {
    const rawUrl = req.url || "";
    const urlIdx = rawUrl.indexOf("?url=");
    const rawTarget = urlIdx >= 0 ? rawUrl.slice(urlIdx + 5) : "";
    let targetUrl = "";
    try { targetUrl = decodeURIComponent(rawTarget); } catch(e) { targetUrl = rawTarget; }

    if (!targetUrl.startsWith("https://") && !targetUrl.startsWith("http://")) {
      res.statusCode = 400; res.end(JSON.stringify({ error: "invalid url" })); return;
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type");

    if (req.method === "OPTIONS") { res.statusCode = 200; res.end(); return; }

    try {
      const https = require("https");
      const http  = require("http");

      const fetchAndPipe = (url, redirectCount = 0) => {
        if (redirectCount > 5) { res.statusCode = 502; res.end("too many redirects"); return; }
        const mod = url.startsWith("https") ? https : http;
        const upstreamHeaders = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "*/*",
        };
        if (req.headers["range"]) upstreamHeaders["Range"] = req.headers["range"];

        const u = new URL(url);
        const upReq = mod.request({
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: "GET",
          headers: upstreamHeaders,
          timeout: 30000,
        }, (upRes) => {
          if (upRes.statusCode >= 300 && upRes.statusCode < 400 && upRes.headers.location) {
            upRes.resume();
            const next = upRes.headers.location.startsWith("http")
              ? upRes.headers.location
              : `${u.protocol}//${u.host}${upRes.headers.location}`;
            return fetchAndPipe(next, redirectCount + 1);
          }
          const fwd = ["content-type","content-length","content-range","accept-ranges","last-modified","etag"];
          fwd.forEach(h => { if (upRes.headers[h]) res.setHeader(h, upRes.headers[h]); });
          res.statusCode = upRes.statusCode;
          upRes.pipe(res);
          upRes.on("error", () => { try { res.end(); } catch(e) {} });
        });

        upReq.on("error", (e) => { res.statusCode = 502; res.end("upstream error: " + e.message); });
        upReq.on("timeout", () => { upReq.destroy(); res.statusCode = 504; res.end("timeout"); });
        upReq.end();
      };

      fetchAndPipe(targetUrl);
    } catch(e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── SELF-PROXY ──
  if (path === "/proxy") {
    const rawUrl = req.url || "";
    const urlIdx = rawUrl.indexOf("?url=");
    const rawTarget = urlIdx >= 0 ? rawUrl.slice(urlIdx + 5) : "";
    let decoded = "";
    try { decoded = decodeURIComponent(rawTarget); } catch(e) { decoded = rawTarget; }
    if (!decoded.startsWith("https://apibay.org/") && !decoded.startsWith("https://nyaa.si/")) {
      decoded = rawTarget.startsWith("https") ? rawTarget : "";
    }
    if (!decoded.startsWith("https://apibay.org/") && !decoded.startsWith("https://nyaa.si/")) {
      res.statusCode = 403; res.end("[]"); return;
    }
    const UAS = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
    ];
    const ua = UAS[Math.floor(Math.random() * UAS.length)];
    try {
      const https = require("https");
      const fetchUrl = (url) => new Promise((resolve, reject) => {
        const u = new URL(url);
        const r = https.request({
          hostname: u.hostname, path: u.pathname + u.search, method: "GET",
          headers: {
            "User-Agent": ua,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Referer": "https://www.google.com/",
          },
          timeout: 12000
        }, (resp) => {
          if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
            return fetchUrl(resp.headers.location).then(resolve).catch(reject);
          }
          let b = ""; resp.on("data", c => b += c); resp.on("end", () => resolve(b));
        });
        r.on("error", reject);
        r.on("timeout", () => { r.destroy(); reject(new Error("timeout")); });
        r.end();
      });

      let data = "[]";
      if (decoded.includes("apibay.org/q.php")) {
        const u = new URL(decoded);
        const q = u.searchParams.get("q");
        const cat = u.searchParams.get("cat") || "0";
        const [r1, r2] = await Promise.allSettled([
          fetchUrl(decoded),
          cat !== "0" ? fetchUrl(`https://apibay.org/q.php?q=${encodeURIComponent(q)}&cat=0`) : Promise.resolve("[]")
        ]);
        let arr1 = [], arr2 = [];
        try { arr1 = JSON.parse(r1.status === "fulfilled" ? r1.value : "[]"); } catch(e) {}
        try { arr2 = JSON.parse(r2.status === "fulfilled" ? r2.value : "[]"); } catch(e) {}
        const seen = new Set();
        const merged = [];
        for (const t of [...arr1, ...arr2]) {
          if (!t.info_hash || t.id === "0" || seen.has(t.info_hash)) continue;
          seen.add(t.info_hash);
          merged.push(t);
        }
        merged.sort((a, b) => parseInt(b.seeders) - parseInt(a.seeders));
        data = JSON.stringify(merged);
      } else {
        data = await fetchUrl(decoded);
      }

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(data);
    } catch(e) { res.statusCode = 500; res.end("[]"); }
    return;
  }

  // MANIFEST
  if (path === "/" || path === "/manifest.json") return respond(res, manifest);

  // CATALOG
  const cm = path.match(/^\/catalog\/([^/]+)\/([^/]+?)(?:\/([^/]+?))?\.json$/);
  if (cm) {
    const [, type, id, extraStr] = cm;
    const extra = parseExtra(extraStr);
    const search = extra.search || "";
    try {
      // Hentai via Sukebei Nyaa
      if (id === "ms_hentai") {
        const items = await nyaaSukebeSearch(search || "hentai 1080p");
        const seen = new Set();
        const metas = [];
        for (const item of items) {
          const name = clean(item.title.replace(/^\[.*?\]\s*/, ""));
          if (!name || seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          const encodedName = encodeURIComponent(name).replace(/%/g, "_");
          metas.push({
            id: `ms_${item.hash}_${encodedName}`,
            type: "series", name,
            poster: `https://via.placeholder.com/300x450/1a0a0a/f97316?text=${encodeURIComponent(name.slice(0,15))}`,
            description: `🔞 ${quality(item.title)} | 🌱 ${item.seeders} seeds | ${item.size}`,
            genres: ["Hentai", "Adult", "Anime"]
          });
        }
        return respond(res, { metas });
      }

      // Uncensored/Adult via TPB cat 500 (Adult Movies)
      if (id === "ms_xxx") {
        const q = search || "xxx 1080p";
        const results = await tpbSearch(q, "500");
        const seen = new Set();
        const metas = [];
        for (const t of results) {
          if (!t.info_hash || parseInt(t.seeders) < 1) continue;
          const name = clean(t.name);
          if (!name || seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          const encodedName = encodeURIComponent(name).replace(/%/g, "_");
          metas.push({
            id: `ms_${t.info_hash.toLowerCase()}_${encodedName}`,
            type: "movie", name,
            poster: `https://via.placeholder.com/300x450/1a0a0a/f97316?text=${encodeURIComponent(name.slice(0,15))}`,
            description: `🔞 ${quality(t.name)} | 🌱 ${t.seeders} seeds | 💾 ${sizeStr(t.size)}`,
            genres: ["Adult"]
          });
          if (metas.length >= 20) break;
        }
        return respond(res, { metas });
      }

      if (id === "ms_anime") {
        const items = await nyaaSearch(search || "anime 1080p");
        const seen = new Set();
        const metas = [];
        for (const item of items) {
          const name = clean(item.title.replace(/^\[.*?\]\s*/, ""));
          if (!name || seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          const encodedName = encodeURIComponent(name).replace(/%/g, "_");
          metas.push({
            id: `ms_${item.hash}_${encodedName}`,
            type: "series", name,
            poster: `https://via.placeholder.com/300x450/0f0f1a/e879f9?text=${encodeURIComponent(name.slice(0,15))}`,
            description: `🎌 ${quality(item.title)} | 🌱 ${item.seeders} seeds | ${item.size}`,
            genres: ["Anime"]
          });
        }
        return respond(res, { metas });
      }

      const catMap   = { ms_hollywood: "207", ms_bollywood: "200", ms_tvshows: "205", ms_xxx: "500", ms_hentai: "302" };
      const queryMap = { ms_hollywood: "movie", ms_bollywood: "hindi", ms_tvshows: "tv show", ms_xxx: "xxx", ms_hentai: "hentai" };
      const q   = search || queryMap[id] || "movie";
      const cat = catMap[id] || "0";
      const results = await tpbSearch(q, cat);
      const seen = new Set();
      const metas = [];
      for (const t of results) {
        if (!t.info_hash || parseInt(t.seeders) < 1) continue;
        const name = clean(t.name);
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        let metaId = `ms_${t.info_hash.toLowerCase()}_${encodeURIComponent(name).replace(/%/g,"_")}`;
        let poster = `https://via.placeholder.com/300x450/0f0f1a/818cf8?text=${encodeURIComponent(name.slice(0,15))}`;
        let desc = `${quality(t.name)} | 🌱 ${t.seeders} seeds | 💾 ${sizeStr(t.size)}`;
        let yr = (t.name.match(/\b(19|20)\d{2}\b/) || [])[0] || "";
        metas.push({ id: metaId, type, name, poster, description: desc, year: yr, genres: [] });
        if (metas.length >= 20) break;
      }
      return respond(res, { metas });
    } catch(e) {
      return respond(res, { metas: [] });
    }
  }

  // META
  const mm = path.match(/^\/meta\/([^/]+)\/([^/]+?)\.json$/);
  if (mm) {
    const [, type, id] = mm;
    // ms_ ids: never touch TMDB, serve local meta only
    if (id.startsWith("ms_")) {
      const parts = id.replace("ms_", "").split("_");
      const name = parts.length > 1
        ? decodeURIComponent(parts.slice(1).join("_").replace(/_/g, "%"))
        : parts[0].slice(0, 12);
      return respond(res, { meta: {
        id, type, name,
        poster: `https://via.placeholder.com/300x450/0f0f1a/818cf8?text=${encodeURIComponent(name.slice(0,15))}`,
        description: name, genres: []
      }});
    }
    // tt ids: TMDB lookup
    if (id.startsWith("tt")) {
      const info = await tmdbFindByImdb(id);
      if (info) {
        return respond(res, { meta: {
          id, type, name: info.name,
          poster: info.poster || `https://via.placeholder.com/300x450/0f0f1a/818cf8?text=${encodeURIComponent(info.name.slice(0,15))}`,
          background: info.bg || info.poster,
          description: info.description, year: info.year, genres: []
        }});
      }
    }
    return respond(res, { meta: { id, type, name: id, genres: [] } });
  }

  // STREAM
  const sm = path.match(/^\/stream\/([^/]+)\/([^/]+?)\.json$/);
  if (sm) {
    const [, type, rawId] = sm;
    const decoded = decodeURIComponent(rawId);
    const ttMatch = decoded.match(/^(tt\d+)(?::(\d+):(\d+))?$/);
    const isMsId  = decoded.startsWith("ms_");

    let titleQuery = "";
    let season = null, episode = null;
    let refHash = "";

    if (ttMatch) {
      const imdbId = ttMatch[1];
      season  = ttMatch[2] ? parseInt(ttMatch[2]) : null;
      episode = ttMatch[3] ? parseInt(ttMatch[3]) : null;
      try {
        const info = await tmdbFindByImdb(imdbId);
        titleQuery = info?.name || "";
      } catch(e) {}
    } else if (isMsId) {
      const parts = decoded.replace("ms_", "").split("_");
      refHash = parts[0];
      titleQuery = parts.length > 1
        ? decodeURIComponent(parts.slice(1).join("_").replace(/_/g, "%"))
        : "";
    }

    // For adult content: serve the stream directly from the hash, no re-search needed
    const isAdult = decoded.startsWith("ms_") && (() => {
      // We can't know the catalog here, but if refHash is set and titleQuery looks adult, skip TMDB
      return true; // ms_ ids never go through TMDB anyway in stream handler
    })();

    if (!titleQuery || refHash) {
      // ms_ id: just serve the stored hash directly — no re-search
      if (refHash) {
        return respond(res, { streams: [{
          name: "MultiStream", title: titleQuery || "⚡ Play",
          infoHash: refHash,
          fileIdx: 0,
          sources: TRACKERS, behaviorHints: { notWebReady: false }
        }]});
      }
      return respond(res, { streams: [{
        name: "MultiStream", title: "⚡ Play",
        infoHash: decoded.replace("ms_","").split("_")[0],
        sources: TRACKERS, behaviorHints: { notWebReady: false }
      }]});
    }

    // IMDB id path — search TPB for matching torrents
    const cat = type === "movie" ? "207" : "205";
    let results = [];

    if (season !== null && episode !== null) {
      const epQ     = `${titleQuery} S${String(season).padStart(2,"0")}E${String(episode).padStart(2,"0")}`;
      const seasonQ = `${titleQuery} S${String(season).padStart(2,"0")}`;
      const [r1, r2] = await Promise.allSettled([
        tpbSearch(epQ, cat),
        tpbSearch(seasonQ, cat),
      ]);
      const seen = new Set();
      const merged = [];
      for (const r of [r1, r2]) {
        if (r.status !== "fulfilled") continue;
        for (const t of r.value) {
          if (!t.info_hash || seen.has(t.info_hash.toLowerCase())) continue;
          const titleWords = titleQuery.toLowerCase().split(" ").filter(w => w.length > 2);
          const tname = t.name.toLowerCase();
          const matchCount = titleWords.filter(w => tname.includes(w)).length;
          if (matchCount < Math.ceil(titleWords.length * 0.6)) continue;
          seen.add(t.info_hash.toLowerCase());
          merged.push(t);
        }
      }
      results = merged;
    } else {
      results = await tpbSearch(titleQuery, cat).catch(() => []);
    }
    const streams = buildStreams(results, refHash);

    if (!streams.length) {
      return respond(res, { streams: [{
        name: "MultiStream", title: `${titleQuery}\n⚡ Play`,
        infoHash: refHash || "0000000000000000000000000000000000000000",
        sources: TRACKERS, behaviorHints: { notWebReady: false }
      }]});
    }
    return respond(res, { streams });
  }


  // ── EPORNER SEARCH ──────────────────────────────────────────────
  // GET /eporner?q=QUERY&n=20
  // Fetches Eporner official API server-side and returns clean JSON.
  // Used by cinevault.html to show adult search results.
  if (path === "/eporner") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Content-Type", "application/json");
    const qs = new URL(req.url, "http://localhost").searchParams;
    const q = qs.get("q") || "";
    const n = Math.min(parseInt(qs.get("n") || "20"), 50);
    if (!q) { res.end(JSON.stringify({ videos: [] })); return; }
    try {
      const epUrl =
        "https://www.eporner.com/api/v2/video/search/" +
        "?query=" + encodeURIComponent(q) +
        "&per_page=" + n +
        "&thumbsize=big&format=json&lp=en&order=top-rated";
      const r = await axios.get(epUrl, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "*/*" },
        timeout: 12000,
      });
      const videos = (r.data?.videos || []).map((v) => ({
        id:       v.id,
        title:    v.title || v.id,
        embed:    v.embed,
        thumb:    v.thumbs?.[2]?.src || v.thumbs?.[0]?.src || v.default_thumb?.src || null,
        duration: v.length_min ? v.length_min + " min" : null,
        views:    v.views  || 0,
        rating:   v.rate   || null,
        added:    v.added  || null,
      }));
      res.end(JSON.stringify({ videos }));
    } catch (e) {
      res.statusCode = 502;
      res.end(JSON.stringify({ videos: [], error: String(e.message) }));
    }
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
};
