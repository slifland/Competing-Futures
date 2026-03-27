# Competing-Futures

Proof-of-concept React mockup for the Team Indigo strategy game.

## Stack

- React frontend via Vite
- Ready to deploy on Vercel
- Designed so turn state can later move into Supabase Postgres

## Local development

```bash
npm install
npm run dev
```

## Current scope

This build is intentionally a mockup:

- five playable powers are visible at once
- each power has one representative action card
- round flow and global events are simulated locally
- private objectives are shown as placeholder win pressure text

The next layer would be wiring turns, auth if needed, and persisted game state to Supabase.
