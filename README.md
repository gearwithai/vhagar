# Vhagar

Sunny's personal dashboard. Health tracking, training plans, nutrition, and a conversational workout logger.

**Live:** https://gearwithai.github.io/vhagar/

---

## What this is

A single self-contained HTML file. No build step, no dependencies to install, no server. Everything — styles, scripts, images, the full FitnessByKush programme — is inlined or embedded as data URLs.

| | |
|---|---|
| Size | ~1.23 MB |
| External requests | one, Chart.js from jsDelivr |
| Storage | browser localStorage |
| Install | Add to Home Screen (PWA manifest included) |

## Pages

- **Home** — month calendar, activity rings (move, exercise, stand, sleep, steps), inbox
- **Fitness → Health tracker** — day-by-day Apple Watch data, trends, data-quality checks
- **Fitness → Training** — gym plan, workout log, dumbbell split, no-equipment sessions, 12-week measurements
- **Fitness → Nutrition** — full plan, balance-your-plate, 45 recipes with macros and method
- **Fitness → Guides** — buffet, ordering out, travel
- **Talk to Vhagar** — conversational workout logging by voice or text
- **Settings** — data source, ring goals, export/import

## Two modes

The same file behaves differently depending on where it runs.

**Inside Claude Cowork** — reads Google Calendar, Gmail and the Apple Watch health export from Drive live, on every open. The mic is blocked (sandboxed iframe without microphone permission).

**Published here** — no Google access. Health data comes from the snapshot baked in at build time, or from a JSON feed URL set in Settings. The mic works, because this is a real https origin.

Detection is `window.cowork?.callMcpTool`. One codebase, no fork.

## Health data feed

Settings accepts a URL to a `health_data.json` in this shape:

```json
{ "records": [ { "date": "2026-07-26", "activity": {...}, "heart": {...}, "body": {...}, "sleep": {...}, "workouts": [...] } ] }
```

A `raw.githubusercontent.com` URL works. A Google Drive share link does not — Drive blocks cross-origin reads.

## Privacy

There is no login. Anyone with the URL sees the health data baked into the file. Keep the URL private, or make the repo private and host elsewhere.

## Deploying

GitHub Pages, `main` branch, `/root`. `.nojekyll` is present so Jekyll does not touch the file.

Push from the parent folder with `publish.ps1`.
