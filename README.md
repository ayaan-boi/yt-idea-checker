# 🎯 YT Idea Checker

An AI-powered tool that analyzes your YouTube video ideas against your channel's real performance data and rates how well they'll do.

## How it works

1. You give it a link to your YouTube channel
2. You describe your new video idea
3. It fetches your channel's stats, recent videos, and top performers via the YouTube Data API
4. Claude AI analyzes the fit and returns a full breakdown

## What you get back

- **Overall Score** `/10`
- **Algorithm Score** — how YouTube's algorithm will treat it
- **Audience Fit Score** — how well it matches your existing audience
- **Trend Score** — relevance to current trends
- **Verdict** — Strong Upload / Good Idea / Needs Tweaking / Risky / Skip It
- **Estimated views** vs your channel average
- **Strengths & weaknesses**
- **Actionable suggestions**
- **Optimized title suggestion**
- **Thumbnail tip**

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/ayaan-boi/yt-idea-checker.git
cd yt-idea-checker
```

### 2. Install dependencies
```bash
npm install
```

### 3. Add your API keys
```bash
cp .env.example .env
```
Fill in `.env`:
```
YOUTUBE_API_KEY=...    # Google Cloud Console → YouTube Data API v3 (free)
ANTHROPIC_API_KEY=...  # console.anthropic.com
```

### 4. Run the server
```bash
npm start
```

Server runs on `http://localhost:3001`

## API Endpoints

### `POST /analyze`
Analyze a video idea against a channel.

**Body:**
```json
{
  "channelUrl": "https://www.youtube.com/@MrBeast",
  "videoIdea": "I gave 100 strangers $1,000 each to see what they spend it on"
}
```

**Response:**
```json
{
  "channel": { "title": "MrBeast", "subscribers": 300000000, ... },
  "idea": "I gave 100 strangers...",
  "analysis": {
    "overallScore": 9,
    "algorithmScore": 9,
    "audienceFitScore": 10,
    "trendScore": 8,
    "verdict": "Strong Upload",
    "summary": "...",
    "strengths": [...],
    "weaknesses": [...],
    "suggestions": [...],
    "estimatedViewsVsAverage": "+60% above channel average",
    "bestTitleSuggestion": "...",
    "thumbnailTip": "..."
  }
}
```

### `GET /channel?url=@handle`
Quick channel stats preview (no idea needed).

## YouTube API Usage
Each `/analyze` call costs ~110 quota units out of the free 10,000/day limit.

## Tech Stack
- **Node.js + Express** — server
- **YouTube Data API v3** — channel & video data
- **Anthropic Claude API** — AI analysis

## License
MIT

