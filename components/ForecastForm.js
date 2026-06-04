"use client";

import { useEffect, useState } from "react";
import ThumbnailUpload from "./ThumbnailUpload";

const EXAMPLES = [
  {
    channel: "https://youtube.com/@mkbhd",
    idea: "I tried using a $50 phone as my daily driver for a month — here's what broke me.",
    niche: "Tech",
    length: "8-12",
  },
  {
    channel: "https://youtube.com/@veritasium",
    idea: "Why airplanes still use technology from the 1940s — and why that's actually genius.",
    niche: "Education",
    length: "15-20",
  },
  {
    channel: "https://youtube.com/@mrbeast",
    idea: "I gave 100 strangers $10,000 — but only if they could solve one puzzle in 60 seconds.",
    niche: "Entertainment",
    length: "12-15",
  },
];

export default function ForecastForm({ onSubmit, loading, seed }) {
  const [channel, setChannel] = useState("");
  const [idea, setIdea] = useState("");
  const [niche, setNiche] = useState("Tech");
  const [length, setLength] = useState("8-12");
  const [audience, setAudience] = useState("");
  const [thumbnail, setThumbnail] = useState(null);

  // Repopulate from history when a seed comes in.
  useEffect(() => {
    if (!seed) return;
    setChannel(seed.channel || "");
    setIdea(seed.idea || "");
    setNiche(seed.niche || "Tech");
    setLength(seed.length || "8-12");
    setAudience(seed.audience || "");
    setThumbnail(seed.thumbnail || null);
  }, [seed]);

  function submit(e) {
    e.preventDefault();
    if (!channel.trim() || !idea.trim()) return;
    // `thumbnail` is { dataUrl, contrast } | null. Send both to the API so
    // the server can use the measured contrast (Hoiles et al. 2017 feature)
    // without re-decoding the image.
    const thumbnailDataUrl = thumbnail?.dataUrl || null;
    const thumbnailContrast = typeof thumbnail?.contrast === "number" ? thumbnail.contrast : null;
    onSubmit({
      channel, idea, niche, length, audience,
      thumbnail: thumbnailDataUrl,
      thumbnailContrast,
    });
  }

  function loadExample() {
    const ex = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)];
    setChannel(ex.channel);
    setIdea(ex.idea);
    setNiche(ex.niche);
    setLength(ex.length);
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Your video</h2>
      <p className="subtitle">
        We use this to model the audience you're pitching to.
      </p>

      <div className="field">
        <label htmlFor="channel">YouTube channel URL</label>
        <input
          id="channel"
          className="input"
          type="url"
          placeholder="https://youtube.com/@yourchannel"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="idea">Video idea / working title</label>
        <textarea
          id="idea"
          className="textarea"
          placeholder="e.g. I lived inside an IKEA for 24 hours and built an entire apartment with $200."
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          maxLength={400}
          required
        />
        <span className="hint">{idea.length}/400</span>
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="niche">Niche</label>
          <select
            id="niche"
            className="select"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
          >
            {[
              "Tech",
              "Gaming",
              "Education",
              "Entertainment",
              "Vlog / Lifestyle",
              "Finance",
              "Fitness",
              "Food",
              "Beauty",
              "Music",
              "Other",
            ].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="length">Length (min)</label>
          <select
            id="length"
            className="select"
            value={length}
            onChange={(e) => setLength(e.target.value)}
          >
            <option value="<1">Short (&lt;1)</option>
            <option value="1-3">1 – 3</option>
            <option value="3-8">3 – 8</option>
            <option value="8-12">8 – 12</option>
            <option value="12-15">12 – 15</option>
            <option value="15-20">15 – 20</option>
            <option value="20+">20+</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="audience">Target audience (optional)</label>
        <input
          id="audience"
          className="input"
          type="text"
          placeholder="e.g. early-twenties devs interested in AI tools"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
        />
      </div>

      <ThumbnailUpload
        value={thumbnail}
        onChange={setThumbnail}
        disabled={loading}
      />

      <button className="btn" type="submit" disabled={loading}>
        {loading ? (
          <>
            <span className="spinner" />
            Forecasting…
          </>
        ) : (
          <>Forecast this idea</>
        )}
      </button>

      <div className="footer-row">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={loadExample}
          disabled={loading}
        >
          Try an example
        </button>
      </div>
    </form>
  );
}
