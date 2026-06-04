// Meta-feature analysis grounded in:
//   Hoiles, W., Aprem, A., & Krishnamurthy, V. (2017).
//   "Engagement and Popularity Dynamics of YouTube Videos and Sensitivity to
//   Meta-Level Features." IEEE TKDE, 29(7), 1426–1437.
//   arxiv.org/abs/1611.00687
//
// The paper trained models on ~6M videos and isolated the meta-level features
// that most strongly predict view count (besides post-upload signals).
// The key ones we can measure pre-upload:
//   1. Title length         (sweet spot ~40–70 chars)
//   2. Uppercase count      (mild positive; too many → spam penalty)
//   3. Keyword/topic count  (proxy: number of meaningful words)
//   4. Thumbnail contrast   (measured client-side in ThumbnailUpload.js)
//
// We translate each into a 0-1 sub-score, then weight them by the paper's
// reported sensitivity ranking (thumbnail > title length > caps > keywords).

const TITLE_LEN_SWEETSPOT = [40, 70];
const TITLE_LEN_HARD_MIN = 12;
const TITLE_LEN_HARD_MAX = 120;

const STOPWORDS = new Set([
  "the", "a", "an", "is", "it", "to", "of", "in", "on", "for", "and", "or",
  "but", "with", "this", "that", "i", "my", "me", "you", "your", "we", "our",
  "as", "at", "by", "from", "be", "are", "was", "were", "do", "did", "have",
  "has", "had", "not", "no", "yes", "if", "so", "than", "then", "just",
]);

/**
 * Analyze a video title using the Hoiles et al. (2017) feature set.
 * Returns measured features + per-feature 0-1 scores + weighted overall score.
 */
export function analyzeTitleHoiles(rawTitle) {
  const title = String(rawTitle || "").trim();
  const len = title.length;

  // --- Feature 1: title length ---
  // Paper: title length is among the top predictors. Too short = vague, too
  // long = truncated in feed. Sweet spot empirically ~40–70 chars.
  let lengthScore;
  if (len < TITLE_LEN_HARD_MIN) lengthScore = 0.1;
  else if (len > TITLE_LEN_HARD_MAX) lengthScore = 0.25;
  else if (len >= TITLE_LEN_SWEETSPOT[0] && len <= TITLE_LEN_SWEETSPOT[1]) {
    lengthScore = 1.0;
  } else if (len < TITLE_LEN_SWEETSPOT[0]) {
    // Linear ramp from hard min to sweet-spot start.
    lengthScore = 0.1 + (0.9 * (len - TITLE_LEN_HARD_MIN)) / (TITLE_LEN_SWEETSPOT[0] - TITLE_LEN_HARD_MIN);
  } else {
    // Linear decay from sweet-spot end to hard max.
    lengthScore = 1.0 - (0.75 * (len - TITLE_LEN_SWEETSPOT[1])) / (TITLE_LEN_HARD_MAX - TITLE_LEN_SWEETSPOT[1]);
  }
  lengthScore = clamp01(lengthScore);

  // --- Feature 2: uppercase letters ---
  // Paper: positive correlation up to a point, then negative (looks spammy).
  // We measure RATIO of uppercase to all letters. Sweet spot ~5%–25%.
  const letters = title.replace(/[^A-Za-z]/g, "");
  const uppers = title.replace(/[^A-Z]/g, "");
  const upperRatio = letters.length ? uppers.length / letters.length : 0;
  let upperScore;
  if (upperRatio <= 0.02) upperScore = 0.55;        // all lowercase: dull
  else if (upperRatio <= 0.06) upperScore = 0.85;   // normal sentence case
  else if (upperRatio <= 0.25) upperScore = 1.00;   // proper-noun heavy, headline feel
  else if (upperRatio <= 0.50) upperScore = 0.65;   // a lot — borderline shouty
  else if (upperRatio <= 0.80) upperScore = 0.35;   // clearly shouty
  else upperScore = 0.15;                            // ALL CAPS — penalty

  // --- Feature 3: keyword count ---
  // Paper: number of distinct, meaningful keywords predicts discoverability.
  // We approximate as count of non-stopword tokens length ≥ 3.
  const tokens = title
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  const uniqueKeywords = new Set(tokens);
  const keywordCount = uniqueKeywords.size;
  let keywordScore;
  if (keywordCount <= 1) keywordScore = 0.20;
  else if (keywordCount <= 3) keywordScore = 0.60;
  else if (keywordCount <= 8) keywordScore = 1.00;
  else if (keywordCount <= 12) keywordScore = 0.75;
  else keywordScore = 0.50;                           // keyword stuffing

  return {
    title,
    features: {
      length: len,
      uppercaseRatio: round(upperRatio, 2),
      keywordCount,
      keywords: [...uniqueKeywords],
    },
    subScores: {
      length: round(lengthScore, 2),
      uppercase: round(upperScore, 2),
      keywords: round(keywordScore, 2),
    },
    citations: ["Hoiles et al. 2017 (IEEE TKDE)"],
  };
}

/**
 * Combine the title sub-scores with an (optional) measured thumbnail-contrast
 * sub-score to produce a single 0-100 "meta-feature score".
 *
 * Weights derived from the paper's reported sensitivity ranking:
 *   thumbnail contrast > title length > uppercase > keyword count.
 */
export function combineHoilesScore(titleAnalysis, thumbnailContrast01) {
  // thumbnailContrast01: number 0..1 (RMS luminance contrast normalized),
  // or null if no thumbnail was uploaded.
  const hasThumb = typeof thumbnailContrast01 === "number" && !isNaN(thumbnailContrast01);

  // Re-weight depending on whether we have a thumbnail measurement.
  // Weights sum to 1 in each branch.
  const weights = hasThumb
    ? { thumbnail: 0.40, length: 0.25, uppercase: 0.15, keywords: 0.20 }
    : {                  length: 0.45, uppercase: 0.25, keywords: 0.30 };

  let score = 0;
  if (hasThumb) score += weights.thumbnail * thumbContrastSubScore(thumbnailContrast01);
  score += weights.length    * titleAnalysis.subScores.length;
  score += weights.uppercase * titleAnalysis.subScores.uppercase;
  score += weights.keywords  * titleAnalysis.subScores.keywords;

  return {
    overall: Math.round(score * 100),
    weights,
    thumbnailContrast: hasThumb ? round(thumbnailContrast01, 3) : null,
    thumbnailSubScore: hasThumb ? round(thumbContrastSubScore(thumbnailContrast01), 2) : null,
  };
}

// Map RMS luminance contrast (typically 0..0.5 for real images) to a 0..1 score.
// The paper found higher contrast correlates positively with views, but with
// diminishing returns past a point.
function thumbContrastSubScore(c) {
  if (c <= 0.05) return 0.10;   // basically flat — very low CTR
  if (c <= 0.10) return 0.45;
  if (c <= 0.18) return 0.85;
  if (c <= 0.30) return 1.00;   // strong, punchy thumbnail
  return 0.85;                   // very high contrast → could be noisy; gentle penalty
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function round(x, n) { const p = 10 ** n; return Math.round(x * p) / p; }
