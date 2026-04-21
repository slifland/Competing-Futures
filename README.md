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

This build now expects Supabase Auth plus the follow-up migrations in
[supabase/migrations/20260327_auth_profiles_and_memberships.sql](/Users/sethlifland/dev/Competing-Futures/supabase/migrations/20260327_auth_profiles_and_memberships.sql),
[supabase/migrations/20260408_game_flow_state.sql](/Users/sethlifland/dev/Competing-Futures/supabase/migrations/20260408_game_flow_state.sql), and
[supabase/migrations/20260415_rules_engine_refresh.sql](/Users/sethlifland/dev/Competing-Futures/supabase/migrations/20260415_rules_engine_refresh.sql).

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

The app now follows the Google Doc ruleset instead of the original placeholder logic:

- track start states match the `Rules` tab and use `0..10` bounds
- each actor has a real deck, a hidden hand, and a hidden endgame objective
- event draw uses the quadrant-weighted probabilities from the doc
- action order comes from the hidden event card for the round
- action cards resolve with the doc formulas, success/failure paths, and most card-specific choices
- victory uses hidden declarations, the doc’s endgame rolls, the path-dependent Frontier AI rule, and the final tiebreak ladder
