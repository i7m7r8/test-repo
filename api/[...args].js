const axios = require("axios");

const TMDB_KEY = "4ef0d7355d9ffb5151e987764708ce96";

const manifest = {
  id: "community.multistream.v13",
  version: "13.0.0",
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

// ── apibay via proxies ────────────────────────────────────────
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

// ── Nyaa RSS ──────────────────────────────────────────────────
async function nyaaSearch(q) {
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
}

// ── Build streams from TPB results ───────────────────────────
function buildStreams(results, refHash) {
  const seen = new Set(refHash ? [refHash] : []);
  const packs = [], singles = [];
  for (const t of results) {
    if (!t.info_hash || parseInt(t.seeders) < 5) continue;
    const h = t.info_hash.toLowerCase();
    if (seen.has(h)) continue;
    seen.add(h);
    const q = quality(t.name);
    const sz = sizeStr(t.size);
    const sd = t.seeders;
    const epMatch = t.name.match(/S(\d+)(?:E(\d+))?/i);
    const isSeasonPack = epMatch && !epMatch[2];
    const epInfo = epMatch ? ` S${epMatch[1]}${epMatch[2] ? "E" + epMatch[2] : " Full Season"}` : "";
    const stream = {
      name: `MultiStream\n${q}`,
      title: `${clean(t.name)}${epInfo}\n💾 ${sz} | 🌱 ${sd} seeds`,
      infoHash: h,
      sources: TRACKERS,
      behaviorHints: { notWebReady: false }
    };
    if (isSeasonPack) packs.push(stream);
    else singles.push(stream);
    if (packs.length + singles.length >= 8) break;
  }
  return [...packs, ...singles].slice(0, 8);
}

// ── Main handler ──────────────────────────────────────────────
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
      // Anime via Nyaa
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

      // Movies/TV via apibay
      const catMap   = { ms_hollywood: "207", ms_bollywood: "200", ms_tvshows: "205" };
      const queryMap = { ms_hollywood: "movie", ms_bollywood: "hindi", ms_tvshows: "tv show" };
      const q   = search || queryMap[id] || "movie";
      const cat = catMap[id] || "0";
      const results = await tpbSearch(q, cat);
      const seen = new Set();
      const metas = [];
      for (const t of results) {
        if (!t.info_hash || parseInt(t.seeders) < 5) continue;
        const name = clean(t.name);
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        // Try TMDB for IMDB id + poster
        let metaId = `ms_${t.info_hash.toLowerCase()}_${encodeURIComponent(name).replace(/%/g,"_")}`;
        let poster = `https://via.placeholder.com/300x450/0f0f1a/818cf8?text=${encodeURIComponent(name.slice(0,15))}`;
        let desc = `${quality(t.name)} | 🌱 ${t.seeders} seeds | 💾 ${sizeStr(t.size)}`;
        let yr = (t.name.match(/\b(19|20)\d{2}\b/) || [])[0] || "";
        try {
          const tmdb = await tmdbSearch(name, type);
          if (tmdb) {
            if (tmdb.imdbId) metaId = tmdb.imdbId;
            if (tmdb.poster) poster = tmdb.poster;
            if (tmdb.description) desc = tmdb.description;
            if (tmdb.year) yr = tmdb.year;
          }
        } catch(e) {}
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
    const parts = id.replace("ms_", "").split("_");
    const name = parts.length > 1
      ? decodeURIComponent(parts.slice(1).join("_").replace(/_/g, "%"))
      : parts[0].slice(0, 12);
    const tmdb = await tmdbSearch(name, type).catch(() => null);
    return respond(res, { meta: {
      id, type, name: tmdb?.name || name,
      poster: tmdb?.poster || `https://via.placeholder.com/300x450/0f0f1a/818cf8?text=${encodeURIComponent(name.slice(0,15))}`,
      background: tmdb?.bg || tmdb?.poster,
      description: tmdb?.description || name, year: tmdb?.year || "", genres: []
    }});
  }

  // STREAM
  const sm = path.match(/^\/stream\/([^/]+)\/([^/]+?)\.json$/);
  if (sm) {
    const [, type, rawId] = sm;
    // Decode %3A → : for episode ids like tt0455275%3A1%3A1
    const decoded = decodeURIComponent(rawId);
    const ttMatch = decoded.match(/^(tt\d+)(?::(\d+):(\d+))?$/);
    const isMsId  = decoded.startsWith("ms_");

    let titleQuery = "";
    let season = null, episode = null;
    let refHash = "";

    if (ttMatch) {
      // IMDB id — look up title from TMDB
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

    if (!titleQuery) {
      return respond(res, { streams: [{
        name: "MultiStream", title: "⚡ Play",
        infoHash: refHash || decoded.replace("ms_","").split("_")[0],
        sources: TRACKERS, behaviorHints: { notWebReady: false }
      }]});
    }

    // Build search query with S01E01 if episode known
    let searchQ = titleQuery;
    if (season !== null && episode !== null) {
      searchQ = `${titleQuery} S${String(season).padStart(2,"0")}E${String(episode).padStart(2,"0")}`;
    } else if (season !== null) {
      searchQ = `${titleQuery} S${String(season).padStart(2,"0")}`;
    }

    const cat = type === "movie" ? "207" : "205";
    const results = await tpbSearch(searchQ, cat).catch(() => []);
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

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
};
