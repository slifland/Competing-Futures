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

Required environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

Set both in local `.env` and in the Vercel project environment settings before deploying.

## Auth and roles

This build now expects Supabase Auth plus the follow-up migration in
[supabase/migrations/20260327_auth_profiles_and_memberships.sql](/Users/sethlifland/dev/Competing-Futures/supabase/migrations/20260327_auth_profiles_and_memberships.sql).

What it adds:

- Google sign-in
- a `profiles` table with app-level roles: `admin` or `player`
- a `game_memberships` table that ties authenticated users to specific games and seats
- a `player_private_state` table so objectives and selected actions are no longer exposed on the public player rows
- game lifecycle helpers so authenticated users can create games, join by code, claim seats, and keep completed games in their own history

Current admin rule:

- `sethlifland11@gmail.com` is treated as `admin`
- everyone else is created as `player`

Supabase dashboard setup still required:

1. Enable the Google provider in Supabase Auth.
2. Add your local and deployed app URLs to the allowed redirect URLs.
3. Run the new SQL migration.
4. Insert rows into `public.game_memberships` for any player accounts that should be attached to a game and power.

## Current scope

This build is intentionally a mockup:

- five playable powers are visible at once
- each power has one representative action card
- round flow and global events are simulated locally
- private objectives are shown as placeholder win pressure text

The next layer would be wiring turns, auth if needed, and persisted game state to Supabase.
