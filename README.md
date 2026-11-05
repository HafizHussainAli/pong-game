# Rally — Pong

A responsive arcade Pong game. The offline game has no build step or package dependencies.

## Play

Open `index.html` in a modern browser, or serve this folder with any static file server.

- **Classic vs CPU:** choose easy, normal, or hard; first to 7 wins.
- **Local 2-player:** Player 1 uses **W/S** and Player 2 uses **↑/↓**.
- **CPU tournament:** play a best-of-three series of first-to-5 games.
- **Time attack:** score as many points as possible in two minutes.
- **Endless rally:** play without a score limit and chase a personal high score.
- Touch screens support paddle movement by dragging on the court.
- Choose who serves before a match and between points; serves have a three-second countdown.
- Open **Settings** for sound effects, generated arcade music, visual effects, and power-ups.
- Your name, personal records, settings, and recent match results are stored in this browser.
- **Share Match** shares the current score or copies a link where sharing is unavailable.

## Enable online rooms and the global leaderboard

Online features require a Supabase project. They are intentionally disabled until you configure one; the offline modes work without it.

1. Create a Supabase project and open **Project Settings → API**.
2. In `supabase-config.js`, set `url` to the project URL and `anonKey` to the **publishable (anon) key**. This key is designed for browser use. **Never put a `service_role` or secret key in this file.**
3. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
4. In **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins**.
5. In **Authentication → URL Configuration**, add your GitHub Pages URL (for this repository: `https://hafizhussainali.github.io/pong-game/`) to the allowed redirect/site URLs.
6. Commit and push the updated `supabase-config.js`, then wait for GitHub Pages to redeploy.
7. Select **Online multiplayer**. One player creates a room and shares the five-character code; the other joins with that code.

Supabase anonymous accounts are browser-local and do not provide cross-device account recovery. The leaderboard only accepts scores from authenticated anonymous users, but scores are not server-verified against gameplay and should be treated as casual arcade records, not a cheat-proof competition. Room codes are public channel names; do not share personal information in game names or room codes.

## Deploy

The GitHub Actions workflow publishes the static site to GitHub Pages whenever `main` is updated. Configure **Settings → Pages → Build and deployment → Source: GitHub Actions** once if Pages has not been enabled for the repository.
