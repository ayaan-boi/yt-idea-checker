// Deterministic mock forecast — used when no OPENAI_API_KEY is set,
// or when the OpenAI call fails. Same JSON shape as the real call.

export async function mockForecast({ channel, idea, niche, length, channelInfo, similar, reroll, hasThumbnail, titleAnalysis, metaScore }) {
  // Reroll bumps the seed so we get a meaningfully different draw.
  const salt = reroll ? `::reroll::${Date.now()}` : "";
  const seed = hash(channel + "::" + idea + "::" + niche + "::" + length + salt);
  const rng = mulberry32(seed);

  // Blend our heuristic with the empirically-grounded Hoiles meta-feature score
  // so even the mock pathway reflects the research finding (thumbnail contrast,
  // title length, uppercase ratio, keyword count → view count).
  const heuristic = scoreIdea(idea, niche, length, rng);
  const hoiles = typeof metaScore?.overall === "number" ? metaScore.overall : heuristic;
  const score = Math.round(0.5 * heuristic + 0.5 * hoiles);

  // If we know the channel's recent average, scale predicted views around it.
  const avgViews = avg((channelInfo?.recentVideos || []).map((v) => v.views).filter(Number.isFinite));
  const bucket = avgViews
    ? bucketFromAvg(avgViews, score, rng)
    : defaultBucket(score);

  const ctr = +(3 + (score / 100) * 9 + rng() * 1.5).toFixed(1);
  const retention = +(28 + (score / 100) * 30 + rng() * 6).toFixed(0);

  await new Promise((r) => setTimeout(r, 700 + Math.random() * 500));

  return {
    score,
    summary: summarize(score, niche),
    predictedViews: {
      label: bucket.label,
      range: `${formatNum(bucket.lo)} – ${formatNum(bucket.hi)} in first 30 days`,
    },
    predictedCTR: {
      value: ctr,
      note: ctr >= 8 ? "Above niche avg" : ctr >= 5 ? "Niche average" : "Below niche avg",
    },
    predictedRetention: {
      value: retention,
      note: retention >= 50 ? "Sticky" : retention >= 40 ? "Solid" : "Drop-off risk",
    },
    strengths: mergeHoilesNotes(pickStrengths(score, rng), titleAnalysis, metaScore, "strength"),
    weaknesses: mergeHoilesNotes(pickWeaknesses(score, length, rng), titleAnalysis, metaScore, "weakness"),
    titleSuggestions: generateTitles(idea, rng),
    thumbnailIdea: generateThumbnail(rng),
    competitiveNote: similar && similar.length
      ? competitiveNote(similar)
      : "",
    thumbnailReview: hasThumbnail
      ? "Thumbnail review is only available when AI is configured — set up OPENROUTER_API_KEY in .env.local to get a real visual analysis."
      : "",
    thumbnailScore: 0,
  };
}

function competitiveNote(similar) {
  const top = similar[0];
  if (!top) return "";
  const v = top.views >= 1_000_000
    ? `${(top.views / 1_000_000).toFixed(1)}M`
    : `${Math.round(top.views / 1000)}K`;
  return `Similar angle exists: "${truncate(top.title, 60)}" by ${top.channel} hit ${v} views — your version needs a sharper hook to break through.`;
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function defaultBucket(score) {
  // No channel info → assume small channel and don't inflate.
  const viewBuckets = [
    { label: "50 – 300",     lo: 50,        hi: 300 },
    { label: "200 – 1K",     lo: 200,       hi: 1000 },
    { label: "500 – 3K",     lo: 500,       hi: 3000 },
    { label: "2K – 10K",     lo: 2000,      hi: 10000 },
    { label: "10K – 40K",    lo: 10000,     hi: 40000 },
    { label: "40K – 150K",   lo: 40000,     hi: 150000 },
    { label: "150K – 500K",  lo: 150000,    hi: 500000 },
    { label: "500K – 2M",    lo: 500000,    hi: 2_000_000 },
  ];
  const idx = Math.min(
    viewBuckets.length - 1,
    Math.max(0, Math.floor((score / 100) * viewBuckets.length))
  );
  return viewBuckets[idx];
}

function bucketFromAvg(avgViews, score, rng) {
  // score 50 -> ~1x avg, score 100 -> ~3.5x, score 0 -> ~0.3x
  const multiplier = 0.3 + (score / 100) * 3.2;
  const center = avgViews * multiplier;
  // Floor at 20 — even truly dead videos still get a few dozen impressions.
  // No more artificial 1K floor.
  const lo = Math.max(20, Math.round(center * 0.6));
  const hi = Math.max(lo + 20, Math.round(center * 1.6));
  return {
    label: `${formatNum(lo)} – ${formatNum(hi)}`,
    lo,
    hi,
  };
}

function avg(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function scoreIdea(idea, niche, length, rng) {
  let s = 45 + rng() * 15;
  const text = idea.toLowerCase();
  const power = [
    "i tried", "i spent", "for 24 hours", "$", "vs", "versus", "secret",
    "nobody", "why", "how", "the truth", "exposed", "the best", "the worst",
    "in 24", "in 60 seconds", "first", "last", "mystery", "challenge",
  ];
  for (const p of power) if (text.includes(p)) s += 4;
  if (/\d/.test(text)) s += 4;
  if (text.length > 35 && text.length < 90) s += 5;
  if (text.length < 18) s -= 8;
  if (text.length > 130) s -= 6;

  const nicheBoost = {
    Entertainment: 6, Gaming: 4, Tech: 3, Education: 2, Finance: 1,
    Fitness: 0, Food: 2, Beauty: 1, Music: 0, "Vlog / Lifestyle": -2, Other: 0,
  };
  s += nicheBoost[niche] ?? 0;

  const lenBoost = { "<1": 2, "1-3": 0, "3-8": 3, "8-12": 5, "12-15": 4, "15-20": 2, "20+": -2 };
  s += lenBoost[length] ?? 0;
  s += (rng() - 0.5) * 8;
  return Math.max(8, Math.min(98, Math.round(s)));
}

// Inject Hoiles et al. (2017) measurement-based notes so the bullets reflect
// the actual computed sub-scores rather than just random sampling.
function mergeHoilesNotes(base, titleAnalysis, metaScore, kind) {
  if (!titleAnalysis) return base;
  const f = titleAnalysis.features;
  const s = titleAnalysis.subScores;
  const notes = [];
  if (kind === "strength") {
    if (s.length >= 0.95) notes.push(`Title length (${f.length} chars) sits in the empirically optimal 40–70 range [Hoiles 2017].`);
    if (s.uppercase >= 0.95) notes.push(`Title capitalization (${(f.uppercaseRatio * 100).toFixed(0)}% uppercase) matches the headline-style format that correlates with higher CTR [Hoiles 2017].`);
    if (s.keywords >= 0.95) notes.push(`Keyword density (${f.keywordCount} distinct topical words) is in the discoverability sweet spot [Hoiles 2017].`);
    if (metaScore?.thumbnailSubScore != null && metaScore.thumbnailSubScore >= 0.85) {
      notes.push(`Measured thumbnail RMS contrast (${metaScore.thumbnailContrast}) is strong — a top pre-upload predictor of views [Hoiles 2017].`);
    }
  } else {
    if (s.length <= 0.4) notes.push(`Title length (${f.length} chars) is outside the 40–70 char sweet spot — expect lower CTR [Hoiles 2017].`);
    if (f.uppercaseRatio >= 0.5) notes.push(`Title is mostly uppercase (${(f.uppercaseRatio * 100).toFixed(0)}%) — algorithm penalizes shouty titles [Hoiles 2017].`);
    if (s.keywords <= 0.4) notes.push(`Only ${f.keywordCount} distinct keyword${f.keywordCount === 1 ? "" : "s"} — narrows discoverability via search [Hoiles 2017].`);
    if (metaScore?.thumbnailSubScore != null && metaScore.thumbnailSubScore <= 0.45) {
      notes.push(`Measured thumbnail RMS contrast (${metaScore.thumbnailContrast}) is low — the thumbnail will look flat in the feed [Hoiles 2017].`);
    }
  }
  // Prepend the measurement-grounded notes; cap total at 4.
  return [...notes, ...base].slice(0, 4);
}

function pickStrengths(score, rng) {
  const pool = [
    "Strong curiosity gap — viewers will need to click to find out.",
    "Clear, specific stakes in the premise (great for retention).",
    "Plays into a trending format in your niche right now.",
    "The hook implies a transformation — algorithms love this.",
    "Title length is in the click-through sweet spot.",
    "Premise is repeatable — easy to turn into a series.",
    "Strong emotional payoff implied in the framing.",
    "Concrete number in the title boosts CTR meaningfully.",
  ];
  const n = score >= 70 ? 4 : score >= 50 ? 3 : 2;
  return sample(pool, n, rng);
}

function pickWeaknesses(score, length, rng) {
  const pool = [
    "Hook is buried — front-load the most surprising element.",
    "Idea is broad; narrow it to a single, specific person or moment.",
    "No clear payoff promised — tell the viewer what they'll get.",
    "Title leans on a format that's getting saturated this quarter.",
    "Risk of low retention past minute 3 — plan a re-hook there.",
    "Thumbnail will be hard to differentiate — consider an unusual prop.",
    "Search demand for this exact angle is low — leans on browse traffic.",
    `${length === "20+" ? "Runtime > 20m" : "Runtime"} may hurt average view duration unless story is tight.`,
  ];
  const n = score >= 70 ? 2 : score >= 50 ? 3 : 4;
  return sample(pool, n, rng);
}

function generateTitles(idea, rng) {
  const base = idea.replace(/[\.!?]+$/, "");
  const variants = [
    { title: `I Tried ${base} (It Got Weird)`, ctrLift: 12 },
    { title: `${base} — And Here's What Actually Happened`, ctrLift: 9 },
    { title: `Why ${base} Is Smarter Than You Think`, ctrLift: 7 },
    { title: `${capitalize(base)} in 24 Hours`, ctrLift: 14 },
    { title: `The Truth About ${base}`, ctrLift: 6 },
  ];
  return sample(variants, 3, rng).map((v) => ({ ...v, title: trimTitle(v.title) }));
}

function trimTitle(t) {
  return t.length <= 72 ? t : t.slice(0, 69) + "…";
}

function generateThumbnail(rng) {
  const ideas = [
    "Split-frame: your face on the left with a shocked expression, the subject on the right with a glowing red arrow pointing at the key detail. 3-word overlay in heavy condensed font.",
    "Extreme close-up of the central object with desaturated background and one bright color pop. Your face peeks in from the corner.",
    "Before / After layout with a bold yellow divider and the dollar amount or number front-and-center.",
    "Single subject centered, slight low-angle, glowing outline. Two-word text in a corner — no more.",
    "You holding the central prop directly to camera with exaggerated emotion. Punchy 2-word caption bottom-left.",
  ];
  return ideas[Math.floor(rng() * ideas.length)];
}

function summarize(score, niche) {
  if (score >= 85)
    return `This concept has the structural signals of a top-decile ${niche.toLowerCase()} video. Execution will decide how big it gets.`;
  if (score >= 70)
    return `Above average for your niche. With a sharper hook and a stronger thumbnail concept, this can outperform your channel baseline.`;
  if (score >= 55)
    return `There's a real video in here, but the framing is doing too much of the work alone. Tighten the promise.`;
  if (score >= 40)
    return `Mixed signals — the premise is interesting but the title doesn't tell the viewer what they're trading 10 minutes for.`;
  return `This is unlikely to break out as-is. Consider reframing around a single, specific outcome a viewer will see by the end.`;
}

function formatNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return String(n);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sample(arr, n, rng) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
