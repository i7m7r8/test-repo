# 🎬 MultiStream — Stremio Addon

A free, self-hosted Stremio addon that provides torrent streams for Movies, TV Shows, Bollywood and Anime. Hosted on Vercel, no sign-up required.

---

## 📦 Install

**One-click install (tap on mobile):**

```
stremio://test-repo-six-sepia.vercel.app/manifest.json
```

**Manual install:**

1. Open Stremio
2. Go to **Addons** → **Install from URL**
3. Paste:
```
https://test-repo-six-sepia.vercel.app/manifest.json
```

---

## 📚 Catalogs

| Category | Content |
|----------|---------|
| 🎬 Hollywood | English movies |
| 🇮🇳 Bollywood & Hindi | Hindi movies |
| 📺 TV Shows | English TV series |
| 🎌 Anime | English subbed anime |

---

## ✨ Features

- 🔍 Search across all categories
- 🖼️ TMDB posters and metadata
- 📺 Full season & episode navigation via IMDB
- 💾 Stream info — file size and seed count shown
- 🌱 Filters out dead torrents (< 5 seeds)
- ⚡ Multiple quality options per title (4K / 1080p / 720p / SD)
- 🎌 Anime via Nyaa.si (English translated)
- 🆓 Completely free, no account needed

---

## 🛠️ Tech Stack

- **Runtime:** Vercel Serverless (Node.js)
- **Sources:** [apibay.org](https://apibay.org) (via proxy), [nyaa.si](https://nyaa.si)
- **Metadata:** [TMDB API](https://themoviedb.org)
- **Framework:** Stremio Addon SDK (custom)

---

## ⚠️ Notes

- Streams are peer-to-peer torrents — playback depends on available seeds
- For best results use a **VPN**
- Works best on WiFi for large files
- Pairs well with [Torrentio](https://torrentio.strem.fun) for more sources

---

## 📄 License

MIT — free to use, modify and self-host.
