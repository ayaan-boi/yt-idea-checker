"use client";

import { useEffect, useRef, useState } from "react";
import ForecastForm from "@/components/ForecastForm";
import ForecastResult from "@/components/ForecastResult";
import HistorySidebar from "@/components/HistorySidebar";

const HISTORY_KEY = "tubeforecaster.history.v1";
const MAX_HISTORY = 25;

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [submittedIdea, setSubmittedIdea] = useState("");
  const [submittedThumbnail, setSubmittedThumbnail] = useState(null);
  const [formSeed, setFormSeed] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const lastPayload = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  function persist(next) {
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {}
  }

  async function runForecast(payload, { isReroll = false } = {}) {
    if (isReroll) setRerolling(true);
    else setLoading(true);
    setError("");
    if (!isReroll) setResult(null);
    setSubmittedIdea(payload.idea);
    setSubmittedThumbnail(payload.thumbnail || null);
    if (!isReroll) setActiveId(null);
    try {
      const res = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, reroll: isReroll }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Forecast failed");
      }
      const data = await res.json();
      setResult(data);
      lastPayload.current = payload;

      const id = `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const entry = {
        id,
        createdAt: Date.now(),
        channel: payload.channel,
        channelLabel: data.channelInfo?.title || null,
        idea: payload.idea,
        niche: payload.niche,
        length: payload.length,
        audience: payload.audience,
        thumbnail: payload.thumbnail || null,
        result: data,
        reroll: isReroll,
      };
      const next = [entry, ...history].slice(0, MAX_HISTORY);
      persist(next);
      setActiveId(id);
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
      setRerolling(false);
    }
  }

  function handleSubmit(payload) {
    return runForecast(payload, { isReroll: false });
  }

  function handleReroll() {
    if (!lastPayload.current) return;
    runForecast(lastPayload.current, { isReroll: true });
  }

  function handleSelectHistory(id) {
    const entry = history.find((h) => h.id === id);
    if (!entry) return;
    setActiveId(id);
    setError("");
    setResult(entry.result);
    setSubmittedIdea(entry.idea);
    setSubmittedThumbnail(entry.thumbnail || null);
    lastPayload.current = {
      channel: entry.channel,
      idea: entry.idea,
      niche: entry.niche,
      length: entry.length,
      audience: entry.audience || "",
      thumbnail: entry.thumbnail || null,
    };
    setFormSeed({ ...lastPayload.current, _stamp: Date.now() });
  }

  function handleClearHistory() {
    if (!confirm("Clear all saved forecasts?")) return;
    persist([]);
    setActiveId(null);
  }

  return (
    <>
      <header className="header no-print">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true" />
          <span>TubeForecaster</span>
          <span className="brand-tag">AI</span>
        </div>
        <div className="spacer" />
        <a className="header-link" href="#how">
          How it works
        </a>
      </header>

      <main className="main main-3col">
        <section className="hero hero-full no-print">
          <h1>
            Tube <span className="accent">Forecaster</span> you
          </h1>
          <p>
            Paste your channel and a video idea. Our AI predicts views, CTR,
            and retention — then tells you exactly how to make it stronger.
          </p>
        </section>

        <div className="grid-3">
          <div className="no-print">
            <HistorySidebar
              items={history}
              activeId={activeId}
              onSelect={handleSelectHistory}
              onClear={handleClearHistory}
            />
          </div>
          <div className="no-print">
            <ForecastForm onSubmit={handleSubmit} loading={loading} seed={formSeed} />
          </div>
          <ForecastResult
            loading={loading}
            rerolling={rerolling}
            error={error}
            result={result}
            idea={submittedIdea}
            thumbnail={submittedThumbnail}
            canReroll={!!lastPayload.current && !loading}
            onReroll={handleReroll}
          />
        </div>

        <p id="how" className="footer no-print">
          TubeForecaster blends your channel's signal with AI pattern matching to
          estimate how a new idea will perform. Predictions are estimates, not
          guarantees. Meta-feature scoring is{" "}
          <a
            href="https://arxiv.org/abs/1611.00687"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
            research-backed
          </a>
          .
        </p>
      </main>
    </>
  );
}
