# TubeForecaster 🎬📈

A YouTube-inspired frontend that takes a **channel link** and a **video idea**, then returns an AI-powered forecast: overall score, predicted views, CTR, retention, strengths, risks, stronger title variants, and a thumbnail concept.

Built with **Next.js 14 (App Router)** + plain CSS for a YouTube-native look (dark UI, red accents, rounded pills).

---

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Enable real AI + channel data

Without keys the app uses a deterministic heuristic mock — useful for demos and
offline dev. To get real AI forecasts, pick a provider:

**Option A — OpenRouter (FREE, recommended)**

1. Make an account at <https://openrouter.ai> and grab a key from
   <https://openrouter.ai/keys>.
2. Copy `.env.local.example` → `.env.local` and paste:
   ```
   OPENROUTER_API_KEY=sk-or-v1-...
   OPENROUTER_MODEL=google/gemma-4-31b-it:free
   ```
3. `npm run dev`

The default model `google/gemma-4-31b-it:free` is Google DeepMind's Gemma 4
31B, served free via OpenRouter (rate-limited but $0 per call). Other strong
free options: `openai/gpt-oss-120b:free`, `z-ai/glm-4.5-air:free`,
`openai/gpt-oss-20b:free`.

**Option B — OpenAI direct (paid, pay-per-token)**

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

The result card shows a small badge (**AI · OpenRouter** / **AI · OpenAI** /
**Heuristic mock** / **Fallback mock**) plus the actual model name so you
always know which engine produced the rating.

**YouTube Data API** (optional): If `YOUTUBE_API_KEY` is set, the backend
resolves the channel URL (`/@handle`, `/channel/UC...`, `/c/name`, `/user/name`)
to a real channel and pulls subs, total views, video count, and the **last
~8 uploads with their view counts**. That data is fed into the AI prompt so the
forecast is calibrated to the channel's actual baseline, and a channel card
shows up at the top of the result.

Even the mock backend will rescale its predicted-views range around the
channel's recent average when YouTube data is available.

Default OpenAI model: `gpt-4o-mini`. Override with `OPENAI_MODEL` in `.env.local`.

### History

Every forecast is saved to **localStorage** (last 25). Click any past entry in
the sidebar to re-open the result and repopulate the form. Click **Clear** to
wipe it.

### Re-roll, export, and competitive lookup

- **🎲 Re-roll** — re-runs the forecast on the *same* idea with higher AI
  temperature and a "give me a different angle" nudge in the prompt. Great
  when the first take feels obvious.
- **📸 Save PNG** — exports the result card as a high-DPI PNG (uses
  [html-to-image](https://github.com/bubkoo/html-to-image)). Hides the action
  buttons in the export.
- **🖨️ Print / PDF** — opens the browser print dialog with a light, clean
  print stylesheet so "Save as PDF" produces a one-page report.
- **How similar videos are doing** — when `YOUTUBE_API_KEY` is set, the
  backend also runs `search.list` against the idea, surfaces the top 6 most
  relevant videos with their view counts, *and* feeds them into the AI prompt.
  This makes the AI's competitive analysis evidence-based — a saturated angle
  pulls the score down, a high-performing-but-rare angle pulls it up.

## What's inside

```
app/
  api/forecast/route.js   ← AI call (OpenAI) + channel-info fetch + fallback
  api/forecast/mock.js    ← deterministic fallback forecast
  page.js                 ← the page (3-column: history / form / result)
  layout.js
  globals.css             ← all styles (YouTube-inspired theme)
components/
  ForecastForm.js
  ForecastResult.js
  HistorySidebar.js
lib/
  youtube.js              ← YouTube Data API v3 client
```

## Plugging in a real AI backend

The UI talks to `POST /api/forecast` and expects this JSON shape back:

```jsonc
{
  "score": 78,                                  // 0–100
  "summary": "Above average for your niche…",
  "predictedViews": {
    "label": "80K – 300K",
    "range": "80K – 300K in first 30 days"
  },
  "predictedCTR":      { "value": 8.2, "note": "Above niche avg" },
  "predictedRetention":{ "value": 48,  "note": "Solid" },
  "strengths":  ["…", "…"],
  "weaknesses": ["…", "…"],
  "titleSuggestions": [
    { "title": "I Tried X (It Got Weird)", "ctrLift": 12 }
  ],
  "thumbnailIdea": "Split-frame: your face on the left…"
}
```

The AI call lives in `app/api/forecast/route.js`. It uses the OpenAI-compatible
chat completions API, so both OpenRouter and OpenAI work with the same code.
Responses are parsed with a lenient JSON extractor (strips ```json``` fences,
handles models that prepend prose) and then validated/clamped against a strict
schema before being returned to the UI.

## Notes

- The current scoring is a deterministic mock so the same idea returns the same score (feels real for demos).
- Nothing is stored. No analytics. No external requests from the browser.
