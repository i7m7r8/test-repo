const { addonBuilder } = require("stremio-addon-sdk");
const getRouter = require("stremio-addon-sdk/src/express");
const axios = require("axios");

// ============================================================
// 📦 MANIFEST — All content types declared
// ============================================================
const manifest = {
  id: "community.archivestream.allinone",
  version: "1.0.0",
  name: "ArchiveStream",
  description: "🎬 Massive free legal collection — Movies, TV Series, Documentaries, Classics & more from Internet Archive and public domain sources. No account, no cost, no hassle.",
  logo: "https://archive.org/images/glogo.png",
  background: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Internet_Archive_logo_and_wordmark.svg/1200px-Internet_Archive_logo_and_wordmark.svg.png",
  catalogs: [
    {
      type: "movie",
      id: "archive_movies",
      name: "🎬 Archive Movies",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    },
    {
      type: "movie",
      id: "archive_classics",
      name: "🎥 Classic Cinema",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    },
    {
      type: "movie",
      id: "archive_bollywood",
      name: "🇮🇳 Bollywood & Indian",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    },
    {
      type: "series",
      id: "archive_tv",
      name: "📺 TV Shows & Series",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    },
    {
      type: "series",
      id: "archive_docs",
      name: "📽️ Documentaries",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    },
    {
      type: "series",
      id: "archive_shorts",
      name: "🎞️ Short Films & Animations",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    }
  ],
  resources: ["catalog", "stream", "meta"],
  types: ["movie", "series"],
  idPrefixes: ["arch_"],
  behaviorHints: { adult: false, p2p: false }
};

const builder = new addonBuilder(manifest);

// ============================================================
// 🔧 ARCHIVE.ORG SEARCH HELPER
// ============================================================
const ARCHIVE_API = "https://archive.org";

// Map catalog ID to Archive.org search params
const CATALOG_CONFIG = {
  archive_movies: {
    query: "mediatype:movies AND subject:feature",
    sort: "-downloads",
    label: "Movies"
  },
  archive_classics: {
    query: "mediatype:movies AND subject:(classic OR noir OR silent OR 1930 OR 1940 OR 1950)",
    sort: "-downloads",
    label: "Classic Cinema"
  },
  archive_bollywood: {
    query: "mediatype:movies AND (subject:bollywood OR subject:hindi OR subject:indian)",
    sort: "-downloads",
    label: "Bollywood & Indian"
  },
  archive_tv: {
    query: "mediatype:movies AND subject:(television OR TV series OR sitcom OR episode)",
    sort: "-downloads",
    label: "TV Shows"
  },
  archive_docs: {
    query: "mediatype:movies AND subject:(documentary OR nature OR history OR science)",
    sort: "-downloads",
    label: "Documentaries"
  },
  archive_shorts: {
    query: "mediatype:movies AND subject:(short OR animation OR cartoon OR animated)",
    sort: "-downloads",
    label: "Short Films"
  }
};

async function searchArchive({ query, sort = "-downloads", skip = 0, rows = 20 }) {
  try {
    const page = Math.floor(skip / rows) + 1;
    const url = `${ARCHIVE_API}/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=description&fl[]=subject&fl[]=year&fl[]=downloads&fl[]=thumb&sort[]=${sort}&rows=${rows}&page=${page}&output=json&mediatype=movies`;

    const res = await axios.get(url, { timeout: 10000 });
    return res.data?.response?.docs || [];
  } catch (err) {
    console.error("Archive search error:", err.message);
    return [];
  }
}

// Build Stremio meta object from Archive doc
function buildMeta(doc, type = "movie") {
  const id = `arch_${doc.identifier}`;
  const poster = doc.identifier
    ? `https://archive.org/services/img/${doc.identifier}`
    : "https://archive.org/images/glogo.png";

  return {
    id,
    type,
    name: doc.title || doc.identifier,
    poster,
    description: Array.isArray(doc.description)
      ? doc.description[0]
      : doc.description || "",
    year: doc.year ? String(doc.year).slice(0, 4) : undefined,
    genres: Array.isArray(doc.subject)
      ? doc.subject.slice(0, 4)
      : doc.subject
      ? [doc.subject]
      : []
  };
}

// ============================================================
// 📋 CATALOG HANDLER
// ============================================================
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  console.log(`📋 Catalog: type=${type} id=${id}`);
  const skip = parseInt(extra?.skip || 0);
  const search = extra?.search || "";

  const config = CATALOG_CONFIG[id];
  if (!config) return { metas: [] };

  // Build query — use search term if provided
  const query = search
    ? `mediatype:movies AND title:(${search}) OR description:(${search})`
    : config.query;

  const docs = await searchArchive({ query, sort: config.sort, skip });
  const metas = docs.map(doc => buildMeta(doc, type));

  return { metas };
});

// ============================================================
// 🔎 META HANDLER
// ============================================================
builder.defineMetaHandler(async ({ type, id }) => {
  console.log(`🔎 Meta: type=${type} id=${id}`);
  const identifier = id.replace("arch_", "");

  try {
    const url = `${ARCHIVE_API}/metadata/${identifier}`;
    const res = await axios.get(url, { timeout: 8000 });
    const data = res.data?.metadata || {};

    const poster = `https://archive.org/services/img/${identifier}`;
    const description = Array.isArray(data.description)
      ? data.description[0]
      : data.description || "";

    // Build videos list if it's a series (multiple files)
    const files = res.data?.files || [];
    const videoFiles = files.filter(f =>
      f.name && /\.(mp4|mkv|avi|ogv|webm|mov)$/i.test(f.name)
    );

    let videos = [];
    if (type === "series" && videoFiles.length > 1) {
      videos = videoFiles.map((f, i) => ({
        id: `arch_${identifier}_${i}`,
        title: f.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
        season: 1,
        episode: i + 1,
        released: new Date(f.mtime * 1000 || Date.now()).toISOString()
      }));
    }

    const meta = {
      id,
      type,
      name: Array.isArray(data.title) ? data.title[0] : data.title || identifier,
      poster,
      background: poster,
      description,
      year: data.year ? String(data.year).slice(0, 4) : undefined,
      genres: Array.isArray(data.subject)
        ? data.subject.slice(0, 5)
        : data.subject
        ? [data.subject]
        : [],
      website: `https://archive.org/details/${identifier}`,
      ...(videos.length > 0 && { videos })
    };

    return { meta };
  } catch (err) {
    console.error("Meta error:", err.message);
    return { meta: { id, type, name: id } };
  }
});

// ============================================================
// 🎬 STREAM HANDLER
// ============================================================
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`🎬 Stream: type=${type} id=${id}`);

  // Handle episode IDs like arch_identifier_2
  const parts = id.replace("arch_", "").split("_");
  const fileIdx = parts.length > 1 && !isNaN(parts[parts.length - 1])
    ? parseInt(parts.pop())
    : 0;
  const identifier = parts.join("_");

  try {
    const url = `${ARCHIVE_API}/metadata/${identifier}`;
    const res = await axios.get(url, { timeout: 8000 });
    const files = res.data?.files || [];

    // Get all streamable video files
    const videoFiles = files.filter(f =>
      f.name && /\.(mp4|mkv|avi|ogv|webm|mov)$/i.test(f.name)
    );

    if (videoFiles.length === 0) {
      console.log("⚠️ No video files found for:", identifier);
      return { streams: [] };
    }

    // For series/episodes — return specific file
    // For movies — return all quality options
    const targetFiles = type === "series"
      ? [videoFiles[fileIdx] || videoFiles[0]]
      : videoFiles.slice(0, 5); // max 5 quality options for movies

    const streams = targetFiles.map(f => {
      const streamUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(f.name)}`;
      const size = f.size
        ? `${(parseInt(f.size) / 1024 / 1024).toFixed(0)} MB`
        : "Unknown size";
      const ext = f.name.split(".").pop().toUpperCase();

      return {
        url: streamUrl,
        name: "ArchiveStream",
        title: `📁 ${f.name.replace(/\.[^/.]+$/, "")}\n${ext} • ${size}`,
        behaviorHints: {
          notWebReady: false,
          bingeGroup: `arch_${identifier}`
        }
      };
    });

    console.log(`✅ Found ${streams.length} streams for ${identifier}`);
    return { streams };

  } catch (err) {
    console.error("Stream error:", err.message);
    return { streams: [] };
  }
});

// ============================================================
// 🚀 VERCEL SERVERLESS EXPORT
// ============================================================
const router = getRouter(builder.getInterface());

module.exports = (req, res) => {
  // CORS headers — required for Stremio
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  router(req, res);
};
