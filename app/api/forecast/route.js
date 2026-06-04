// AI forecast endpoint.
// Supports OpenRouter (free models) or OpenAI directly. Auto-detects which one is
// configured. Falls back to a deterministic mock if neither is set or the call fails.
//
// Provider selection:
//   - If OPENROUTER_API_KEY is set → use OpenRouter (recommended; has free models).
//   - Else if OPENAI_API_KEY is set → use OpenAI directly.
//   - Else → mock.

import { mockForecast } from "./mock";
import { fetchChannelInfo, fetchSimilarVideos, formatSubs } from "@/lib/youtube";
import { analyzeTitleHoiles, combineHoilesScore } from "@/lib/hoiles";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROVIDER = process.env.OPENROUTER_API_KEY
  ? "openrouter"
  : process.env.OPENAI_API_KEY
  ? "openai"
  : null;

// Text-only models — tried when no thumbnail is uploaded.
const FREE_MODEL_FALLBACKS = [
  "openai/gpt-oss-20b:free",
  "z-ai/glm-4.5-air:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "moonshotai/kimi-k2.6:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "openai/gpt-oss-120b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

// Vision-capable models — used when a thumbnail image is uploaded.
// These are verified text+image models on OpenRouter's free tier.
const FREE_VISION_MODEL_FALLBACKS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "moonshotai/kimi-k2.6:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
];

// Set of all known vision-capable models we'll accept as user overrides
// when an image is present. Anything else gets ignored.
const VISION_MODEL_ALLOWLIST = new Set(FREE_VISION_MODEL_FALLBACKS);

function modelListFor({ vision }) {
  if (PROVIDER === "openrouter") {
    const env = (process.env.OPENROUTER_MODEL || "").trim();
    const userList = env ? env.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const base = vision ? FREE_VISION_MODEL_FALLBACKS : FREE_MODEL_FALLBACKS;
    if (vision) {
      // CRITICAL: when an image is uploaded we must only try vision-capable
      // models. A text-only model receiving an image will silently ignore it
      // and hallucinate a description. Filter user overrides accordingly.
      const filteredUser = userList.filter((m) => VISION_MODEL_ALLOWLIST.has(m));
      return Array.from(new Set([...filteredUser, ...base]));
    }
    return Array.from(new Set([...userList, ...base]));
  }
  return [process.env.OPENAI_MODEL || "gpt-4o-mini"];
}

const ENDPOINT =
  PROVIDER === "openrouter"
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";

const API_KEY =
  PROVIDER === "openrouter"
    ? process.env.OPENROUTER_API_KEY
    : process.env.OPENAI_API_KEY;

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const {
    channel = "",
    idea = "",
    niche = "Other",
    length = "8-12",
    audience = "",
    reroll = false,
    thumbnail = null, // optional base64 data URL: "data:image/png;base64,...."
    thumbnailContrast = null, // optional 0-1 RMS contrast measured client-side
  } = body;

  if (!channel || !idea) {
    return json({ error: "channel and idea are required" }, 400);
  }

  // Reject oversized images early (data URL ~33% bigger than the binary).
  if (thumbnail && typeof thumbnail === "string" && thumbnail.length > 7_000_000) {
    return json({ error: "thumbnail too large (max ~5MB)" }, 413);
  }

  const hasThumbnail = !!thumbnail && /^data:image\//i.test(thumbnail);

  // --- Hoiles et al. (2017) meta-feature analysis ---
  // Compute server-side measurable features that the paper identified as the
  // strongest pre-upload predictors of view count. These are deterministic
  // numbers we hand to the AI as evidence, so the score isn't pure vibes.
  const titleAnalysis = analyzeTitleHoiles(idea);
  const metaScore = combineHoilesScore(
    titleAnalysis,
    typeof thumbnailContrast === "number" ? thumbnailContrast : null
  );

  const [channelInfo, similarVideos] = await Promise.all([
    fetchChannelInfo(channel),
    fetchSimilarVideos(idea),
  ]);

  const publicSimilar = (similarVideos || []).slice(0, 6);

  if (!PROVIDER) {
    const mock = await mockForecast({
      channel, idea, niche, length, channelInfo, similar: publicSimilar, reroll, hasThumbnail,
      titleAnalysis, metaScore,
    });
    return json({
      ...mock,
      source: "mock",
      channelInfo: publicChannel(channelInfo),
      similarVideos: publicSimilar,
      metaFeatures: { titleAnalysis, metaScore },
    });
  }

  try {
    // Run the main forecast and (if applicable) the dedicated thumbnail review
    // in parallel. Reviewing the thumbnail in a SEPARATE call with no channel
    // context prevents the model from pattern-matching ("this channel makes
    // Minecraft, so the thumbnail must be Minecraft") instead of looking.
    const [{ result, modelUsed }, thumbReview] = await Promise.all([
      aiForecast({
        channel, idea, niche, length, audience,
        channelInfo, similar: publicSimilar, reroll,
        // Do NOT pass the thumbnail to the main forecast — keep its
        // analysis context-free in the dedicated review call below.
        thumbnail: null,
        // Measured Hoiles et al. (2017) features go into the prompt as
        // hard evidence instead of letting the LLM guess.
        titleAnalysis, metaScore,
      }),
      hasThumbnail
        ? reviewThumbnail(thumbnail, { reroll })
        : Promise.resolve(null),
    ]);

    // Merge dedicated thumbnail review into the result (overwriting whatever
    // the main forecast may have written for these fields).
    if (thumbReview) {
      result.thumbnailReview = thumbReview.review || "";
      result.thumbnailScore = thumbReview.score || 0;
      if (thumbReview.modelUsed) {
        result._thumbnailModel = thumbReview.modelUsed;
      }
    }

    return json({
      ...result,
      source: PROVIDER,
      model: modelUsed,
      thumbnailModel: thumbReview?.modelUsed || null,
      channelInfo: publicChannel(channelInfo),
      similarVideos: publicSimilar,
      metaFeatures: { titleAnalysis, metaScore },
    });
  } catch (err) {
    console.error("AI forecast failed, falling back to mock:", err);
    const mock = await mockForecast({
      channel, idea, niche, length, channelInfo, similar: publicSimilar, reroll, hasThumbnail,
      titleAnalysis, metaScore,
    });
    return json({
      ...mock,
      source: "mock-fallback",
      warning: `${PROVIDER} call failed: ${String(err.message || err).slice(0, 240)}`,
      channelInfo: publicChannel(channelInfo),
      similarVideos: publicSimilar,
      metaFeatures: { titleAnalysis, metaScore },
    });
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function publicChannel(c) {
  if (!c) return null;
  return {
    title: c.title,
    handle: c.handle,
    thumbnail: c.thumbnail,
    subscribers: c.subscribers,
    totalViews: c.totalViews,
    videoCount: c.videoCount,
    avgRecentViews: avg(c.recentVideos?.map((v) => v.views).filter(Number.isFinite)),
    recentTitles: (c.recentVideos || []).slice(0, 5).map((v) => v.title),
  };
}

function avg(arr) {
  if (!arr || !arr.length) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

/* ---------- Dedicated thumbnail review (isolated, no channel context) ---------- */

async function reviewThumbnail(imageDataUrl, { reroll }) {
  if (!PROVIDER || !imageDataUrl) return null;

  const models = modelListFor({ vision: true });

  // Step 1: ask the model to literally describe the image first (forces it to
  // ground itself in pixels), then evaluate it for YouTube. Two phases, one
  // call. The "describe before judging" trick reliably stops Minecraft-style
  // hallucinations because the model has to commit to what it sees up front.
  const system = `You are reviewing a single image that the user uploaded as a planned YouTube thumbnail.

You MUST return ONLY a JSON object with this exact schema:
{
  "literalDescription": "1-2 sentence factual description of what you LITERALLY SEE in the image. Colors, objects, faces, text. NO inferences about the topic or channel.",
  "canSeeImage": boolean — true if you can actually perceive the image, false if you cannot,
  "score": integer 0-100 rating click potential as a YouTube thumbnail,
  "review": "3-5 sentences: what's visually working, what's hurting CTR at thumbnail size (~150px wide), and 1-2 concrete fixes. Reference ONLY things present in your literalDescription."
}

CRITICAL HONESTY RULES:
- If you cannot actually see the image (vision unavailable), set "canSeeImage": false, "score": 0, "literalDescription": "(image not perceived)", "review": "I could not actually view the image — please try again with a vision-capable model."
- NEVER invent visual details. If you genuinely see a blue square, say "blue square". Do not say "Minecraft scene" unless you can SEE Minecraft blocks.
- Your review must be grounded in your literalDescription. If your literalDescription says "a person's face", your review cannot talk about "blurry blocks".
- Do NOT consider video titles, channel topics, or any external context — they are not provided and should not be guessed at.

Output JSON only. No markdown.`;

  const userText = `Review this thumbnail image. First describe literally what you see, then evaluate it for YouTube CTR.`;

  const userMessage = {
    role: "user",
    content: [
      { type: "text", text: userText },
      { type: "image_url", image_url: { url: imageDataUrl } },
    ],
  };

  const errors = [];
  for (const model of models) {
    try {
      const out = await rawCompletion(model, {
        temperature: reroll ? 0.9 : 0.4,
        messages: [
          { role: "system", content: system },
          userMessage,
        ],
      });
      const parsed = extractJson(out);
      if (!parsed) throw new Error("non-JSON content");

      // If the model says it couldn't see the image, try the next vision model.
      if (parsed.canSeeImage === false) {
        errors.push(`${model}: model reported it could not see the image`);
        continue;
      }
      // Sanity check — if the review text mentions Minecraft / blocks / etc.
      // but the literal description doesn't, the model is hallucinating from
      // context that's not in the image. Reject and try the next model.
      const desc = String(parsed.literalDescription || "").toLowerCase();
      const review = String(parsed.review || "").toLowerCase();
      const HALLUCINATION_KEYWORDS = ["minecraft", "block", "redstone", "gameplay", "pixel"];
      const reviewMentions = HALLUCINATION_KEYWORDS.some((k) => review.includes(k));
      const descMentions = HALLUCINATION_KEYWORDS.some((k) => desc.includes(k));
      if (reviewMentions && !descMentions) {
        errors.push(`${model}: review hallucinated context not in description`);
        continue;
      }

      return {
        review: String(parsed.review || ""),
        score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0))),
        description: String(parsed.literalDescription || ""),
        modelUsed: model,
      };
    } catch (err) {
      const msg = String(err?.message || err);
      console.warn(`[${PROVIDER}] thumbnail review with ${model} failed: ${msg.slice(0, 200)}`);
      errors.push(`${model}: ${msg.slice(0, 120)}`);
      if (/\b401\b/.test(msg) || /invalid.*key/i.test(msg)) break;
    }
  }

  // All vision models failed or hallucinated — return an honest "couldn't view" marker.
  return {
    review:
      "I could not actually view the image — please try again with a vision-capable model.",
    score: 0,
    description: "",
    modelUsed: null,
    _errors: errors,
  };
}

// Low-level chat-completions call returning the raw assistant content string.
async function rawCompletion(model, { temperature, messages }) {
  const payload = { model, temperature, messages };
  if (PROVIDER === "openai") {
    payload.response_format = { type: "json_object" };
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  };
  if (PROVIDER === "openrouter") {
    headers["HTTP-Referer"] =
      process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME || "TubeForecaster";
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e?.name === "AbortError" ? "timeout after 30s" : `network: ${e.message}`);
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("no content");
  return content;
}

/* ---------- AI call (OpenRouter or OpenAI; OpenAI-compatible API) ---------- */

// Try each model in order. Fail over on rate limits / timeouts / transient errors.
async function aiForecast(args) {
  const models = modelListFor({ vision: !!args.thumbnail });
  const errors = [];
  for (const model of models) {
    try {
      const result = await callOne(model, args);
      return { result, modelUsed: model };
    } catch (err) {
      const msg = String(err?.message || err);
      console.warn(`[${PROVIDER}] model ${model} failed: ${msg.slice(0, 200)}`);
      errors.push(`${model}: ${msg.slice(0, 120)}`);
      // If it's clearly an auth error, don't bother trying more models.
      if (/\b401\b/.test(msg) || /invalid.*key/i.test(msg)) break;
    }
  }
  throw new Error(`all models failed → ${errors.join(" | ")}`);
}

async function callOne(model, {
  channel, idea, niche, length, audience, channelInfo, similar, reroll, thumbnail,
  titleAnalysis, metaScore,
}) {
  // The dedicated reviewThumbnail() handles image analysis in its own call.
  // The main forecast stays text-only to keep it fast + always correct.
  const hasThumbnail = false;

  const system = `You are TubeForecaster, an expert YouTube strategist who has analyzed millions of videos.
You evaluate a creator's video idea and predict how it will perform on YouTube, calibrated to THEIR channel size and history.

You MUST return ONLY a single valid JSON object — no prose, no markdown code fences — matching EXACTLY this schema:

{
  "score": integer 0-100,
  "summary": "1-2 sentence verdict, plain spoken, mention the channel by name if known",
  "predictedViews": {
    "label": "human range like '500 – 2K' or '20K – 80K' — use SMALL numbers for small channels",
    "range": "e.g. '500 – 2K in first 30 days'"
  },
  "predictedCTR":       { "value": number (percent, 1 decimal, realistic 2-15), "note": "short context" },
  "predictedRetention": { "value": integer (percent, realistic 25-70),          "note": "short context" },
  "strengths":  [ "2-4 concrete bullets" ],
  "weaknesses": [ "2-4 concrete bullets, each phrased as a fix not just a complaint" ],
  "titleSuggestions": [
    { "title": "stronger alternative <= 70 chars", "ctrLift": integer 3-20 }
  ],
  "thumbnailIdea": "1-2 sentence concrete visual concept",
  "competitiveNote": "1 sentence comparing this idea to how similar videos have performed. Empty string if no similar videos provided.",
  "thumbnailReview": ${hasThumbnail
    ? '"3-5 sentences reviewing the UPLOADED thumbnail: what is visually working, what is hurting CTR, and 1-2 concrete fixes. Reference specific visual elements you can actually see."'
    : '""'},
  "thumbnailScore":  ${hasThumbnail ? "integer 0-100 rating the uploaded thumbnail's click potential" : "0"}
}

Rules:
- Anchor predicted views to the channel's recent average — most videos land within 0.3×–3× of that.
  * Tiny channel (<1K subs, recent avg <1K views) → predict in HUNDREDS, e.g. "200 – 800".
  * Small channel (1K–10K subs, recent avg <5K views) → predict "500 – 5K".
  * NEVER inflate sub-1K-view channels to "1K – 5K" just because that sounds nicer. Brand-new channels routinely get 50–300 views.
- If similar videos are provided, use them as evidence: a saturated angle should pull the score down; a high-performing but rare angle should pull it up.
- Most ideas should score 40-75. Reserve 85+ for clearly strong hook + novelty + stakes. Use sub-30 for genuinely weak ideas.
- Give 3 title suggestions, each under 70 characters.
- 'weaknesses' must be actionable ("Front-load the surprising number"), not vague critique.
- ${hasThumbnail
    ? `The user has uploaded their planned THUMBNAIL as an image attachment.

  CRITICAL HONESTY RULES for thumbnail review:
  1. If you can actually SEE the image, describe ONLY what is literally visible. Reference specific visual elements (colors, objects, text, faces, composition). Do NOT invent details.
  2. If the image is unclear, low-resolution, or you cannot perceive it, set 'thumbnailReview' to EXACTLY this string: "I could not actually view the image — please try again with a vision-capable model." and set 'thumbnailScore' to 0.
  3. NEVER make up a description. NEVER guess what's in the image based on the video title. If the title says "Minecraft" but the image shows a person's face, describe the face — not Minecraft.
  4. If you can see the image, fill 'thumbnailReview' with 3-5 sentences: what is visually working, what is hurting CTR at thumbnail size (~150px wide), and 1-2 concrete fixes. Score it 0-100 in 'thumbnailScore'.

  The 'thumbnailIdea' field should always propose an IMPROVED concept regardless.`
    : "Leave 'thumbnailReview' as empty string and 'thumbnailScore' as 0."}
- Output JSON only. No commentary. No markdown.`;

  const channelBlock = formatChannelBlock(channelInfo);
  const competitiveBlock = formatCompetitiveBlock(similar);
  const metaBlock = formatMetaFeatureBlock(titleAnalysis, metaScore);
  const rerollBlock = reroll
    ? `\nThis is a RE-ROLL: the user already saw one take. Give a meaningfully different angle — fresh title suggestions, a different thumbnail concept, and surface a strength or risk that the obvious read would miss. Do not just rephrase the previous response.`
    : "";

  const userText = `Channel URL: ${channel}
${channelBlock}
Niche: ${niche}
Planned length (minutes): ${length}
${audience ? `Target audience: ${audience}\n` : ""}Video idea / working title:
"""${idea}"""

${metaBlock}

${competitiveBlock}${rerollBlock}
${hasThumbnail ? "\nThe user's planned thumbnail is attached as an image. Review it carefully." : ""}

Score this video idea and return the JSON. Your title-related strengths and weaknesses must be consistent with the Hoiles et al. (2017) measurements above — for example, if the uppercase ratio is 0.95 (ALL CAPS), that is a known CTR penalty and you must flag it as a weakness.`;

  // Build the user message. If we have a thumbnail, use the multimodal "content
  // parts" format so vision models receive the image inline.
  const userMessage = hasThumbnail
    ? {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: thumbnail } },
        ],
      }
    : { role: "user", content: userText };

  const payload = {
    model,
    temperature: reroll ? 1.05 : 0.7,
    messages: [
      { role: "system", content: system },
      userMessage,
    ],
  };
  // Only request JSON mode on OpenAI direct. On OpenRouter, many free models'
  // providers don't support it and the whole request 404s ("no providers found
  // supporting structured outputs"). Our lenient extractJson handles raw text.
  if (PROVIDER === "openai") {
    payload.response_format = { type: "json_object" };
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  };
  if (PROVIDER === "openrouter") {
    headers["HTTP-Referer"] =
      process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME || "TubeForecaster";
  }

  // 25s per-call timeout so a single hung provider can't stall the whole request.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e?.name === "AbortError" ? "timeout after 25s" : `network: ${e.message}`);
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("no content");

  const parsed = extractJson(content);
  if (!parsed) throw new Error("non-JSON content");

  return validateForecast(parsed);
}

// Lenient JSON extraction — handles models that wrap JSON in ```json fences
// or include leading prose ("Sure! Here's the JSON: { ... }").
function extractJson(text) {
  if (typeof text !== "string") return null;
  // 1) Try plain parse.
  try {
    return JSON.parse(text);
  } catch {}
  // 2) Strip ```json fences.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {}
  }
  // 3) Grab the largest {...} block.
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {}
  }
  return null;
}

function formatChannelBlock(c) {
  if (!c) return "Channel info: (unavailable — score based on idea alone)";

  const recent = (c.recentVideos || [])
    .slice(0, 5)
    .map((v) => `  - "${v.title}" — ${formatViews(v.views)} views`)
    .join("\n");

  const avgViews = c.recentVideos?.length
    ? Math.round(
        c.recentVideos.reduce((s, v) => s + (v.views || 0), 0) / c.recentVideos.length
      )
    : null;

  return `Channel name: ${c.title || "Unknown"}
Subscribers: ${formatSubs(c.subscribers) || "unknown"}
Total channel views: ${c.totalViews?.toLocaleString() || "unknown"}
Videos published: ${c.videoCount?.toLocaleString() || "unknown"}
Recent average views: ${avgViews ? avgViews.toLocaleString() : "unknown"}
Channel description: ${c.description || "(none)"}
Recent uploads:
${recent || "  (none found)"}`;
}

function formatMetaFeatureBlock(titleAnalysis, metaScore) {
  if (!titleAnalysis) return "";
  const f = titleAnalysis.features;
  const s = titleAnalysis.subScores;
  const lines = [
    `Title length: ${f.length} chars (sub-score ${s.length}/1.0; sweet spot 40–70)`,
    `Uppercase ratio: ${f.uppercaseRatio} (sub-score ${s.uppercase}/1.0; >0.5 = shouty penalty)`,
    `Distinct keywords: ${f.keywordCount} (sub-score ${s.keywords}/1.0)`,
  ];
  if (metaScore?.thumbnailContrast != null) {
    lines.push(
      `Thumbnail RMS luminance contrast: ${metaScore.thumbnailContrast} (sub-score ${metaScore.thumbnailSubScore}/1.0; higher = punchier)`
    );
  }
  return `Measured pre-upload meta-features (Hoiles et al. 2017, IEEE TKDE — empirically the strongest pre-upload predictors of YouTube view count):
${lines.map((l) => "  - " + l).join("\n")}
Combined Hoiles meta-feature score: ${metaScore.overall}/100`;
}

function formatCompetitiveBlock(similar) {
  if (!similar || !similar.length) return "Similar videos on YouTube: (none found)";
  const lines = similar
    .slice(0, 6)
    .map(
      (v) =>
        `  - "${v.title}" — ${v.channel} — ${formatViews(v.views)} views`
    )
    .join("\n");
  return `Top similar videos already on YouTube (use as competitive evidence):
${lines}`;
}

function formatViews(n) {
  if (n == null) return "?";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return String(n);
}

/* ---------- Validation / normalization ---------- */

function validateForecast(p) {
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const score = clamp(Math.round(Number(p.score) || 50), 0, 100);

  const out = {
    score,
    summary: typeof p.summary === "string" ? p.summary : "",
    predictedViews: {
      label: p?.predictedViews?.label || "—",
      range: p?.predictedViews?.range || "",
    },
    predictedCTR: {
      value: clamp(Number(p?.predictedCTR?.value) || 5, 0, 30),
      note: p?.predictedCTR?.note || "",
    },
    predictedRetention: {
      value: clamp(Math.round(Number(p?.predictedRetention?.value) || 40), 0, 100),
      note: p?.predictedRetention?.note || "",
    },
    strengths: arr(p.strengths).slice(0, 4),
    weaknesses: arr(p.weaknesses).slice(0, 4),
    titleSuggestions: arr(p.titleSuggestions)
      .slice(0, 3)
      .map((t) => ({
        title: String(t?.title || "").slice(0, 90),
        ctrLift: clamp(Math.round(Number(t?.ctrLift) || 5), 1, 50),
      }))
      .filter((t) => t.title),
    thumbnailIdea: typeof p.thumbnailIdea === "string" ? p.thumbnailIdea : "",
    competitiveNote: typeof p.competitiveNote === "string" ? p.competitiveNote : "",
    thumbnailReview: typeof p.thumbnailReview === "string" ? p.thumbnailReview : "",
    thumbnailScore: clamp(Math.round(Number(p.thumbnailScore) || 0), 0, 100),
  };

  out.predictedCTR.value = Math.round(out.predictedCTR.value * 10) / 10;
  return out;
}

function arr(x) {
  return Array.isArray(x) ? x.filter(Boolean) : [];
}
