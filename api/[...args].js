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
      `https://api.themoviedb.org/3/search/\${t}?api_key=\${TMDB_KEY}&query=\${encodeURIComponent(title)}`,
      { timeout: 5000 }
    );
    const res = r.data?.results?.[0];
    if (!res) return null;
    let imdbId = null;
    try {
      const ext = await axios.get(
        `https://api.themoviedb.org/3/\${t}/\${res.id}/external_ids?api_key=\${TMDB_KEY}`,
        { timeout: 5000 }
      );
      imdbId = ext.data?.imdb_id || null;
    } catch(e) {}
    return {
      imdbId,
      name: res.title || res.name || title,
      poster: res.poster_path ? `https://image.tmdb.org/t/p/w300\${res.poster_path}` : null,
      bg: res.backdrop_path ? `https://image.tmdb.org/t/p/w780\${res.backdrop_path}` : null,
      year: (res.release_date || res.first_air_date || "").slice(0, 4),
      description: res.overview || ""
    };
  } catch(e) { return null; }
}

async function tmdbFindByImdb(imdbId) {
  try {
    const r = await axios.get(
      `https://api.themoviedb.org/3/find/\${imdbId}?api_key=\${TMDB_KEY}&external_source=imdb_id`,
      { timeout: 5000 }
    );
    const found = r.data?.movie_results?.[0] || r.data?.tv_results?.[0];
    if (!found) return null;
    return {
      name: found.title || found.name || imdbId,
      poster: found.poster_path ? `https://image.tmdb.org/t/p/w300\${found.poster_path}` : null,
      bg: found.backdrop_path ? `https://image.tmdb.org/t/p/w780\${found.backdrop_path}` : null,
      year: (found.release_date || found.first_air_date || "").slice(0, 4),
      description: found.overview || ""
    };
  } catch(e) { return null; }
}

// ── apibay search ─────────────────────────────────────────────
async function tpbSearch(q, cat) {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
  const t1 = `https://apibay.org/q.php?q=\${encodeURIComponent(q)}&cat=\${cat}`;
  const t2 = `https://apibay.org/q.php?q=\${encodeURIComponent(q)}&cat=0`;
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
  const selfProxy = `https://test-repo-six-sepia.vercel.app/proxy?url=\${encodeURIComponent(t1)}`;
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
    const url = `https://nyaa.si/?page=rss&q=\${encodeURIComponent(q || "anime")}&c=1_2&f=0`;
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

// ── Nyaa Sukebei RSS ──────────────────────────────────────────
async function nyaaSukebeSearch(q) {
  try {
    const url = `https://sukebei.nyaa.si/?page=rss&q=\${encodeURIComponent(q || "hentai")}&c=2_2&f=0`;
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

// ── Build streams ─────────────────────────────────────────────
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
      name: `MultiStream\n\${q}`,
      title: `\${shortFile}\n👤 \${sd} 💾 \${sz}`,
      infoHash: h, fileIdx: epNum, sources: TRACKERS,
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

  // ── /stream-proxy ─────────────────────────────────────────────
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
        const upstreamHeaders = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "*/*" };
        if (req.headers["range"]) upstreamHeaders["Range"] = req.headers["range"];
        const u = new URL(url);
        const upReq = mod.request({
          hostname: u.hostname, path: u.pathname + u.search, method: "GET",
          headers: upstreamHeaders, timeout: 30000,
        }, (upRes) => {
          if (upRes.statusCode >= 300 && upRes.statusCode < 400 && upRes.headers.location) {
            upRes.resume();
            const next = upRes.headers.location.startsWith("http")
              ? upRes.headers.location
              : `\${u.protocol}//\${u.host}\${upRes.headers.location}`;
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
    } catch(e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // ── /proxy ────────────────────────────────────────────────────
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
          headers: { "User-Agent": ua, "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9", "Cache-Control": "no-cache",
            "Referer": "https://www.google.com/" },
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
          cat !== "0" ? fetchUrl(`https://apibay.org/q.php?q=\${encodeURIComponent(q)}&cat=0`) : Promise.resolve("[]")
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

  // ── Manifest ──────────────────────────────────────────────────
  if (path === "/" || path === "/manifest.json") return respond(res, manifest);

  // ── Catalog ───────────────────────────────────────────────────
  const cm = path.match(/^\/catalog\/([^/]+)\/([^/]+?)(?:\/([^/]+?))?\.json$/);
  if (cm) {
    const [, type, id, extraStr] = cm;
    const extra = parseExtra(extraStr);
    const search = extra.search || "";
    try {
      if (id === "ms_hentai") {
        const items = await nyaaSukebeSearch(search || "hentai 1080p");
        const seen = new Set(); const metas = [];
        for (const item of items) {
          const name = clean(item.title.replace(/^\[.*?\]\s*/, ""));
          if (!name || seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          const enc = encodeURIComponent(name).replace(/%/g, "_");
          metas.push({ id: `ms_\${item.hash}_\${enc}`, type: "series", name,
            poster: `https://via.placeholder.com/300x450/1a0a0a/f97316?text=\${encodeURIComponent(name.slice(0,15))}`,
            description: `🔞 \${quality(item.title)} | 🌱 \${item.seeders} seeds | \${item.size}`,
            genres: ["Hentai","Adult","Anime"] });
        }
        return respond(res, { metas });
      }
      if (id === "ms_xxx") {
        const q = search || "xxx 1080p";
        const results = await tpbSearch(q, "500");
        const seen = new Set(); const metas = [];
        for (const t of results) {
          if (!t.info_hash || parseInt(t.seeders) < 1) continue;
          const name = clean(t.name);
          if (!name || seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          const enc = encodeURIComponent(name).replace(/%/g, "_");
          metas.push({ id: `ms_\${t.info_hash.toLowerCase()}_\${enc}`, type: "movie", name,
            poster: `https://via.placeholder.com/300x450/1a0a0a/f97316?text=\${encodeURIComponent(name.slice(0,15))}`,
            description: `🔞 \${quality(t.name)} | 🌱 \${t.seeders} seeds | 💾 \${sizeStr(t.size)}`,
            genres: ["Adult"] });
          if (metas.length >= 20) break;
        }
        return respond(res, { metas });
      }
      if (id === "ms_anime") {
        const items = await nyaaSearch(search || "anime 1080p");
        const seen = new Set(); const metas = [];
        for (const item of items) {
          const name = clean(item.title.replace(/^\[.*?\]\s*/, ""));
          if (!name || seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          const enc = encodeURIComponent(name).replace(/%/g, "_");
          metas.push({ id: `ms_\${item.hash}_\${enc}`, type: "series", name,
            poster: `https://via.placeholder.com/300x450/0f0f1a/e879f9?text=\${encodeURIComponent(name.slice(0,15))}`,
            description: `🎌 \${quality(item.title)} | 🌱 \${item.seeders} seeds | \${item.size}`,
            genres: ["Anime"] });
        }
        return respond(res, { metas });
      }
      const catMap   = { ms_hollywood: "207", ms_bollywood: "200", ms_tvshows: "205", ms_xxx: "500", ms_hentai: "302" };
      const queryMap = { ms_hollywood: "movie", ms_bollywood: "hindi", ms_tvshows: "tv show", ms_xxx: "xxx", ms_hentai: "hentai" };
      const q   = search || queryMap[id] || "movie";
      const cat = catMap[id] || "0";
      const results = await tpbSearch(q, cat);
      const seen = new Set(); const metas = [];
      for (const t of results) {
        if (!t.info_hash || parseInt(t.seeders) < 1) continue;
        const name = clean(t.name);
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        metas.push({
          id: `ms_\${t.info_hash.toLowerCase()}_\${encodeURIComponent(name).replace(/%/g,"_")}`,
          type, name,
          poster: `https://via.placeholder.com/300x450/0f0f1a/818cf8?text=\${encodeURIComponent(name.slice(0,15))}`,
          description: `\${quality(t.name)} | 🌱 \${t.seeders} seeds | 💾 \${sizeStr(t.size)}`,
          year: (t.name.match(/\b(19|20)\d{2}\b/) || [])[0] || "", genres: []
        });
        if (metas.length >= 20) break;
      }
      return respond(res, { metas });
    } catch(e) { return respond(res, { metas: [] }); }
  }

  // ── Meta ──────────────────────────────────────────────────────
  const mm = path.match(/^\/meta\/([^/]+)\/([^/]+?)\.json$/);
  if (mm) {
    const [, type, id] = mm;
    if (id.startsWith("ms_")) {
      const parts = id.replace("ms_", "").split("_");
      const name = parts.length > 1
        ? decodeURIComponent(parts.slice(1).join("_").replace(/_/g, "%"))
        : parts[0].slice(0, 12);
      return respond(res, { meta: { id, type, name,
        poster: `https://via.placeholder.com/300x450/0f0f1a/818cf8?text=\${encodeURIComponent(name.slice(0,15))}`,
        description: name, genres: [] }});
    }
    if (id.startsWith("tt")) {
      const info = await tmdbFindByImdb(id);
      if (info) {
        return respond(res, { meta: { id, type, name: info.name,
          poster: info.poster || `https://via.placeholder.com/300x450/0f0f1a/818cf8?text=\${encodeURIComponent(info.name.slice(0,15))}`,
          background: info.bg || info.poster, description: info.description, year: info.year, genres: [] }});
      }
    }
    return respond(res, { meta: { id, type, name: id, genres: [] } });
  }

  // ── Stream ────────────────────────────────────────────────────
  const sm = path.match(/^\/stream\/([^/]+)\/([^/]+?)\.json$/);
  if (sm) {
    const [, type, rawId] = sm;
    const decoded = decodeURIComponent(rawId);
    const ttMatch = decoded.match(/^(tt\d+)(?::(\d+):(\d+))?$/);
    const isMsId  = decoded.startsWith("ms_");
    let titleQuery = "", season = null, episode = null, refHash = "";
    if (ttMatch) {
      const imdbId = ttMatch[1];
      season  = ttMatch[2] ? parseInt(ttMatch[2]) : null;
      episode = ttMatch[3] ? parseInt(ttMatch[3]) : null;
      try { const info = await tmdbFindByImdb(imdbId); titleQuery = info?.name || ""; } catch(e) {}
    } else if (isMsId) {
      const parts = decoded.replace("ms_", "").split("_");
      refHash = parts[0];
      titleQuery = parts.length > 1 ? decodeURIComponent(parts.slice(1).join("_").replace(/_/g, "%")) : "";
    }
    if (!titleQuery || refHash) {
      if (refHash) {
        return respond(res, { streams: [{ name: "MultiStream", title: titleQuery || "⚡ Play",
          infoHash: refHash, fileIdx: 0, sources: TRACKERS, behaviorHints: { notWebReady: false } }]});
      }
      return respond(res, { streams: [{ name: "MultiStream", title: "⚡ Play",
        infoHash: decoded.replace("ms_","").split("_")[0], sources: TRACKERS, behaviorHints: { notWebReady: false } }]});
    }
    const cat = type === "movie" ? "207" : "205";
    let results = [];
    if (season !== null && episode !== null) {
      const epQ     = `\${titleQuery} S\${String(season).padStart(2,"0")}E\${String(episode).padStart(2,"0")}`;
      const seasonQ = `\${titleQuery} S\${String(season).padStart(2,"0")}`;
      const [r1, r2] = await Promise.allSettled([tpbSearch(epQ, cat), tpbSearch(seasonQ, cat)]);
      const seen = new Set(); const merged = [];
      for (const r of [r1, r2]) {
        if (r.status !== "fulfilled") continue;
        for (const t of r.value) {
          if (!t.info_hash || seen.has(t.info_hash.toLowerCase())) continue;
          const titleWords = titleQuery.toLowerCase().split(" ").filter(w => w.length > 2);
          const matchCount = titleWords.filter(w => t.name.toLowerCase().includes(w)).length;
          if (matchCount < Math.ceil(titleWords.length * 0.6)) continue;
          seen.add(t.info_hash.toLowerCase()); merged.push(t);
        }
      }
      results = merged;
    } else {
      results = await tpbSearch(titleQuery, cat).catch(() => []);
    }
    const streams = buildStreams(results, refHash);
    if (!streams.length) {
      return respond(res, { streams: [{ name: "MultiStream", title: `\${titleQuery}\n⚡ Play`,
        infoHash: refHash || "0000000000000000000000000000000000000000",
        sources: TRACKERS, behaviorHints: { notWebReady: false } }]});
    }
    return respond(res, { streams });
  }

  // ── /eporner ──────────────────────────────────────────────────
  if (path === "/eporner") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    const qs = new URL(req.url, "http://localhost").searchParams;
    const q = qs.get("q") || "";
    const n = Math.min(parseInt(qs.get("n") || "20"), 50);
    if (!q) { res.end(JSON.stringify({ videos: [] })); return; }
    try {
      const epUrl = "https://www.eporner.com/api/v2/video/search/?query=" + encodeURIComponent(q) +
        "&per_page=" + n + "&thumbsize=big&format=json&lp=en&order=top-rated";
      const r = await axios.get(epUrl, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "*/*" }, timeout: 12000 });
      const videos = (r.data?.videos || []).map((v) => {
        const sources = v.videoSources || {};
        let mp4 = null;
        for (const q of ["1080p","720p","480p","360p","240p"]) { if (sources[q]) { mp4 = sources[q]; break; } }
        if (!mp4) mp4 = Object.values(sources)[0] || null;
        return { id: v.id, title: v.title || v.id, embed: v.embed, mp4,
          thumb: v.thumbs?.[2]?.src || v.thumbs?.[0]?.src || v.default_thumb?.src || null,
          duration: v.length_min ? v.length_min + " min" : null,
          views: v.views || 0, rating: v.rate || null, added: v.added || null };
      });
      res.end(JSON.stringify({ videos }));
    } catch(e) { res.statusCode = 502; res.end(JSON.stringify({ videos: [], error: String(e.message) })); }
    return;
  }

  // ── /embed-proxy ──────────────────────────────────────────────
  // Proxies embed pages for all supported providers.
  // Injects: ad-killing CSS + JS blocker so ads/popups are stripped server-side.
  if (path === "/embed-proxy") {
    const qs = new URL(req.url, "http://localhost").searchParams;
    const target = qs.get("url") || "";
    const EMBED_WHITELIST = [
      "https://www.2embed.cc/",
      "https://www.2embed.stream/",
      "https://vidsrc.icu/",
      "https://vidsrc.me/",
      "https://vidsrc.rip/",
      "https://vidlink.pro/",
      "https://www.nontongo.win/",
      "https://multiembed.mov/",
    ];
    if (!EMBED_WHITELIST.some(w => target.startsWith(w))) {
      res.statusCode = 403; res.end("forbidden"); return;
    }
    let targetOrigin = "https://www.2embed.cc/";
    try { targetOrigin = new URL(target).origin + "/"; } catch(e) {}
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "");
    try {
      const r = await axios.get(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          "Referer": targetOrigin,
          "Accept": "text/html,*/*",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 15000, maxRedirects: 5,
      });
      let html = r.data || "";

      // Ad-kill CSS: nukes known ad/overlay/popup patterns
      const adCSS = `<style>
        [class*="popup"],[class*="Popup"],[id*="popup"],[id*="Popup"],
        [class*="overlay-ad"],[class*="ad-overlay"],[class*="advert"],
        [class*="banner-ad"],[id*="advert"],[class*="ad-"],[id*="ad-"],
        [class*="-ad"],[class*="vast"],[id*="vast"],
        [class*="preroll"],[id*="preroll"],
        iframe[src*="ads"],iframe[src*="doubleclick"],
        iframe[src*="googlesyndication"],iframe[src*="exoclick"],
        div[style*="z-index: 9999"],div[style*="z-index:9999"],
        a[href*="exe.io"],a[href*="adf.ly"],a[href*="ouo.io"],
        .adsbygoogle,.ad-label,.ad-container,.ad-slot,.ad-unit,
        #carbonads,[id^="google_ads"],
        [class*="share"],[id*="share"],[class*="Share"],[id*="Share"],
        [class*="social"],[data-sharing],.sharing-overlay,.share-box,
        [class*="countdown"],[id*="countdown"],
        [class*="skip-ad"],[id*="skip-ad"] {
          display:none!important;visibility:hidden!important;
          pointer-events:none!important;opacity:0!important;
        }
      </style>`;

      // Ad-kill JS: blocks window.open, alert, redirects, and dynamic ad injection
      const adJS = `<script>
        window.open = () => null;
        window.alert = () => null;
        window.confirm = () => true;
        const __sto = window.setTimeout;
        window.setTimeout = (fn, d, ...a) => {
          if (typeof fn === "string" &&
              (fn.includes("location") || fn.includes("window.open"))) return 0;
          return __sto(fn, d, ...a);
        };
        const __obs = new MutationObserver(muts => {
          muts.forEach(m => m.addedNodes.forEach(n => {
            if (!n.tagName) return;
            const src = (n.src || n.href || "").toLowerCase();
            const cls = (n.className || "").toLowerCase();
            const nid = (n.id || "").toLowerCase();
            if (n.tagName === "IFRAME" &&
                /ads|doubleclick|googlesyndication|exoclick|trafficjunky|adsterra/.test(src))
              n.remove();
            if (cls.includes("popup") || nid.includes("popup") ||
                cls.includes("advert") || nid.includes("advert"))
              n.remove();
          }));
        });
        document.addEventListener("DOMContentLoaded", () => {
          __obs.observe(document.body, { childList: true, subtree: true });
        });
      <\/script>`;

      const inject = `<base href="${targetOrigin}">` + adCSS + adJS;
      if (html.includes("<head>"))       html = html.replace("<head>",  "<head>"  + inject);
      else if (html.includes("<html>"))  html = html.replace("<html>",  "<html>"  + inject);
      else                               html = inject + html;

      res.end(html);
    } catch(e) {
      res.statusCode = 502;
      res.end("<html><body>proxy error: " + e.message + "</body></html>");
    }
    return;
  }

  // ── /seapi ────────────────────────────────────────────────────
  if (path === "/seapi") {
    const qs = new URL(req.url, "http://localhost").searchParams;
    const tmdbId = qs.get("tmdb") || "", imdbId = qs.get("imdb") || "";
    const season = qs.get("s") || "", episode = qs.get("e") || "";
    if (!tmdbId && !imdbId) { res.statusCode = 400; res.end(JSON.stringify({error:"id required"})); return; }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    try {
      const base = tmdbId ? `https://seapi.link/?type=tmdb&id=\${tmdbId}` : `https://seapi.link/?type=imdb&id=\${imdbId}`;
      const apiUrl = season ? base + `&season=\${season}&episode=\${episode}&max_results=3` : base + "&max_results=3";
      const r = await axios.get(apiUrl, {
        headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://multiembed.mov/", "Origin": "https://multiembed.mov" },
        timeout: 15000,
      });
      res.end(JSON.stringify(r.data));
    } catch(e) { res.statusCode = 502; res.end(JSON.stringify({error: e.message})); }
    return;
  }

  // ── /vidsrc — extract real m3u8 from vidsrc.net ───────────────
  // GET /vidsrc?tmdb=ID&type=movie
  // GET /vidsrc?tmdb=ID&type=tv&s=1&e=1
  // Returns: { streams: [{ url, quality, provider, referer }] }
  if (path === "/vidsrc") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    const qs = new URL(req.url, "http://localhost").searchParams;
    const tmdbId = qs.get("tmdb") || "";
    const type   = qs.get("type") || "movie";
    const season  = qs.get("s") || "";
    const episode = qs.get("e") || "";
    if (!tmdbId) { res.statusCode = 400; res.end(JSON.stringify({ error: "tmdb required" })); return; }

    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

    function rc4Decrypt(key, data) {
      const keyBytes = Buffer.from(key, "utf8");
      const dataBytes = Buffer.from(data, "base64");
      const S = Array.from({ length: 256 }, (_, i) => i);
      let j = 0;
      for (let i = 0; i < 256; i++) {
        j = (j + S[i] + keyBytes[i % keyBytes.length]) & 0xff;
        [S[i], S[j]] = [S[j], S[i]];
      }
      let i = 0; j = 0;
      const out = [];
      for (const byte of dataBytes) {
        i = (i + 1) & 0xff;
        j = (j + S[i]) & 0xff;
        [S[i], S[j]] = [S[j], S[i]];
        out.push(byte ^ S[(S[i] + S[j]) & 0xff]);
      }
      return Buffer.from(out).toString("utf8");
    }

    try {
      let embedUrl;
      if (type === "tv") {
        if (!season || !episode) { res.statusCode = 400; res.end(JSON.stringify({ error: "s and e required for tv" })); return; }
        embedUrl = `https://vidsrc.net/embed/tv?tmdb=\${tmdbId}&season=\${season}&episode=\${episode}`;
      } else {
        embedUrl = `https://vidsrc.net/embed/movie?tmdb=\${tmdbId}`;
      }

      const embedRes = await axios.get(embedUrl, {
        headers: { "User-Agent": UA, "Referer": "https://vidsrc.net/" },
        timeout: 8000, maxRedirects: 5,
      });
      const embedHtml = typeof embedRes.data === "string" ? embedRes.data : JSON.stringify(embedRes.data);

      const baseDomMatch = embedHtml.match(/https?:\/\/([^/]+)\/embed\//);
      const BASEDOM = baseDomMatch ? `https://\${baseDomMatch[1]}` : "https://vidsrc.net";

      const serverRegex = /data-hash="([^"]+)"[^>]*(?:data-id="([^"]+)")?[^>]*>([^<]*)</g;
      const servers = [];
      let match;
      while ((match = serverRegex.exec(embedHtml)) !== null) {
        if (match[1] && match[1].length > 5)
          servers.push({ dataHash: match[1], serverId: match[2] || "", name: match[3].trim() });
      }
      const altRegex = /class="server[^"]*"[^>]*data-hash="([^"]+)"/g;
      while ((match = altRegex.exec(embedHtml)) !== null) {
        if (match[1] && !servers.find(s => s.dataHash === match[1]))
          servers.push({ dataHash: match[1], serverId: "", name: "Server" });
      }

      if (servers.length === 0) {
        const m3u8Match = embedHtml.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
        if (m3u8Match) {
          res.end(JSON.stringify({ streams: [{ url: m3u8Match[0], quality: "auto", provider: "vidsrc.net", referer: BASEDOM }] }));
          return;
        }
        res.end(JSON.stringify({ streams: [], error: "no servers found", debug: embedUrl }));
        return;
      }

      const streams = [];
      const rcpResults = await Promise.allSettled(
        servers.slice(0, 3).map(async (srv) => {
          try {
            const rcpUrl = `\${BASEDOM}/rcp/\${srv.dataHash}`;
            const rcpRes = await axios.get(rcpUrl, {
              headers: { "User-Agent": UA, "Referer": embedUrl, "X-Requested-With": "XMLHttpRequest" },
              timeout: 6000,
            });
            const rcpHtml = typeof rcpRes.data === "string" ? rcpRes.data : JSON.stringify(rcpRes.data);
            const srcMatch = rcpHtml.match(/src:\s*['"]([^'"]+)['"]/);
            if (!srcMatch) return null;
            const rcpSrc = srcMatch[1];
            if (/\.m3u8/i.test(rcpSrc)) {
              const url = rcpSrc.startsWith("//") ? "https:" + rcpSrc : rcpSrc;
              return { url, quality: "auto", provider: srv.name || "vidsrc", referer: BASEDOM };
            }
            const proUrl = rcpSrc.startsWith("//") ? "https:" + rcpSrc : rcpSrc;
            const proRes = await axios.get(proUrl, { headers: { "User-Agent": UA, "Referer": BASEDOM + "/" }, timeout: 6000 });
            const proHtml = typeof proRes.data === "string" ? proRes.data : JSON.stringify(proRes.data);
            const scriptMatches = [...proHtml.matchAll(/src="([^"]+\.js[^"]*)"/g)];
            const jsFile = scriptMatches.map(m => m[1]).find(s => !s.includes("cpt.js"));
            if (!jsFile) return null;
            const jsUrl = jsFile.startsWith("http") ? jsFile : (new URL(jsFile, proUrl)).href;
            const jsRes = await axios.get(jsUrl, { headers: { "User-Agent": UA, "Referer": proUrl }, timeout: 5000 });
            const jsContent = typeof jsRes.data === "string" ? jsRes.data : JSON.stringify(jsRes.data);
            const keyMatch = jsContent.match(/['"]([a-zA-Z0-9]{8,32})['"]/);
            if (!keyMatch) return null;
            const encMatch = proHtml.match(/data:\s*['"]([A-Za-z0-9+/=]+)['"]/);
            if (!encMatch) return null;
            const decrypted = rc4Decrypt(keyMatch[1], encMatch[1]);
            if (!decrypted.includes(".m3u8") && !decrypted.includes(".mp4")) return null;
            const finalUrl = decrypted.startsWith("//") ? "https:" + decrypted : decrypted;
            return { url: finalUrl, quality: "auto", provider: srv.name || "vidsrc", referer: BASEDOM };
          } catch(e) { return null; }
        })
      );

      for (const r of rcpResults) {
        if (r.status === "fulfilled" && r.value) streams.push(r.value);
      }
      res.end(JSON.stringify({ streams, embedUrl, serversFound: servers.length }));
    } catch(e) {
      res.statusCode = 502;
      res.end(JSON.stringify({ streams: [], error: e.message }));
    }
    return;
  }

  // ── /direct-stream — exact vidsrc.ts port ────────────────────
  // GET /direct-stream?tmdb=ID&type=movie|tv&s=1&e=1
  // Ports https://github.com/cool-dev-guy/vidsrc.ts exactly
  // Returns: [{ name, image, mediaId, stream, referer }]
  if (path === "/direct-stream") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    const qs      = new URL(req.url, "http://localhost").searchParams;
    const tmdbId  = qs.get("tmdb") || "";
    const type    = qs.get("type") || "movie";
    const season  = parseInt(qs.get("s") || "0");
    const episode = parseInt(qs.get("e") || "0");
    if (!tmdbId) { res.statusCode = 400; res.end(JSON.stringify({ error: "tmdb required" })); return; }

    // ── Exact port of decoder.ts ───────────────────────────────
    function bMGyx71TzQLfdonN(s) {
      const chunks = [];
      for (let i = 0; i < s.length; i += 3) chunks.push(s.slice(i, i + 3));
      return chunks.reverse().join("");
    }
    function Iry9MQXnLs(s) {
      const key = "pWB9V)[*4I`nJpp?ozyB~dbr9yt!_n4u";
      const hex = s.match(/.{1,2}/g).map(h => String.fromCharCode(parseInt(h, 16))).join("");
      let xored = "";
      for (let i = 0; i < hex.length; i++)
        xored += String.fromCharCode(hex.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      let shifted = "";
      for (let i = 0; i < xored.length; i++)
        shifted += String.fromCharCode(xored.charCodeAt(i) - 3);
      return Buffer.from(shifted, "base64").toString("utf8");
    }
    function IGLImMhWrI(s) {
      const rev = s.split("").reverse().join("");
      const rot = rev.replace(/[a-zA-Z]/g, c =>
        String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < "n" ? 13 : -13)));
      const rev2 = rot.split("").reverse().join("");
      return Buffer.from(rev2, "base64").toString("utf8");
    }
    function GTAxQyTyBx(s) {
      const rev = s.split("").reverse().join("");
      let evens = "";
      for (let i = 0; i < rev.length; i += 2) evens += rev[i];
      return Buffer.from(evens, "base64").toString("utf8");
    }
    function C66jPHx8qu(s) {
      const key = "X9a(O;FMV2-7VO5x;Ao:dN1NoFs?j,";
      const rev = s.split("").reverse().join("");
      const hex = rev.match(/.{1,2}/g).map(h => String.fromCharCode(parseInt(h, 16))).join("");
      let out = "";
      for (let i = 0; i < hex.length; i++)
        out += String.fromCharCode(hex.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      return out;
    }
    function MyL1IRSfHe(s) {
      const rev = s.split("").reverse().join("");
      let shifted = "";
      for (let i = 0; i < rev.length; i++)
        shifted += String.fromCharCode(rev.charCodeAt(i) - 1);
      let hex = "";
      for (let i = 0; i < shifted.length; i += 2)
        hex += String.fromCharCode(parseInt(shifted.substr(i, 2), 16));
      return hex;
    }
    function detdj7JHiK(s) {
      const key = `3SAY~#%Y(V%>5d/Yg"$G[Lh1rK4a;7ok`;
      const sliced = s.slice(10, -16);
      const decoded = Buffer.from(sliced, "base64").toString("binary");
      const k = key.repeat(Math.ceil(decoded.length / key.length)).substring(0, decoded.length);
      let out = "";
      for (let i = 0; i < decoded.length; i++)
        out += String.fromCharCode(decoded.charCodeAt(i) ^ k.charCodeAt(i));
      return out;
    }
    function laM1dAi3vO(s) {
      const rev = s.split("").reverse().join("").replace(/-/g, "+").replace(/_/g, "/");
      const decoded = Buffer.from(rev, "base64").toString("binary");
      let out = "";
      for (let i = 0; i < decoded.length; i++)
        out += String.fromCharCode(decoded.charCodeAt(i) - 5);
      return out;
    }
    function GuxKGDsA2T(s) {
      const rev = s.split("").reverse().join("").replace(/-/g, "+").replace(/_/g, "/");
      const decoded = Buffer.from(rev, "base64").toString("binary");
      let out = "";
      for (let i = 0; i < decoded.length; i++)
        out += String.fromCharCode(decoded.charCodeAt(i) - 7);
      return out;
    }
    function LXVUMCoAHJ(s) {
      const rev = s.split("").reverse().join("").replace(/-/g, "+").replace(/_/g, "/");
      const decoded = Buffer.from(rev, "base64").toString("binary");
      let out = "";
      for (let i = 0; i < decoded.length; i++)
        out += String.fromCharCode(decoded.charCodeAt(i) - 3);
      return out;
    }
    function nZlUnj2VSo(s) {
      const map = {x:"a",y:"b",z:"c",a:"d",b:"e",c:"f",d:"g",e:"h",f:"i",g:"j",h:"k",i:"l",j:"m",k:"n",l:"o",m:"p",n:"q",o:"r",p:"s",q:"t",r:"u",s:"v",t:"w",u:"x",v:"y",w:"z",X:"A",Y:"B",Z:"C",A:"D",B:"E",C:"F",D:"G",E:"H",F:"I",G:"J",H:"K",I:"L",J:"M",K:"N",L:"O",M:"P",N:"Q",O:"R",P:"S",Q:"T",R:"U",S:"V",T:"W",U:"X",V:"Y",W:"Z"};
      return s.replace(/[xyzabcdefghijklmnopqrstuvwXYZABCDEFGHIJKLMNOPQRSTUVW]/g, c => map[c] || c);
    }
    function decrypt(param, type) {
      switch(type) {
        case "LXVUMCoAHJ": return LXVUMCoAHJ(param);
        case "GuxKGDsA2T": return GuxKGDsA2T(param);
        case "laM1dAi3vO": return laM1dAi3vO(param);
        case "nZlUnj2VSo": return nZlUnj2VSo(param);
        case "Iry9MQXnLs": return Iry9MQXnLs(param);
        case "IGLImMhWrI": return IGLImMhWrI(param);
        case "GTAxQyTyBx": return GTAxQyTyBx(param);
        case "C66jPHx8qu": return C66jPHx8qu(param);
        case "MyL1IRSfHe": return MyL1IRSfHe(param);
        case "detdj7JHiK": return detdj7JHiK(param);
        case "bMGyx71TzQLfdonN": return bMGyx71TzQLfdonN(param);
        default: return null;
      }
    }

    // ── Exact port of PRORCPhandler ────────────────────────────
    async function PRORCPhandler(prorcp, BASEDOM) {
      try {
        const r = await axios.get(`${BASEDOM}/prorcp/${prorcp}`, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": `${BASEDOM}/` },
          timeout: 10000
        });
        const html = r.data || "";

        // Find the last non-cpt JS script
        const scripts = [...html.matchAll(/<script\s+src="\/([^"]*\.js)\?_=([^"]*)"><\/script>/gm)];
        if (!scripts.length) return null;
        let scriptPath = null;
        const last = scripts[scripts.length - 1][0];
        if (last.includes("cpt.js") && scripts.length >= 2) {
          scriptPath = scripts[scripts.length - 2][1] + "?_=" + scripts[scripts.length - 2][2];
        } else {
          scriptPath = scripts[scripts.length - 1][1] + "?_=" + scripts[scripts.length - 1][2];
        }

        const jsRes = await axios.get(`${BASEDOM}/${scriptPath}`, {
          headers: { "Referer": `${BASEDOM}/` }, timeout: 8000
        });
        const jsCode = jsRes.data || "";

        // Extract decrypt function name and param — exact regex from vidsrc.ts
        const decryptRegex = /\{\}\}window\[([^"]+)\("([^"]+)"\)\]/;
        const decryptMatches = jsCode.match(decryptRegex);
        if (!decryptMatches || decryptMatches.length < 3) return null;

        const fnType  = decryptMatches[1].trim();  // e.g. "bMGyx71TzQLfdonN"
        const fnParam = decryptMatches[2].trim();  // the encoded id string

        // Get the element id by decrypting fnParam with fnType
        const elemId = decrypt(fnParam, fnType);
        if (!elemId) return null;

        // Get the data from the element with that id
        const idMatch = html.match(new RegExp(`id="${elemId}"[^>]*>([^<]*)<`));
        if (!idMatch) return null;
        const encData = idMatch[1].trim();

        // Decrypt data using fnParam as the type key
        const result = decrypt(encData, fnParam);
        return result;
      } catch(e) { return null; }
    }

    // ── Exact port of tmdbScrape ───────────────────────────────
    async function tmdbScrape(tmdbId, type, season, episode) {
      let BASEDOM = "https://whisperingauroras.com";
      const url = type === "movie"
        ? `https://vidsrc.net/embed/movie?tmdb=${tmdbId}`
        : `https://vidsrc.net/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`;

      const embedRes = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://vidsrc.net/" },
        timeout: 12000
      });
      const html = embedRes.data || "";

      // Parse BASEDOM from iframe src (same as serversLoad)
      const iframeSrc = (html.match(/iframe[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
      if (iframeSrc) {
        try {
          const base = iframeSrc.startsWith("//") ? "https:" + iframeSrc : iframeSrc;
          BASEDOM = new URL(base).origin;
        } catch(e) {}
      }

      // Parse servers — .serversList .server elements with data-hash
      const serverMatches = [...html.matchAll(/class="server[^"]*"[^>]*data-hash="([^"]+)"/g)];
      // also try reverse attr order
      const serverMatches2 = [...html.matchAll(/data-hash="([^"]+)"[^>]*class="server/g)];
      const hashes = [...new Set([
        ...serverMatches.map(m => m[1]),
        ...serverMatches2.map(m => m[1])
      ])].filter(Boolean);

      if (!hashes.length) return [];

      const results = [];
      await Promise.all(hashes.slice(0, 3).map(async (hash) => {
        try {
          const rcpRes = await axios.get(`${BASEDOM}/rcp/${hash}`, {
            headers: { "User-Agent": "Mozilla/5.0", "Referer": url }, timeout: 8000
          });
          const rcpHtml = rcpRes.data || "";

          // rcpGrabber: find src: '...'
          const srcMatch = rcpHtml.match(/src:\s*'([^']*)'/);
          if (!srcMatch) return;
          const srcData = srcMatch[1];

          if (srcData.startsWith("/prorcp/")) {
            const stream = await PRORCPhandler(srcData.replace("/prorcp/", ""), BASEDOM);
            if (stream && (stream.includes(".m3u8") || stream.includes(".mp4"))) {
              const finalUrl = stream.startsWith("//") ? "https:" + stream : stream;
              results.push({ name: "VidSrc", image: "", mediaId: tmdbId, stream: finalUrl, referer: BASEDOM });
            }
          }
        } catch(e) {}
      }));

      return results;
    }

    try {
      const streams = await tmdbScrape(tmdbId, type, season, episode);
      res.end(JSON.stringify(streams.length ? streams : []));
    } catch(e) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }


  // ── /get-source — multi-provider parallel HLS extractor ─────────
  // GET /get-source?tmdb=ID&type=movie|tv&s=1&e=1
  // Fires vidsrc.icu + vidsrc.rip + embed.su + seapi.link in parallel.
  // Returns: { streams: [{ url, quality, provider, referer, captions }], count }
  if (path === "/get-source") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    const qs      = new URL(req.url, "http://localhost").searchParams;
    const tmdbId  = qs.get("tmdb")  || "";
    const imdbId  = qs.get("imdb")  || "";
    const type    = qs.get("type")  || "movie";
    const season  = qs.get("s")     || "1";
    const episode = qs.get("e")     || "1";
    if (!tmdbId && !imdbId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "tmdb or imdb required" }));
      return;
    }

    const GS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

    // RC4 decrypt helper (used by some vidsrc providers)
    function rc4(key, data) {
      const kb = Buffer.from(key, "utf8");
      const db = Buffer.from(data, "base64");
      const S  = Array.from({ length: 256 }, (_, i) => i);
      let j = 0;
      for (let i = 0; i < 256; i++) {
        j = (j + S[i] + kb[i % kb.length]) & 0xff;
        [S[i], S[j]] = [S[j], S[i]];
      }
      let ci = 0; j = 0;
      const out = [];
      for (const byte of db) {
        ci = (ci + 1) & 0xff;
        j  = (j + S[ci]) & 0xff;
        [S[ci], S[j]] = [S[j], S[ci]];
        out.push(byte ^ S[(S[ci] + S[j]) & 0xff]);
      }
      return Buffer.from(out).toString("utf8");
    }

    // Generic vidsrc-family scraper: embed page → rcp hashes → prorcp/js decrypt → m3u8
    async function scrapeVidsrcFamily(embedUrl, providerName, basedom) {
      try {
        const embedRes = await axios.get(embedUrl, {
          headers: { "User-Agent": GS_UA, "Referer": basedom + "/" },
          timeout: 12000, maxRedirects: 5,
        });
        const html = typeof embedRes.data === "string" ? embedRes.data : JSON.stringify(embedRes.data);

        // Try to detect actual server base domain from iframe src
        let BASEDOM = basedom;
        const iframeM = html.match(/src=["'](https?:\/\/[^/'"]+\/embed\/[^"']*)['"]/i);
        if (iframeM) { try { BASEDOM = new URL(iframeM[1]).origin; } catch(e) {} }

        // Quick win: direct m3u8 in embed HTML
        const directM = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
        if (directM) return [{ url: directM[1], quality: "auto", provider: providerName, referer: BASEDOM, captions: [] }];

        // Collect data-hash values → rcp endpoints
        const hashes = new Set();
        for (const m of html.matchAll(/data-hash="([^"]{6,})"/g)) hashes.add(m[1]);
        for (const m of html.matchAll(/data-id="([^"]{6,})"/g))   hashes.add(m[1]);
        if (!hashes.size) return [];

        const results = [];
        await Promise.allSettled([...hashes].slice(0, 4).map(async (hash) => {
          try {
            const rcpRes = await axios.get(`${BASEDOM}/rcp/${hash}`, {
              headers: { "User-Agent": GS_UA, "Referer": embedUrl, "X-Requested-With": "XMLHttpRequest" },
              timeout: 8000,
            });
            const rcpHtml = typeof rcpRes.data === "string" ? rcpRes.data : JSON.stringify(rcpRes.data);

            // rcpGrabber: look for src: '...' or src: "..."
            const srcM = rcpHtml.match(/src:\s*['"]([^'"]+)['"]/);
            if (!srcM) return;
            const src = srcM[1];

            // Direct m3u8 in rcp response
            if (/\.m3u8/i.test(src)) {
              results.push({ url: src.startsWith("//") ? "https:" + src : src, quality: "auto", provider: providerName, referer: BASEDOM, captions: [] });
              return;
            }

            // prorcp: follow to JS key extraction + RC4 decrypt
            const proUrl = src.startsWith("//") ? "https:" + src : (src.startsWith("http") ? src : `${BASEDOM}${src.startsWith("/") ? "" : "/"}${src}`);
            const proRes = await axios.get(proUrl, { headers: { "User-Agent": GS_UA, "Referer": BASEDOM + "/" }, timeout: 8000 });
            const proHtml = typeof proRes.data === "string" ? proRes.data : JSON.stringify(proRes.data);
            const proBase = (() => { try { return new URL(proUrl).origin; } catch(e) { return BASEDOM; } })();

            // Try direct m3u8 in prorcp page
            const proM = proHtml.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
            if (proM) { results.push({ url: proM[1], quality: "auto", provider: providerName, referer: proUrl, captions: [] }); return; }

            // Find JS file (skip cpt.js / jquery)
            const jsFiles = [...proHtml.matchAll(/src=["']([^"']+\.js[^"']*)['"]/g)].map(m => m[1])
              .filter(s => !s.includes("cpt.js") && !s.includes("jquery") && !s.includes("cdn."));
            if (!jsFiles.length) return;
            const jsRaw = jsFiles[0];
            const jsUrl = jsRaw.startsWith("http") ? jsRaw : (jsRaw.startsWith("//") ? "https:" + jsRaw : `${proBase}/${jsRaw.replace(/^\//, "")}`);
            const jsRes = await axios.get(jsUrl, { headers: { "User-Agent": GS_UA, "Referer": proUrl }, timeout: 6000 });
            const jsCode = typeof jsRes.data === "string" ? jsRes.data : "";

            // Extract RC4 key from JS
            const keyM = jsCode.match(/(?:key|k|_key|secret)\s*[:=]\s*["']([a-zA-Z0-9!@#$%^&*()_+\-=<>?,./\;:~`"]{8,48})["']/);
            // Extract encrypted data from prorcp page
            const encM = proHtml.match(/data(?:-(?:src|url|stream|enc))?\s*[:=]\s*["']([A-Za-z0-9+/=]{20,})["']/);
            if (!keyM || !encM) return;

            const decrypted = rc4(keyM[1], encM[1]);
            if (!decrypted.includes(".m3u8") && !decrypted.includes(".mp4")) return;
            const finalUrl = decrypted.startsWith("//") ? "https:" + decrypted : decrypted;
            results.push({ url: finalUrl, quality: "auto", provider: providerName, referer: proUrl, captions: [] });
          } catch(e) {}
        }));
        return results;
      } catch(e) { return []; }
    }

    // embed.su: base64 config → /api/e/{hash} → sources + captions
    async function scrapeEmbedSu(id, isTV, season, episode) {
      try {
        const embedUrl = isTV
          ? `https://embed.su/embed/tv/${id}/${season}/${episode}`
          : `https://embed.su/embed/movie/${id}`;
        const embedRes = await axios.get(embedUrl, {
          headers: { "User-Agent": GS_UA, "Referer": "https://embed.su/" },
          timeout: 10000,
        });
        const html = typeof embedRes.data === "string" ? embedRes.data : "";
        const cfgM = html.match(/e\s*=\s*["']([A-Za-z0-9+/=]{20,})["']/);
        if (!cfgM) return [];
        let config;
        try { config = JSON.parse(Buffer.from(cfgM[1], "base64").toString("utf8")); } catch(e) { return []; }
        const hash = config?.hash || config?.h || "";
        if (!hash) return [];
        const apiRes = await axios.get(`https://embed.su/api/e/${hash}`, {
          headers: { "User-Agent": GS_UA, "Referer": embedUrl },
          timeout: 8000,
        });
        const data     = apiRes.data;
        const sources  = data?.sources  || data?.stream    || [];
        const caps     = data?.captions || data?.subtitles || [];
        const captions = caps.map(c => ({ file: c.file || c.url, label: c.label || c.language || "English", kind: "captions" }));
        return sources
          .filter(s => s?.file || s?.url)
          .map(s => ({ url: s.file || s.url, quality: s.quality || s.label || "auto", provider: "embed.su", referer: "https://embed.su/", captions }));
      } catch(e) { return []; }
    }

    // seapi.link (multiembed backend): direct JSON API
    async function scrapeSeapi(id, isTV, season, episode) {
      try {
        const base   = `https://seapi.link/?type=tmdb&id=${id}`;
        const apiUrl = isTV
          ? `${base}&season=${season}&episode=${episode}&max_results=5`
          : `${base}&max_results=5`;
        const r = await axios.get(apiUrl, {
          headers: { "User-Agent": GS_UA, "Referer": "https://multiembed.mov/", "Origin": "https://multiembed.mov" },
          timeout: 15000,
        });
        const streams = r.data?.streams || r.data?.sources || [];
        return streams
          .filter(s => s?.url && (s.url.includes(".m3u8") || s.url.includes(".mp4")))
          .map(s => ({ url: s.url, quality: s.quality || "auto", provider: "seapi/multiembed", referer: "https://multiembed.mov/", captions: [] }));
      } catch(e) { return []; }
    }

    try {
      const isTV = type === "tv";
      const id   = tmdbId || imdbId;

      // Build embed URLs for each provider
      const icuUrl = isTV
        ? `https://vidsrc.icu/embed/tv/${id}/${season}/${episode}`
        : `https://vidsrc.icu/embed/movie/${id}`;
      const ripUrl = isTV
        ? `https://vidsrc.rip/embed/tv?tmdb=${id}&season=${season}&episode=${episode}`
        : `https://vidsrc.rip/embed/movie?tmdb=${id}`;

      // Fire all 4 providers in parallel — don't let one timeout block others
      const [icuR, ripR, suR, seapiR] = await Promise.allSettled([
        scrapeVidsrcFamily(icuUrl,  "vidsrc.icu", "https://vidsrc.icu"),
        scrapeVidsrcFamily(ripUrl,  "vidsrc.rip", "https://vidsrc.rip"),
        scrapeEmbedSu(id, isTV, season, episode),
        scrapeSeapi(id, isTV, season, episode),
      ]);

      const streams = [
        ...(icuR.status   === "fulfilled" ? icuR.value   : []),
        ...(ripR.status   === "fulfilled" ? ripR.value   : []),
        ...(suR.status    === "fulfilled" ? suR.value    : []),
        ...(seapiR.status === "fulfilled" ? seapiR.value : []),
      ].filter(s => s?.url);

      res.end(JSON.stringify({ streams, count: streams.length }));
    } catch(e) {
      res.statusCode = 502;
      res.end(JSON.stringify({ streams: [], error: e.message }));
    }
    return;
  }


  // ── /debug-source — returns raw diagnostic info from each provider ──
  // GET /debug-source?tmdb=ID&type=movie
  if (path === "/debug-source") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    const qs     = new URL(req.url, "http://localhost").searchParams;
    const tmdbId = qs.get("tmdb") || "550";
    const type   = qs.get("type") || "movie";
    const season = qs.get("s") || "1";
    const episode= qs.get("e") || "1";
    const isTV   = type === "tv";
    const UA     = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

    const diag = {};

    // Test vidsrc.icu
    try {
      const url = isTV
        ? `https://vidsrc.icu/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://vidsrc.icu/embed/movie/${tmdbId}`;
      const r = await axios.get(url, {
        headers: { "User-Agent": UA, "Referer": "https://vidsrc.icu/" },
        timeout: 10000, maxRedirects: 5,
      });
      const html = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
      const hashes = [...html.matchAll(/data-hash="([^"]{6,})"/g)].map(m => m[1]);
      const dataIds = [...html.matchAll(/data-id="([^"]{6,})"/g)].map(m => m[1]);
      const m3u8 = (html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/) || [])[1] || null;
      const iframeSrc = (html.match(/src=["'](https?:\/\/[^"']+\/embed\/[^"']*)["']/i) || [])[1] || null;
      diag.vidsrc_icu = {
        status: r.status,
        url,
        html_len: html.length,
        data_hashes: hashes,
        data_ids: dataIds,
        m3u8_found: m3u8,
        iframe_src: iframeSrc,
        html_snippet: html.slice(0, 500),
      };
    } catch(e) {
      diag.vidsrc_icu = { error: e.message, code: e.code };
    }

    // Test vidsrc.rip
    try {
      const url = isTV
        ? `https://vidsrc.rip/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`
        : `https://vidsrc.rip/embed/movie?tmdb=${tmdbId}`;
      const r = await axios.get(url, {
        headers: { "User-Agent": UA, "Referer": "https://vidsrc.rip/" },
        timeout: 10000, maxRedirects: 5,
      });
      const html = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
      const hashes = [...html.matchAll(/data-hash="([^"]{6,})"/g)].map(m => m[1]);
      const m3u8 = (html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/) || [])[1] || null;
      diag.vidsrc_rip = {
        status: r.status,
        url,
        html_len: html.length,
        data_hashes: hashes,
        m3u8_found: m3u8,
        html_snippet: html.slice(0, 500),
      };
    } catch(e) {
      diag.vidsrc_rip = { error: e.message, code: e.code };
    }

    // Test embed.su
    try {
      const url = isTV
        ? `https://embed.su/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://embed.su/embed/movie/${tmdbId}`;
      const r = await axios.get(url, {
        headers: { "User-Agent": UA, "Referer": "https://embed.su/" },
        timeout: 10000,
      });
      const html = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
      const cfgMatch = (html.match(/\be\s*=\s*["']([A-Za-z0-9+/=]{20,})["']/) || [])[1] || null;
      diag.embed_su = {
        status: r.status,
        url,
        html_len: html.length,
        config_b64_found: cfgMatch ? cfgMatch.slice(0, 30) + "..." : null,
        html_snippet: html.slice(0, 500),
      };
    } catch(e) {
      diag.embed_su = { error: e.message, code: e.code };
    }

    // Test seapi
    try {
      const url = `https://seapi.link/?type=tmdb&id=${tmdbId}&max_results=5`;
      const r = await axios.get(url, {
        headers: { "User-Agent": UA, "Referer": "https://multiembed.mov/", "Origin": "https://multiembed.mov" },
        timeout: 15000,
      });
      diag.seapi = {
        status: r.status,
        url,
        data: r.data,
      };
    } catch(e) {
      diag.seapi = { error: e.message, code: e.code };
    }

    res.end(JSON.stringify(diag, null, 2));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
};