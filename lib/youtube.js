// YouTube Data API v3 helper.
// Given a channel URL, returns { id, handle, title, description, thumbnail,
// subscribers, totalViews, videoCount, recentVideos: [{title, views, publishedAt}] }
//
// Set YOUTUBE_API_KEY in .env.local to enable. Falls back to null on any failure.

const API = "https://www.googleapis.com/youtube/v3";

export async function fetchChannelInfo(channelUrl) {
  if (!process.env.YOUTUBE_API_KEY) return null;
  if (!channelUrl) return null;

  try {
    const ident = parseChannelUrl(channelUrl);
    if (!ident) return null;

    const channel = await resolveChannel(ident);
    if (!channel) return null;

    const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
    const recentVideos = uploadsId ? await fetchRecentVideos(uploadsId) : [];

    return {
      id: channel.id,
      handle: channel.snippet?.customUrl || ident.handle || null,
      title: channel.snippet?.title || null,
      description: truncate(channel.snippet?.description || "", 400),
      thumbnail:
        channel.snippet?.thumbnails?.medium?.url ||
        channel.snippet?.thumbnails?.default?.url ||
        null,
      subscribers: toInt(channel.statistics?.subscriberCount),
      totalViews: toInt(channel.statistics?.viewCount),
      videoCount: toInt(channel.statistics?.videoCount),
      country: channel.snippet?.country || null,
      recentVideos,
    };
  } catch (err) {
    console.error("[youtube] fetchChannelInfo failed:", err.message);
    return null;
  }
}

/* ---------- URL parsing ---------- */

export function parseChannelUrl(url) {
  let u;
  try {
    u = new URL(url.trim());
  } catch {
    // maybe it's a bare handle like "@mkbhd" or "mkbhd"
    const bare = url.trim().replace(/^@/, "");
    if (bare && /^[\w.\-]+$/.test(bare)) return { handle: bare };
    return null;
  }

  // youtu.be/<videoId> is not a channel — skip
  if (u.hostname.includes("youtu.be")) return null;

  const path = u.pathname.replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean);

  if (!parts.length) return null;

  // /@handle or /@handle/anything
  if (parts[0].startsWith("@")) {
    return { handle: parts[0].slice(1) };
  }
  // /channel/UCxxxx
  if (parts[0] === "channel" && parts[1]) {
    return { id: parts[1] };
  }
  // /user/username  (legacy)
  if (parts[0] === "user" && parts[1]) {
    return { username: parts[1] };
  }
  // /c/customname  (no direct API; we'll search)
  if (parts[0] === "c" && parts[1]) {
    return { custom: parts[1] };
  }

  return null;
}

/* ---------- Resolve identifier → channel object ---------- */

async function resolveChannel(ident) {
  const parts = "snippet,statistics,contentDetails";

  if (ident.id) {
    return firstChannel(
      `${API}/channels?part=${parts}&id=${encodeURIComponent(ident.id)}&key=${key()}`
    );
  }
  if (ident.handle) {
    const ch = await firstChannel(
      `${API}/channels?part=${parts}&forHandle=@${encodeURIComponent(ident.handle)}&key=${key()}`
    );
    if (ch) return ch;
    // fall through to search if forHandle isn't accepted (older keys)
    return searchChannel(ident.handle);
  }
  if (ident.username) {
    const ch = await firstChannel(
      `${API}/channels?part=${parts}&forUsername=${encodeURIComponent(ident.username)}&key=${key()}`
    );
    if (ch) return ch;
    return searchChannel(ident.username);
  }
  if (ident.custom) {
    return searchChannel(ident.custom);
  }
  return null;
}

async function searchChannel(q) {
  // search.list is expensive (100 quota units); only used as a fallback.
  const searchRes = await fetchJson(
    `${API}/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(q)}&key=${key()}`
  );
  const id = searchRes?.items?.[0]?.snippet?.channelId || searchRes?.items?.[0]?.id?.channelId;
  if (!id) return null;
  return firstChannel(
    `${API}/channels?part=snippet,statistics,contentDetails&id=${id}&key=${key()}`
  );
}

async function firstChannel(url) {
  const data = await fetchJson(url);
  return data?.items?.[0] || null;
}

/* ---------- Recent videos via uploads playlist ---------- */

async function fetchRecentVideos(uploadsPlaylistId) {
  const playlist = await fetchJson(
    `${API}/playlistItems?part=contentDetails&maxResults=8&playlistId=${uploadsPlaylistId}&key=${key()}`
  );
  const videoIds = (playlist?.items || [])
    .map((it) => it?.contentDetails?.videoId)
    .filter(Boolean);
  if (!videoIds.length) return [];

  const stats = await fetchJson(
    `${API}/videos?part=snippet,statistics&id=${videoIds.join(",")}&key=${key()}`
  );

  return (stats?.items || []).map((v) => ({
    title: v?.snippet?.title || "",
    views: toInt(v?.statistics?.viewCount),
    publishedAt: v?.snippet?.publishedAt || null,
  }));
}

/* ---------- helpers ---------- */

function key() {
  return process.env.YOUTUBE_API_KEY;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function toInt(v) {
  if (v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/* ---------- Competitive lookup ---------- */
// Searches YouTube for videos similar to the idea, then fetches their view counts.
// Returns up to 6 sanitized entries. Costs ~100 quota units per call (search.list).

export async function fetchSimilarVideos(query, max = 6) {
  if (!process.env.YOUTUBE_API_KEY) return null;
  if (!query || !query.trim()) return null;

  try {
    // Use a shortened query — long full ideas dilute the search.
    const q = shortenQuery(query);

    const search = await fetchJson(
      `${API}/search?part=snippet&type=video&maxResults=${max}&order=relevance&q=${encodeURIComponent(
        q
      )}&key=${key()}`
    );
    const items = search?.items || [];
    const ids = items.map((it) => it?.id?.videoId).filter(Boolean);
    if (!ids.length) return [];

    const stats = await fetchJson(
      `${API}/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}&key=${key()}`
    );

    return (stats?.items || [])
      .map((v) => ({
        id: v.id,
        title: v?.snippet?.title || "",
        channel: v?.snippet?.channelTitle || "",
        views: toInt(v?.statistics?.viewCount),
        likes: toInt(v?.statistics?.likeCount),
        publishedAt: v?.snippet?.publishedAt || null,
        thumbnail:
          v?.snippet?.thumbnails?.medium?.url ||
          v?.snippet?.thumbnails?.default?.url ||
          null,
        url: `https://youtube.com/watch?v=${v.id}`,
      }))
      .filter((v) => v.title && v.views != null)
      .sort((a, b) => (b.views || 0) - (a.views || 0));
  } catch (err) {
    console.error("[youtube] fetchSimilarVideos failed:", err.message);
    return null;
  }
}

function shortenQuery(s) {
  // Keep the first 8-ish meaningful words.
  return s
    .replace(/["']/g, "")
    .split(/\s+/)
    .slice(0, 9)
    .join(" ")
    .slice(0, 100);
}

export function formatSubs(n) {
  if (n == null) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "K";
  return String(n);
}
