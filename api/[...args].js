const axios = require("axios");

const manifest = {
  id: "community.multistream.v4",
  version: "4.0.0",
  name: "MultiStream",
  description: "TV Shows & Anime — EZTV + Nyaa. Torrent streams directly in Stremio.",
  logo: "https://i.imgur.com/uwDqNDd.png",
  catalogs: [
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
  types: ["series"],
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

function cleanTitle(name) {
  return name
    .replace(/S\d+E\d+.*/i, "")
    .replace(/\(?\d{4}\)?/, "")
    .replace(/1080p|720p|480p|4K|2160p|BluRay|WEBRip|WEB-DL|HDTV|DVDRip|x264|x265|HEVC|AAC|DD5\.1|ESub|EZTV|YIFY/gi, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[-._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── EZTV ──────────────────────────────────────────────────────
async function eztvSearch(query, skip = 0) {
  const page = Math.floor(skip / 20) + 1;
  let url;
  if (query) {
    url = `https://eztvx.to/api/get-torrents?limit=20&page=${page}&imdb_id=0`;
    // EZTV API doesn't support name search — use all torrents and filter
    url = `https://eztvx.to/api/get-torrents?limit=100&page=${page}`;
  } else {
    url = `https://eztvx.to/api/get-torrents?limit=20&page=${page}`;
  }
  const res = await axios.get(url, { timeout: 10000 });
  let torrents = res.data?.torrents || [];
  if (query) {
    const q = query.toLowerCase();
    torrents = torrents.filter(t => t.title?.toLowerCase().includes(q));
  }
  return torrents.slice(0, 20);
}

function eztvToMeta(t) {
  const title = cleanTitle(t.title || "");
  return {
    id: `ms_eztv_${t.imdb_id || t.id}`,
    type: "series",
    name: title || t.title,
    poster: t.small_screenshot || `https://via.placeholder.com/300x450/1a1a2e/818cf8?text=${encodeURIComponent((title || "TV").slice(0, 15))}`,
    description: `Seeds: ${t.seeds} | ${sizeStr(t.size_bytes)}`,
    year: t.title?.match(/\b(19|20)\d{2}\b/)?.[0] || ""
  };
}

// ── NYAA ──────────────────────────────────────────────────────
async function nyaaSearch(query, skip = 0) {
  const page = Math.floor(skip / 20);
  const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(query || "anime")}&c=1_0&f=0&p=${page}`;
  const res = await axios.get(url, { timeout: 10000 });
  const items = [];
  const matches = res.data.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const m of matches) {
    const block = m[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
                || block.match(/<title>(.*?)<\/title>/)?.[1] || "";
    const magnet = block.match(/<nyaa:magnetURI><!\[CDATA\[(.*?)\]\]><\/nyaa:magnetURI>/)?.[1] || "";
    const hash = magnet.match(/btih:([a-fA-F0-9]{40})/i)?.[1]?.toLowerCase() || "";
    const size = block.match(/<nyaa:size>(.*?)<\/nyaa:size>/)?.[1] || "";
    const seeders = block.match(/<nyaa:seeders>(.*?)<\/nyaa:seeders>/)?.[1] || "0";
    if (title && hash) items.push({ title, hash, size, seeders });
    if (items.length >= 20) break;
  }
  return items;
}

function nyaaToMeta(item) {
  const name = cleanTitle(
    item.title.replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "").split(" - ")[0].trim()
  );
  return {
    id: `ms_nyaa_${item.hash}`,
    type: "series",
    name: name || item.title,
    poster: `https://via.placeholder.com/300x450/1a1a2e/e879f9?text=${encodeURIComponent((name || "Anime").slice(0, 15))}`,
    description: `${item.title}\nSeeds: ${item.seeders} | ${item.size}`,
    genres: ["Anime"]
  };
}

// ── MAIN ──────────────────────────────────────────────────────
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

    try {
      if (id === "ms_tvshows") {
        const torrents = await eztvSearch(search, skip);
        const seen = new Set();
        const metas = [];
        for (const t of torrents) {
          const m = eztvToMeta(t);
          if (!seen.has(m.name.toLowerCase())) {
            seen.add(m.name.toLowerCase());
            metas.push(m);
          }
        }
        return respond(res, { metas });
      }

      if (id === "ms_anime") {
        const items = await nyaaSearch(search, skip);
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
    } catch (e) {
      console.error("Catalog error:", e.message);
      return respond(res, { metas: [] });
    }

    return respond(res, { metas: [] });
  }

  // META
  const metaMatch = path.match(/^\/meta\/([^/]+)\/(ms_[^/]+?)\.json$/);
  if (metaMatch) {
    const [, type, id] = metaMatch;

    if (id.startsWith("ms_eztv_")) {
      const imdbId = id.replace("ms_eztv_", "");
      try {
        const url = `https://eztvx.to/api/get-torrents?imdb_id=${imdbId}&limit=100`;
        const r = await axios.get(url, { timeout: 8000 });
        const torrents = r.data?.torrents || [];
        if (!torrents.length) return respond(res, { meta: { id, type, name: id } });
        const name = cleanTitle(torrents[0].title || "");
        const seen = new Set();
        const videos = [];
        for (const t of torrents) {
          const epMatch = t.title?.match(/S(\d+)E(\d+)/i);
          const epKey = epMatch ? `${epMatch[1]}x${epMatch[2]}` : t.id;
          if (!seen.has(epKey)) {
            seen.add(epKey);
            videos.push({
              id: `ms_eztv_ep_${t.hash?.toLowerCase() || t.id}`,
              title: t.title || `Episode`,
              season: epMatch ? parseInt(epMatch[1]) : 1,
              episode: epMatch ? parseInt(epMatch[2]) : videos.length + 1,
              released: t.date_released_unix
                ? new Date(t.date_released_unix * 1000).toISOString()
                : new Date().toISOString()
            });
          }
        }
        return respond(res, { meta: { id, type, name, videos } });
      } catch (e) {
        return respond(res, { meta: { id, type, name: id } });
      }
    }

    if (id.startsWith("ms_nyaa_")) {
      const name = id.replace("ms_nyaa_", "");
      return respond(res, { meta: { id, type, name, genres: ["Anime"] } });
    }

    return respond(res, { meta: { id, type, name: id } });
  }

  // STREAM
  const streamMatch = path.match(/^\/stream\/([^/]+)\/(ms_[^/]+?)\.json$/);
  if (streamMatch) {
    const [, type, id] = streamMatch;

    // EZTV episode stream
    if (id.startsWith("ms_eztv_ep_")) {
      const hash = id.replace("ms_eztv_ep_", "").toLowerCase();
      return respond(res, {
        streams: [{
          name: "MultiStream\nTV",
          title: "📺 Stream",
          infoHash: hash,
          sources: TRACKERS,
          behaviorHints: { notWebReady: false }
        }]
      });
    }

    // EZTV show — return latest episodes
    if (id.startsWith("ms_eztv_")) {
      const imdbId = id.replace("ms_eztv_", "");
      try {
        const url = `https://eztvx.to/api/get-torrents?imdb_id=${imdbId}&limit=5`;
        const r = await axios.get(url, { timeout: 8000 });
        const torrents = r.data?.torrents || [];
        const streams = torrents
          .filter(t => t.hash)
          .map(t => ({
            name: `MultiStream\n${qualityFromName(t.title)}`,
            title: `${t.title}\n🌱 ${t.seeds} seeds | ${sizeStr(t.size_bytes)}`,
            infoHash: t.hash.toLowerCase(),
            sources: TRACKERS,
            behaviorHints: { notWebReady: false }
          }));
        return respond(res, { streams });
      } catch (e) {
        return respond(res, { streams: [] });
      }
    }

    // Nyaa stream
    if (id.startsWith("ms_nyaa_")) {
      const hash = id.replace("ms_nyaa_", "").toLowerCase();
      return respond(res, {
        streams: [{
          name: "MultiStream\nAnime",
          title: "🎌 Nyaa Stream",
          infoHash: hash,
          sources: TRACKERS,
          behaviorHints: { notWebReady: false }
        }]
      });
    }

    return respond(res, { streams: [] });
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
};
