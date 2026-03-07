const axios = require("axios");

const manifest = {
  id: "community.multistream.allinone",
  version: "2.0.0",
  name: "MultiStream",
  description: "Bollywood, Hollywood, TV Shows & Anime — Torrent streams via YTS, EZTV & Nyaa.",
  logo: "https://i.imgur.com/uwDqNDd.png",
  catalogs: [
    {
      type: "movie",
      id: "yts_movies",
      name: "🎬 Hollywood (YTS)",
      extra: [{ name: "search" }, { name: "skip" }, { name: "genre" }]
    },
    {
      type: "movie",
      id: "yts_bollywood",
      name: "🇮🇳 Bollywood & Hindi",
      extra: [{ name: "search" }, { name: "skip" }]
    },
    {
      type: "series",
      id: "eztv_shows",
      name: "📺 TV Shows (EZTV)",
      extra: [{ name: "search" }, { name: "skip" }]
    },
    {
      type: "series",
      id: "nyaa_anime",
      name: "🎌 Anime (Nyaa)",
      extra: [{ name: "search" }, { name: "skip" }]
    }
  ],
  resources: ["catalog", "stream", "meta"],
  types: ["movie", "series"],
  idPrefixes: ["yts_", "eztv_", "nyaa_"],
  behaviorHints: { adult: true, p2p: true }
};

// ─── HELPERS ────────────────────────────────────────────────

function respond(res, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function parseExtra(str) {
  const out = {};
  if (!str) return out;
  str.split("&").forEach(p => {
    const [k, v] = p.split("=");
    if (k) out[decodeURIComponent(k)] = v ? decodeURIComponent(v) : "";
  });
  return out;
}

function magnetFromHash(hash, name) {
  const trackers = [
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.openbittorrent.com:80",
    "udp://tracker.coppersurfer.tk:6969",
    "udp://glotorrents.pw:6969/announce",
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://torrent.gresille.org:80/announce",
    "udp://p4p.arenabg.com:1337",
    "udp://tracker.leechers-paradise.org:6969"
  ].map(t => "&tr=" + encodeURIComponent(t)).join("");
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}${trackers}`;
}

// ─── YTS ────────────────────────────────────────────────────

async function ytsSearch({ query = "", page = 1, genre = "", hindi = false }) {
  let url = `https://yts.mx/api/v2/list_movies.json?limit=20&page=${page}&sort_by=download_count`;
  if (query) url += `&query_term=${encodeURIComponent(query)}`;
  if (genre) url += `&genre=${encodeURIComponent(genre)}`;
  if (hindi) url += `&query_term=${encodeURIComponent(query || "hindi")}`;
  const res = await axios.get(url, { timeout: 10000 });
  return res.data?.data?.movies || [];
}

function ytsToMeta(m) {
  return {
    id: `yts_${m.imdb_code || m.id}`,
    type: "movie",
    name: m.title_long || m.title,
    poster: m.medium_cover_image || m.large_cover_image,
    background: m.background_image_original || m.background_image,
    description: m.summary || "",
    year: String(m.year || ""),
    imdbRating: m.rating ? String(m.rating) : undefined,
    genres: m.genres || [],
    runtime: m.runtime ? `${m.runtime} min` : undefined
  };
}

// ─── EZTV ───────────────────────────────────────────────────

async function eztvSearch({ query = "", page = 1 }) {
  let url = `https://eztv.re/api/get-torrents?limit=20&page=${page}`;
  if (query) url += `&imdb_id=0`; // fallback — EZTV search by name below
  // EZTV doesn't support name search in API, use web scraping fallback
  if (query) {
    url = `https://eztv.re/api/get-torrents?limit=20&page=${page}`;
  }
  const res = await axios.get(url, { timeout: 10000 });
  const torrents = res.data?.torrents || [];
  if (query) {
    const q = query.toLowerCase();
    return torrents.filter(t => t.title && t.title.toLowerCase().includes(q));
  }
  return torrents;
}

function eztvToMeta(t) {
  const show = t.title?.replace(/S\d+E\d+.*$/i, "").replace(/\.\d{4}\..*/,"").replace(/\./g," ").trim();
  return {
    id: `eztv_${t.imdb_id || t.id}`,
    type: "series",
    name: show || t.title,
    poster: t.small_screenshot || `https://img.eztv.re/shows/${t.imdb_id}.jpg`,
    description: t.title || "",
    year: t.title?.match(/\b(19|20)\d{2}\b/)?.[0] || ""
  };
}

// ─── NYAA ────────────────────────────────────────────────────

async function nyaaSearch({ query = "anime", page = 1 }) {
  const p = page - 1;
  const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&c=1_0&f=0&p=${p}`;
  const res = await axios.get(url, { timeout: 10000 });
  const items = [];
  const matches = res.data.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const m of matches) {
    const block = m[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || "";
    const magnet = block.match(/<nyaa:magnetURI><!\[CDATA\[(.*?)\]\]><\/nyaa:magnetURI>/)?.[1] || "";
    const hash = magnet.match(/btih:([a-fA-F0-9]{40})/i)?.[1] || "";
    const size = block.match(/<nyaa:size>(.*?)<\/nyaa:size>/)?.[1] || "";
    const seeders = block.match(/<nyaa:seeders>(.*?)<\/nyaa:seeders>/)?.[1] || "0";
    if (title && hash) items.push({ title, magnet, hash, size, seeders });
    if (items.length >= 20) break;
  }
  return items;
}

function nyaaToMeta(item, idx) {
  const name = item.title.replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "").trim().split(" - ")[0].trim();
  return {
    id: `nyaa_${item.hash}`,
    type: "series",
    name: name || item.title,
    poster: `https://nyaa.si/favicon.png`,
    description: item.title,
    genres: ["Anime"]
  };
}

// ─── MAIN HANDLER ────────────────────────────────────────────

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
    const page = Math.floor(skip / 20) + 1;

    try {
      if (id === "yts_movies") {
        const movies = await ytsSearch({ query: search, page });
        return respond(res, { metas: movies.map(ytsToMeta) });
      }

      if (id === "yts_bollywood") {
        const movies = await ytsSearch({ query: search || "hindi", page, hindi: true });
        const filtered = search
          ? movies
          : movies.filter(m =>
              m.genres?.some(g => ["hindi","bollywood","indian"].includes(g.toLowerCase())) ||
              m.title?.toLowerCase().includes("hindi") ||
              m.title?.toLowerCase().includes("bollywood") ||
              m.language === "hi"
            );
        // If filter is too strict, return all results when searching
        return respond(res, { metas: (filtered.length ? filtered : movies).map(ytsToMeta) });
      }

      if (id === "eztv_shows") {
        const shows = await eztvSearch({ query: search, page });
        const seen = new Set();
        const metas = [];
        for (const t of shows) {
          const m = eztvToMeta(t);
          if (!seen.has(m.name)) { seen.add(m.name); metas.push(m); }
        }
        return respond(res, { metas: metas.slice(0, 20) });
      }

      if (id === "nyaa_anime") {
        const items = await nyaaSearch({ query: search || "anime", page });
        const seen = new Set();
        const metas = [];
        for (const item of items) {
          const m = nyaaToMeta(item);
          if (!seen.has(m.name)) { seen.add(m.name); metas.push(m); }
        }
        return respond(res, { metas });
      }

    } catch (e) {
      console.error("Catalog error:", e.message);
      return respond(res, { metas: [] });
    }

    return respond(res, { metas: [] });
  }

  // META
  const metaMatch = path.match(/^\/meta\/([^/]+)\/([^/]+?)\.json$/);
  if (metaMatch) {
    const [, type, id] = metaMatch;

    try {
      if (id.startsWith("yts_")) {
        const imdb = id.replace("yts_", "");
        const url = `https://yts.mx/api/v2/movie_details.json?imdb_id=${imdb}&with_images=true&with_cast=true`;
        const r = await axios.get(url, { timeout: 8000 });
        const m = r.data?.data?.movie;
        if (m) return respond(res, { meta: ytsToMeta(m) });
      }

      if (id.startsWith("eztv_")) {
        const imdb = id.replace("eztv_", "");
        const url = `https://eztv.re/api/get-torrents?imdb_id=${imdb}&limit=100`;
        const r = await axios.get(url, { timeout: 8000 });
        const torrents = r.data?.torrents || [];
        const name = torrents[0]?.title?.replace(/S\d+E\d+.*$/i,"").replace(/\./g," ").trim() || id;
        const videos = torrents.map((t, i) => {
          const epMatch = t.title?.match(/S(\d+)E(\d+)/i);
          return {
            id: `eztv_ep_${t.imdb_id}_${t.id}`,
            title: t.title || `Episode ${i+1}`,
            season: epMatch ? parseInt(epMatch[1]) : 1,
            episode: epMatch ? parseInt(epMatch[2]) : i + 1,
            released: t.date_released_unix ? new Date(t.date_released_unix * 1000).toISOString() : new Date().toISOString(),
            overview: `${(t.size_bytes / 1024 / 1024 / 1024).toFixed(2)} GB | Seeds: ${t.seeds}`
          };
        });
        return respond(res, { meta: { id, type: "series", name, videos } });
      }

      if (id.startsWith("nyaa_")) {
        return respond(res, { meta: { id, type: "series", name: id.replace("nyaa_",""), genres: ["Anime"] } });
      }

    } catch (e) {
      console.error("Meta error:", e.message);
    }

    return respond(res, { meta: { id, type, name: id } });
  }

  // STREAM
  const streamMatch = path.match(/^\/stream\/([^/]+)\/([^/]+?)\.json$/);
  if (streamMatch) {
    const [, type, id] = streamMatch;

    try {
      // YTS movie streams
      if (id.startsWith("yts_")) {
        const imdb = id.replace("yts_", "");
        const url = `https://yts.mx/api/v2/movie_details.json?imdb_id=${imdb}`;
        const r = await axios.get(url, { timeout: 8000 });
        const torrents = r.data?.data?.movie?.torrents || [];
        const streams = torrents.map(t => ({
          name: `MultiStream\n${t.quality} ${t.type?.toUpperCase()}`,
          title: `⚡ ${t.quality} | ${t.type} | ${t.size}\n🌱 Seeds: ${t.seeds}`,
          infoHash: t.hash.toLowerCase(),
          sources: [
            "tracker:udp://open.demonii.com:1337/announce",
            "tracker:udp://tracker.openbittorrent.com:80",
            "tracker:udp://tracker.coppersurfer.tk:6969",
            "tracker:udp://tracker.opentrackr.org:1337/announce"
          ],
          behaviorHints: { bingeGroup: `yts_${imdb}`, notWebReady: false }
        }));
        return respond(res, { streams });
      }

      // EZTV episode streams — id like eztv_ep_imdb_torrentid
      if (id.startsWith("eztv_ep_")) {
        const parts = id.replace("eztv_ep_", "").split("_");
        const torrentId = parts[parts.length - 1];
        const imdbId = parts.slice(0, parts.length - 1).join("_");
        const url = `https://eztv.re/api/get-torrents?imdb_id=${imdbId}&limit=100`;
        const r = await axios.get(url, { timeout: 8000 });
        const torrents = r.data?.torrents || [];
        const t = torrents.find(x => String(x.id) === torrentId) || torrents[0];
        if (!t) return respond(res, { streams: [] });
        const hash = t.hash?.toLowerCase();
        if (!hash) return respond(res, { streams: [] });
        return respond(res, { streams: [{
          name: "MultiStream",
          title: `${t.title}\n🌱 Seeds: ${t.seeds} | ${(t.size_bytes/1024/1024/1024).toFixed(2)} GB`,
          infoHash: hash,
          sources: [
            "tracker:udp://open.demonii.com:1337/announce",
            "tracker:udp://tracker.openbittorrent.com:80",
            "tracker:udp://tracker.coppersurfer.tk:6969",
            "tracker:udp://tracker.opentrackr.org:1337/announce"
          ],
          behaviorHints: { notWebReady: false }
        }]});
      }

      // EZTV show streams (fallback)
      if (id.startsWith("eztv_")) {
        const imdb = id.replace("eztv_", "");
        const url = `https://eztv.re/api/get-torrents?imdb_id=${imdb}&limit=10`;
        const r = await axios.get(url, { timeout: 8000 });
        const torrents = r.data?.torrents || [];
        const streams = torrents.slice(0, 5).map(t => ({
          name: "MultiStream",
          title: `${t.title}\n🌱 Seeds: ${t.seeds}`,
          infoHash: t.hash?.toLowerCase(),
          sources: ["tracker:udp://tracker.opentrackr.org:1337/announce"],
          behaviorHints: { notWebReady: false }
        })).filter(s => s.infoHash);
        return respond(res, { streams });
      }

      // Nyaa anime streams
      if (id.startsWith("nyaa_")) {
        const hash = id.replace("nyaa_", "").toLowerCase();
        return respond(res, { streams: [{
          name: "MultiStream\nAnime",
          title: "🎌 Nyaa Torrent",
          infoHash: hash,
          sources: [
            "tracker:udp://open.demonii.com:1337/announce",
            "tracker:udp://tracker.opentrackr.org:1337/announce",
            "tracker:http://nyaa.tracker.wf:7777/announce"
          ],
          behaviorHints: { notWebReady: false }
        }]});
      }

    } catch (e) {
      console.error("Stream error:", e.message);
      return respond(res, { streams: [] });
    }

    return respond(res, { streams: [] });
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
};
