"use client";

import { useRef, useState } from "react";

function scoreColor(score) {
  if (score >= 75) return "var(--green)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
}

function verdictText(score) {
  if (score >= 85) return "Banger potential";
  if (score >= 70) return "Strong idea";
  if (score >= 55) return "Solid, with tweaks";
  if (score >= 40) return "Risky — needs work";
  return "Skip or rework";
}

export default function ForecastResult({
  loading,
  rerolling,
  error,
  result,
  idea,
  thumbnail,
  canReroll,
  onReroll,
}) {
  const cardRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  async function exportPng() {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, {
        backgroundColor: "#1f1f1f",
        pixelRatio: 2,
        cacheBust: true,
        filter: (node) => !node.classList?.contains("export-hide"),
      });
      const link = document.createElement("a");
      link.download = `tubeforecaster-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("PNG export failed:", e);
      alert("Sorry, couldn't export the image. Try again?");
    } finally {
      setExporting(false);
    }
  }

  function exportPdf() {
    window.print();
  }

  if (loading) {
    return (
      <div className="card">
        <h2>Crunching the numbers…</h2>
        <p className="subtitle">
          Analyzing your channel signal and benchmarking against similar videos.
        </p>
        <div style={{ marginTop: 16 }}>
          <div className="skeleton" style={{ height: 108, width: 108, borderRadius: "50%", marginBottom: 16 }} />
          <div className="skeleton skeleton-row" style={{ width: "60%" }} />
          <div className="skeleton skeleton-row" style={{ width: "90%" }} />
          <div className="skeleton skeleton-row" style={{ width: "80%" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 20 }}>
            <div className="skeleton" style={{ height: 64 }} />
            <div className="skeleton" style={{ height: 64 }} />
            <div className="skeleton" style={{ height: 64 }} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2>Forecast</h2>
        <p className="subtitle">Your AI-powered rating will show up here.</p>
        <div className="error">{error}</div>
        <div className="placeholder">
          <div className="icon">⚠️</div>
          <div>Try again, or check your inputs.</div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="card">
        <h2>Forecast</h2>
        <p className="subtitle">Your AI-powered rating will show up here.</p>
        <div className="placeholder">
          <div className="icon">📈</div>
          <div>
            Fill out the form and we'll predict your video's performance.
          </div>
        </div>
      </div>
    );
  }

  const {
    score,
    predictedViews,
    predictedCTR,
    predictedRetention,
    strengths = [],
    weaknesses = [],
    titleSuggestions = [],
    thumbnailIdea,
    competitiveNote,
    thumbnailReview,
    thumbnailScore,
    thumbnailModel,
    source,
    model,
    warning,
    channelInfo,
    similarVideos = [],
    metaFeatures,
  } = result;
  const uploadedThumbnail = thumbnail || null;

  return (
    <div className={`card fade-in printable ${rerolling ? "rerolling" : ""}`} ref={cardRef}>
      <div
        className="result-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>Forecast</h2>
        {source && <SourceBadge source={source} model={model} />}
      </div>
      <p className="subtitle" title={idea} style={{ marginTop: 4 }}>
        For: <em style={{ color: "var(--text)" }}>{truncate(idea, 80)}</em>
      </p>
      {warning && <div className="error" style={{ marginBottom: 12 }}>{warning}</div>}
      {channelInfo && <ChannelCard info={channelInfo} />}
      {metaFeatures && <MetaFeaturesCard meta={metaFeatures} />}

      <div className="score-block">
        <div
          className="score-ring"
          style={{ "--pct": score, "--color": scoreColor(score) }}
        >
          <span className="num">
            {score}
            <small>/100</small>
          </span>
        </div>
        <div style={{ minWidth: 0 }}>
          <p className="verdict-title">{verdictText(score)}</p>
          <p className="verdict-sub">{result.summary}</p>
        </div>
      </div>

      {rerolling && (
        <div className="reroll-banner">
          <span className="spinner" />
          Getting a different angle…
        </div>
      )}

      <div className="metrics">
        <div className="metric">
          <div className="label">Predicted views</div>
          <div className="value">{predictedViews.label}</div>
          <div className="delta">{predictedViews.range}</div>
        </div>
        <div className="metric">
          <div className="label">Predicted CTR</div>
          <div className="value">{predictedCTR.value}%</div>
          <div className="delta">{predictedCTR.note}</div>
        </div>
        <div className="metric">
          <div className="label">Avg retention</div>
          <div className="value">{predictedRetention.value}%</div>
          <div className="delta">{predictedRetention.note}</div>
        </div>
      </div>

      {competitiveNote && (
        <div className="competitive-note">
          <span className="competitive-icon">🎯</span>
          <span>{competitiveNote}</span>
        </div>
      )}

      {strengths.length > 0 && (
        <>
          <div className="section-title">What's working</div>
          <ul className="bullets">
            {strengths.map((s, i) => (
              <li key={i} className="good">
                <span className="bullet-icon">✓</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {weaknesses.length > 0 && (
        <>
          <div className="section-title">Risks &amp; fixes</div>
          <ul className="bullets">
            {weaknesses.map((s, i) => (
              <li key={i} className="bad">
                <span className="bullet-icon">!</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {titleSuggestions.length > 0 && (
        <>
          <div className="section-title">Stronger title options</div>
          <div className="title-suggestions">
            {titleSuggestions.map((t, i) => (
              <div key={i} className="title-pill">
                <span>{t.title}</span>
                <span className="ctr">CTR +{t.ctrLift}%</span>
              </div>
            ))}
          </div>
        </>
      )}

      {uploadedThumbnail && (
        <>
          <div className="section-title">Your thumbnail</div>
          <div className="thumb-review-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={uploadedThumbnail} alt="Uploaded thumbnail" className="thumb-review-img" />
            <div className="thumb-review-body">
              {(() => {
                const couldNotView =
                  thumbnailReview &&
                  /could not (actually )?view the image/i.test(thumbnailReview);
                if (couldNotView) {
                  return (
                    <div className="error" style={{ margin: 0 }}>
                      The AI model that handled this request couldn't actually
                      view the image (it answered without vision). Try clicking
                      <strong> Re-roll </strong>— the next attempt will use a
                      different vision-capable model.
                    </div>
                  );
                }
                return (
                  <>
                    {thumbnailScore > 0 && (
                      <div className="thumb-score-row">
                        <span
                          className="thumb-score-pill"
                          style={{
                            color: scoreColor(thumbnailScore),
                            borderColor: scoreColor(thumbnailScore),
                          }}
                        >
                          {thumbnailScore}/100
                        </span>
                        <span className="thumb-score-label">
                          {thumbnailScore >= 75
                            ? "Strong"
                            : thumbnailScore >= 50
                            ? "Workable"
                            : "Needs work"}
                        </span>
                      </div>
                    )}
                    {thumbnailReview ? (
                      <p className="thumb-review-text">{thumbnailReview}</p>
                    ) : (
                      <p
                        className="thumb-review-text"
                        style={{ color: "var(--text-mute)" }}
                      >
                        AI didn't return a thumbnail review for this run.
                      </p>
                    )}
                    {thumbnailModel && (
                      <p
                        style={{
                          fontSize: 10,
                          color: "var(--text-mute)",
                          margin: "4px 0 0",
                          letterSpacing: 0.3,
                          textTransform: "uppercase",
                        }}
                      >
                        Reviewed by {thumbnailModel.split("/").pop().replace(":free", "")}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {thumbnailIdea && (
        <>
          <div className="section-title">
            {uploadedThumbnail ? "Suggested thumbnail concept" : "Thumbnail concept"}
          </div>
          <div
            className="title-pill"
            style={{ lineHeight: 1.5, display: "block" }}
          >
            {thumbnailIdea}
          </div>
        </>
      )}

      {similarVideos.length > 0 && <SimilarVideos videos={similarVideos} />}

      <div className="action-row export-hide no-print">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onReroll}
          disabled={!canReroll || rerolling}
          title="Re-run the forecast for a different angle"
        >
          {rerolling ? (
            <>
              <span className="spinner" /> Re-rolling…
            </>
          ) : (
            <>🎲 Re-roll</>
          )}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={exportPng}
          disabled={exporting}
        >
          {exporting ? "Saving…" : "📸 Save PNG"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={exportPdf}
        >
          🖨️ Print / PDF
        </button>
      </div>

      <div className="export-footer">
        TubeForecaster · {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}

function MetaFeaturesCard({ meta }) {
  const { titleAnalysis, metaScore } = meta || {};
  if (!titleAnalysis || !metaScore) return null;
  const f = titleAnalysis.features;
  const s = titleAnalysis.subScores;
  const overall = metaScore.overall;
  const color = overall >= 75 ? "var(--green)" : overall >= 50 ? "var(--amber)" : "var(--red)";

  const rows = [
    { label: "Title length", value: `${f.length} chars`, sub: s.length },
    { label: "Uppercase ratio", value: `${(f.uppercaseRatio * 100).toFixed(0)}%`, sub: s.uppercase },
    { label: "Distinct keywords", value: f.keywordCount, sub: s.keywords },
  ];
  if (metaScore.thumbnailContrast != null) {
    rows.push({
      label: "Thumbnail RMS contrast",
      value: metaScore.thumbnailContrast.toFixed(3),
      sub: metaScore.thumbnailSubScore,
    });
  }

  return (
    <div className="meta-card">
      <div className="meta-card-header">
        <div>
          <div className="meta-card-title">
            Meta-feature analysis
            <a
              href="https://arxiv.org/abs/1611.00687"
              target="_blank"
              rel="noopener noreferrer"
              className="meta-cite-link"
              title="Based on Hoiles et al. (2017), IEEE TKDE — click to view paper"
              aria-label="Research source"
            >
              ⓘ
            </a>
          </div>
        </div>
        <span className="meta-overall" style={{ color, borderColor: color }}>
          {overall}/100
        </span>
      </div>
      <div className="meta-rows">
        {rows.map((r) => (
          <div className="meta-row" key={r.label}>
            <div className="meta-row-label">{r.label}</div>
            <div className="meta-row-value">{r.value}</div>
            <div className="meta-bar" aria-hidden="true">
              <div
                className="meta-bar-fill"
                style={{
                  width: `${Math.round(r.sub * 100)}%`,
                  background: r.sub >= 0.75 ? "var(--green)" : r.sub >= 0.5 ? "var(--amber)" : "var(--red)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelCard({ info }) {
  const subs = formatCompact(info.subscribers);
  const avg = formatCompact(info.avgRecentViews);
  return (
    <div className="channel-card">
      {info.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={info.thumbnail} alt={info.title || "Channel"} className="channel-avatar" />
      ) : (
        <div className="channel-avatar channel-avatar-fallback">
          {(info.title || "?").charAt(0).toUpperCase()}
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="channel-title">{info.title || info.handle || "Channel"}</div>
        <div className="channel-stats">
          {subs && <span>{subs} subs</span>}
          {avg && <span>· {avg} avg views</span>}
          {info.videoCount != null && <span>· {info.videoCount.toLocaleString()} videos</span>}
        </div>
      </div>
    </div>
  );
}

function SimilarVideos({ videos }) {
  return (
    <>
      <div className="section-title">How similar videos are doing</div>
      <div className="similar-list">
        {videos.map((v) => (
          <a
            key={v.id}
            href={v.url}
            target="_blank"
            rel="noopener noreferrer"
            className="similar-item"
          >
            {v.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.thumbnail} alt="" className="similar-thumb" />
            )}
            <div className="similar-text">
              <div className="similar-title">{v.title}</div>
              <div className="similar-meta">
                {v.channel} · {formatCompact(v.views)} views
              </div>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}

function formatCompact(n) {
  if (n == null) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "K";
  return String(n);
}

function SourceBadge({ source, model }) {
  const styles = {
    openrouter: { bg: "rgba(46, 204, 113, 0.12)", color: "#5fe39a", label: "AI · OpenRouter" },
    openai: { bg: "rgba(46, 204, 113, 0.12)", color: "#5fe39a", label: "AI · OpenAI" },
    mock: { bg: "rgba(245, 165, 36, 0.12)", color: "#f5a524", label: "Heuristic mock" },
    "mock-fallback": { bg: "rgba(239, 68, 68, 0.12)", color: "#ff8e8e", label: "Fallback mock" },
  };
  const s = styles[source] || styles.mock;
  // Shorten model id for the badge ("openai/gpt-oss-120b:free" -> "gpt-oss-120b")
  const shortModel =
    model && typeof model === "string"
      ? model.split("/").pop().replace(":free", "")
      : null;
  return (
    <span
      title={model || ""}
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        padding: "4px 9px",
        borderRadius: 999,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
      {shortModel && (
        <span style={{ opacity: 0.7, marginLeft: 6, fontWeight: 500 }}>
          {shortModel}
        </span>
      )}
    </span>
  );
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
