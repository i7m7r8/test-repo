const axios = require("axios");

const manifest = {
  id: "community.archivestream.allinone",
  version: "1.0.0",
  name: "ArchiveStream",
  description: "Free legal Movies, TV, Docs from Internet Archive. No account needed.",
  logo: "https://archive.org/images/glogo.png",
  catalogs: [
    { type: "movie",  id: "archive_movies",    name: "Archive Movies",            extra: [{ name: "search" }, { name: "skip" }] },
    { type: "movie",  id: "archive_classics",  name: "Classic Cinema",            extra: [{ name: "search" }, { name: "skip" }] },
    { type: "movie",  id: "archive_bollywood", name: "Bollywood & Indian",        extra: [{ name: "search" }, { name: "skip" }] },
    { type: "series", id: "archive_tv",        name: "TV Shows & Series",         extra: [{ name: "search" }, { name: "skip" }] },
    { type: "series", id: "archive_docs",      name: "Documentaries",             extra: [{ name: "search" }, { name: "skip" }] },
    { type: "series", id: "archive_shorts",    name: "Short Films & Animations",  extra: [{ name: "search" }, { name: "skip" }] }
  ],
  resources: ["catalog", "stream", "meta"],
  types: ["movie", "series"],
  idPrefixes: ["arch_"],
  behaviorHints: { adult: true, p2p: true }
};

const CATALOG_CONFIG = {
  archive_movies:    "mediatype:movies AND subject:feature",
  archive_classics:  "mediatype:movies AND subject:(classic OR noir OR silent OR 1930 OR 1940 OR 1950)",
  archive_bollywood: "mediatype:movies AND (subject:bollywood OR subject:hindi OR subject:indian)",
  archive_tv:        "mediatype:movies AND subject:(television OR sitcom OR episode)",
  archive_docs:      "mediatype:movies AND subject:(documentary OR nature OR history OR science)",
  archive_shorts:    "mediatype:movies AND subject:(short OR animation OR cartoon OR animated)"
};

async function searchArchive(query, skip = 0) {
  const rows = 20;
  const page = Math.floor(skip / rows) + 1;
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=description&fl[]=subject&fl[]=year&sort[]=-downloads&rows=${rows}&page=${page}&output=json`;
  const res = await axios.get(url, { timeout: 10000 });
  return res.data?.response?.docs || [];
}

function buildMeta(doc, type) {
  return {
    id: `arch_${doc.identifier}`,
    type,
    name: doc.title || doc.identifier,
    poster: `https://archive.org/services/img/${doc.identifier}`,
    description: Array.isArray(doc.description) ? doc.description[0] : doc.description || "",
    year: doc.year ? String(doc.year).slice(0, 4) : undefined,
    genres: Array.isArray(doc.subject) ? doc.subject.slice(0, 4) : doc.subject ? [doc.subject] : []
  };
}

function respond(res, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const url = req.url || "/";
  const path = url.split("?")[0];

  // Manifest
  if (path === "/" || path === "/manifest.json") {
    return respond(res, manifest);
  }

  // Catalog: /catalog/:type/:id.json or /catalog/:type/:id/skip=X.json
  const catalogMatch = path.match(/^\/catalog\/([^/]+)\/([^/]+?)(?:\/skip=(\d+))?\.json$/);
  if (catalogMatch) {
    const [, type, id, skip] = catalogMatch;
    const search = new URL("http://x.com" + url).searchParams.get("search") || "";
    const baseQuery = CATALOG_CONFIG[id] || "mediatype:movies";
    const query = search ? `mediatype:movies AND title:(${search})` : baseQuery;
    try {
      const docs = await searchArchive(query, parseInt(skip || 0));
      return respond(res, { metas: docs.map(d => buildMeta(d, type)) });
    } catch (e) {
      return respond(res, { metas: [] });
    }
  }

  // Meta: /meta/:type/:id.json
  const metaMatch = path.match(/^\/meta\/([^/]+)\/(arch_[^/]+?)\.json$/);
  if (metaMatch) {
    const [, type, id] = metaMatch;
    const identifier = id.replace("arch_", "");
    try {
      const r = await axios.get(`https://archive.org/metadata/${identifier}`, { timeout: 8000 });
      const data = r.data?.metadata || {};
      const files = r.data?.files || [];
      const videoFiles = files.filter(f => f.name && /\.(mp4|mkv|avi|ogv|webm|mov)$/i.test(f.name));
      let videos = [];
      if (type === "series" && videoFiles.length > 1) {
        videos = videoFiles.map((f, i) => ({
          id: `arch_${identifier}_ep${i}`,
          title: f.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
          season: 1, episode: i + 1,
          released: new Date().toISOString()
        }));
      }
      const meta = {
        id, type,
        name: Array.isArray(data.title) ? data.title[0] : data.title || identifier,
        poster: `https://archive.org/services/img/${identifier}`,
        background: `https://archive.org/services/img/${identifier}`,
        description: Array.isArray(data.description) ? data.description[0] : data.description || "",
        year: data.year ? String(data.year).slice(0, 4) : undefined,
        genres: Array.isArray(data.subject) ? data.subject.slice(0, 5) : data.subject ? [data.subject] : [],
        website: `https://archive.org/details/${identifier}`,
        ...(videos.length > 0 && { videos })
      };
      return respond(res, { meta });
    } catch (e) {
      return respond(res, { meta: { id, type, name: id } });
    }
  }

  // Stream: /stream/:type/:id.json
  const streamMatch = path.match(/^\/stream\/([^/]+)\/(arch_[^/]+?)\.json$/);
  if (streamMatch) {
    const [, type, id] = streamMatch;
    const parts = id.replace("arch_", "").split("_ep");
    const identifier = parts[0];
    const epIdx = parts[1] ? parseInt(parts[1]) : 0;
    try {
      const r = await axios.get(`https://archive.org/metadata/${identifier}`, { timeout: 8000 });
      const files = r.data?.files || [];
      const videoFiles = files.filter(f => f.name && /\.(mp4|mkv|avi|ogv|webm|mov)$/i.test(f.name));
      if (!videoFiles.length) return respond(res, { streams: [] });
      const targets = type === "series" ? [videoFiles[epIdx] || videoFiles[0]] : videoFiles.slice(0, 5);
      const streams = targets.map(f => ({
        url: `https://archive.org/download/${identifier}/${encodeURIComponent(f.name)}`,
        name: "ArchiveStream",
        title: `${f.name.replace(/\.[^/.]+$/, "")}\n${f.name.split(".").pop().toUpperCase()} • ${f.size ? (parseInt(f.size)/1024/1024).toFixed(0)+" MB" : ""}`,
        behaviorHints: { notWebReady: false, bingeGroup: `arch_${identifier}` }
      }));
      return respond(res, { streams });
    } catch (e) {
      return respond(res, { streams: [] });
    }
  }

  res.setHeader("Content-Type", "application/json");
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Not found" }));
};
