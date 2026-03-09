// api/stream-proxy.js  — drop this into your Vercel addon repo as /api/stream-proxy.js
// It fetches any URL server-side and relays it with CORS headers.
// Video.js calls: GET /api/stream-proxy?url=<encoded_url>
// Supports range requests for seeking/scrubbing.

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    res.status(400).json({ error: "url param required" });
    return;
  }

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(url);
    new URL(targetUrl); // validate
  } catch {
    res.status(400).json({ error: "invalid url" });
    return;
  }

  // Block non-http(s) and localhost
  if (!/^https?:\/\//i.test(targetUrl) || /localhost|127\.|0\.0\.0\.0/i.test(targetUrl)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };

  // Forward Range header for seek support
  if (req.headers["range"]) {
    headers["Range"] = req.headers["range"];
  }

  try {
    const upstream = await fetch(targetUrl, { headers, redirect: "follow" });

    // CORS headers — allow your site to fetch this
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

    // Forward relevant response headers
    const forward = ["content-type","content-length","content-range","accept-ranges","last-modified","etag"];
    forward.forEach(h => {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    });

    res.status(upstream.status);

    // Stream body directly
    if (upstream.body) {
      const reader = upstream.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); return; }
          res.write(Buffer.from(value));
        }
      };
      await pump();
    } else {
      res.end();
    }
  } catch (err) {
    res.status(502).json({ error: "upstream failed", detail: err.message });
  }
}

export const config = {
  api: {
    responseLimit: false,    // allow large video files
    bodyParser: false,
  },
};
