"use client";

function scoreColor(s) {
  if (s >= 75) return "var(--green)";
  if (s >= 50) return "var(--amber)";
  return "var(--red)";
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function HistorySidebar({ items, activeId, onSelect, onClear }) {
  return (
    <aside className="history-card">
      <div className="history-header">
        <h2>History</h2>
        {items.length > 0 && (
          <button className="link-btn" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="history-empty">
          Your past forecasts will show up here. Saved in your browser only.
        </p>
      ) : (
        <ul className="history-list">
          {items.map((it) => (
            <li key={it.id}>
              <button
                className={`history-item ${activeId === it.id ? "active" : ""}`}
                onClick={() => onSelect(it.id)}
                title={it.idea}
              >
                <span
                  className="history-score"
                  style={{ color: scoreColor(it.result.score), borderColor: scoreColor(it.result.score) }}
                >
                  {it.result.score}
                </span>
                <span className="history-text">
                  <span className="history-idea">{truncate(it.idea, 60)}</span>
                  <span className="history-meta">
                    {it.channelLabel || hostOf(it.channel)} · {timeAgo(it.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function hostOf(url) {
  try {
    return new URL(url).pathname.replace(/^\/+/, "").split("/")[0] || "channel";
  } catch {
    return url || "channel";
  }
}
