// ============================================================
// YouTube AI Algorithm Idea Checker — Backend API
// Node.js + Express
//
// Required env vars (.env):
//   YOUTUBE_API_KEY=...      ← Google Cloud Console → YouTube Data API v3
//   ANTHROPIC_API_KEY=...    ← console.anthropic.com
//
// Install:  npm install express axios dotenv cors
// Run:      node backend.js
// ============================================================

import express from "express";
import axios from "axios";
import cors from "cors";
import "dotenv/config";

const app = express();
app.use(express.json());
app.use(cors());

const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const YT_BASE = "https://www.googleapis.com/youtube/v3";

// ─────────────────────────────────────────────
// HELPER: Parse channel handle / URL → channel ID
// Supports:
//   https://www.youtube.com/@MrBeast
//   https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA
//   @MrBeast
// ─────────────────────────────────────────────
async function resolveChannelId(input) {
  // Already a raw channel ID
  if (/^UC[\w-]{22}$/.test(input)) return input;

  // Extract from full URL
  const channelMatch = input.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
  if (channelMatch) return channelMatch[1];

  // Handle-based URL or bare @handle
  const handle = input.match(/@([\w.-]+)/)?.[1] || input.replace(/^@/, "");

  // API CALL 1 — Search for channel by handle
  const { data } = await axios.get(`${YT_BASE}/search`, {
    params: {
      part: "snippet",
      type: "channel",
      q: handle,
      maxResults: 1,
      key: YT_API_KEY,
    },
  });

  const id = data.items?.[0]?.snippet?.channelId;
  if (!id) throw new Error(`Channel not found for: ${input}`);
  return id;
}

// ─────────────────────────────────────────────
// HELPER: Fetch channel-level statistics
// API CALL 2 — channels.list
// Returns: title, subscriberCount, viewCount, videoCount
// ─────────────────────────────────────────────
async function getChannelStats(channelId) {
  const { data } = await axios.get(`${YT_BASE}/channels`, {
    params: {
      part: "snippet,statistics,brandingSettings",
      id: channelId,
      key: YT_API_KEY,
    },
  });

  const ch = data.items?.[0];
  if (!ch) throw new Error("Channel data not found");

  return {
    title: ch.snippet.title,
    description: ch.snippet.description,
    country: ch.snippet.country,
    publishedAt: ch.snippet.publishedAt,
    subscriberCount: parseInt(ch.statistics.subscriberCount || 0),
    totalViews: parseInt(ch.statistics.viewCount || 0),
    videoCount: parseInt(ch.statistics.videoCount || 0),
    keywords: ch.brandingSettings?.channel?.keywords || "",
  };
}

// ─────────────────────────────────────────────
// HELPER: Fetch the channel's most recent videos
// API CALL 3 — search.list (uploads by channel)
// Returns: up to `maxResults` video IDs + basic snippets
// ─────────────────────────────────────────────
async function getRecentVideoIds(channelId, maxResults = 20) {
  const { data } = await axios.get(`${YT_BASE}/search`, {
    params: {
      part: "id,snippet",
      channelId,
      type: "video",
      order: "date",
      maxResults,
      key: YT_API_KEY,
    },
  });

  return data.items.map((item) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    publishedAt: item.snippet.publishedAt,
    description: item.snippet.description.slice(0, 200),
  }));
}

// ─────────────────────────────────────────────
// HELPER: Fetch detailed stats for a batch of videos
// API CALL 4 — videos.list
// Returns: views, likes, comments, duration, tags per video
// ─────────────────────────────────────────────
async function getVideoStats(videoIds) {
  const ids = videoIds.join(",");
  const { data } = await axios.get(`${YT_BASE}/videos`, {
    params: {
      part: "statistics,contentDetails,snippet",
      id: ids,
      key: YT_API_KEY,
    },
  });

  return data.items.map((v) => ({
    videoId: v.id,
    title: v.snippet.title,
    publishedAt: v.snippet.publishedAt,
    tags: v.snippet.tags || [],
    duration: v.contentDetails.duration, // ISO 8601 e.g. PT12M4S
    views: parseInt(v.statistics.viewCount || 0),
    likes: parseInt(v.statistics.likeCount || 0),
    comments: parseInt(v.statistics.commentCount || 0),
  }));
}

// ─────────────────────────────────────────────
// HELPER: Fetch the channel's top-performing videos
// API CALL 5 — search.list ordered by viewCount
// Gives us a sense of what content "pops" on this channel
// ─────────────────────────────────────────────
async function getTopVideos(channelId, maxResults = 10) {
  const { data } = await axios.get(`${YT_BASE}/search`, {
    params: {
      part: "id,snippet",
      channelId,
      type: "video",
      order: "viewCount",
      maxResults,
      key: YT_API_KEY,
    },
  });

  const ids = data.items.map((i) => i.id.videoId);
  return getVideoStats(ids); // reuse Call 4
}

// ─────────────────────────────────────────────
// HELPER: Ask Claude to rate the idea
// API CALL 6 — Anthropic /v1/messages
// ─────────────────────────────────────────────
async function analyzeIdeaWithClaude(channelData, recentVideos, topVideos, videoIdea) {
  const avgViews =
    recentVideos.reduce((s, v) => s + v.views, 0) / (recentVideos.length || 1);

  const prompt = `
You are an expert YouTube growth strategist and algorithm analyst.

## Channel Profile
- Name: ${channelData.title}
- Subscribers: ${channelData.subscriberCount.toLocaleString()}
- Total Views: ${channelData.totalViews.toLocaleString()}
- Total Videos: ${channelData.videoCount}
- Channel Keywords: ${channelData.keywords}
- Country: ${channelData.country || "unknown"}

## Recent Video Performance (last 20 videos — avg ${Math.round(avgViews).toLocaleString()} views)
${recentVideos
  .slice(0, 10)
  .map(
    (v) =>
      `- "${v.title}" → ${v.views.toLocaleString()} views, ${v.likes.toLocaleString()} likes, ${v.comments.toLocaleString()} comments`
  )
  .join("\n")}

## Top Performing Videos (all time)
${topVideos
  .slice(0, 5)
  .map(
    (v) =>
      `- "${v.title}" → ${v.views.toLocaleString()} views`
  )
  .join("\n")}

## Proposed New Video Idea
"${videoIdea}"

## Your Task
Analyze how well this idea fits the channel's audience, niche, and YouTube algorithm patterns.

Respond ONLY with a JSON object (no markdown, no extra text) with these fields:
{
  "overallScore": <number 1-10>,
  "algorithmScore": <number 1-10>,
  "audienceFitScore": <number 1-10>,
  "trendScore": <number 1-10>,
  "verdict": "<one of: 'Strong Upload', 'Good Idea', 'Needs Tweaking', 'Risky', 'Skip It'>",
  "summary": "<2-3 sentence plain-English verdict>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>"],
  "suggestions": ["<actionable improvement 1>", "<actionable improvement 2>", "<actionable improvement 3>"],
  "estimatedViewsVsAverage": "<e.g. '+40% above channel average' or '-20% below channel average'>",
  "bestTitleSuggestion": "<optimized YouTube title for this idea>",
  "thumbnailTip": "<one key thumbnail strategy for this idea>"
}
`.trim();

  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    }
  );

  const raw = response.data.content[0].text.trim();
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

// ─────────────────────────────────────────────
// MAIN ENDPOINT
// POST /analyze
// Body: { channelUrl: string, videoIdea: string }
// ─────────────────────────────────────────────
app.post("/analyze", async (req, res) => {
  const { channelUrl, videoIdea } = req.body;

  if (!channelUrl || !videoIdea) {
    return res.status(400).json({ error: "channelUrl and videoIdea are required" });
  }

  try {
    // Step 1 — Resolve channel
    const channelId = await resolveChannelId(channelUrl);

    // Steps 2–5 — Fetch channel data in parallel where possible
    const [channelStats, recentVideoMeta, topVideos] = await Promise.all([
      getChannelStats(channelId),                  // Call 2
      getRecentVideoIds(channelId, 20),            // Call 3
      getTopVideos(channelId, 10),                 // Call 5
    ]);

    // Call 4 — enrich recent videos with full stats
    const recentVideoIds = recentVideoMeta.map((v) => v.videoId);
    const recentVideos = await getVideoStats(recentVideoIds);

    // Call 6 — Claude analysis
    const analysis = await analyzeIdeaWithClaude(
      channelStats,
      recentVideos,
      topVideos,
      videoIdea
    );

    res.json({
      channel: {
        id: channelId,
        title: channelStats.title,
        subscribers: channelStats.subscriberCount,
        totalViews: channelStats.totalViews,
        videoCount: channelStats.videoCount,
      },
      idea: videoIdea,
      analysis,
    });
  } catch (err) {
    console.error(err?.response?.data || err.message);
    res.status(500).json({ error: err.message || "Analysis failed" });
  }
});

// ─────────────────────────────────────────────
// BONUS ENDPOINT: Quick channel preview (no idea needed)
// GET /channel?url=@MrBeast
// ─────────────────────────────────────────────
app.get("/channel", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url param required" });

  try {
    const channelId = await resolveChannelId(url);
    const stats = await getChannelStats(channelId);
    res.json({ channelId, ...stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log("✅ Server running on http://localhost:3001"));
