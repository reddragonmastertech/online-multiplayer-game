# Roadmap

What is left to do, in order, and why that order. Read
[`Development_Steps.md`](Development_Steps.md) for what is already built.

Each item names its files and a **Done when** line you can check. Tick the box
when it lands, and record any decision that was not in this plan in the build
log, as the earlier steps did.

---

## Why this order

Two things get harder once the site is public:

- **The database schema.** After publishing, every `game.db` holds real
  accounts. `db/migrate.ts` only creates missing tables, so the first column
  change after launch needs a migration system anyway. It is cheaper to add one
  while the only database is your own.
- **Dead routes.** `/play`, `/missions`, `/ranking` and `/wallet` render blank
  pages today. Strangers will find them.

So the plan is a short **pre-publish** pass, then **publish**, then everything
the published version tells you.

---

## Phase 1 — Before publishing

Small and mechanical. Aim for a day.

### 1.1 Remove the legacy blank routes

- [x] Delete the `AppShell` route group in
      [`apps/web/src/app.tsx`](../apps/web/src/app.tsx) (`play`, `missions`,
      `ranking`, `wallet`), plus `components/layout/app-shell.tsx` and
      `pages/blank-page.tsx`.
- [x] Keep the `*` → `/` redirect by moving it under `ArenaFrame`.
      `e2e/shell.spec.ts` checks that the retired paths land on the intro page.

**Done when** `/wallet` redirects to `/` and nothing imports `AppShell`.

### 1.2 Versioned migrations

- [x] A numbered list of migrations in
      [`apps/api/src/db/migrate.ts`](../apps/api/src/db/migrate.ts). Each one
      runs once, in order, inside a transaction. The version lives in SQLite's
      `PRAGMA user_version` rather than in a table, so it commits or rolls back
      with the migration.
- [x] Migration 1 is today's `CREATE TABLE IF NOT EXISTS` set, so existing
      databases adopt it without changes.
- [x] Test it: a fresh database and today's database both end at the latest
      version (`db/migrate.test.ts`). A real legacy `e2e.db` went from 0 to 1
      with every row intact.
- [x] A database newer than the build refuses to start, rather than running
      against columns the code does not know. Startup logs any migrations it
      applied.

**Done when** adding a column is a new numbered entry, not an edit to an
existing one.

### 1.3 Correct the docs

- [x] [`Project_Structure.md`](Project_Structure.md) §3 says the game stubs feed
      the catalog. They do not: [`lib/catalog.ts`](../apps/web/src/lib/catalog.ts)
      is written by hand and lists chess and 4×4. Describe what is true.
- [x] The docs say that only `portrait.tsx` and `lobby-data.ts` are still used
      from `components/home/`. `intro-preview.tsx` is used too, by the intro
      page.
- [x] The README says nothing reads `REDIS_URL` / `SUPABASE_*`.
      [`config.ts`](../apps/api/src/config.ts) does parse them; nothing uses
      them. This goes away in 3.2.
- [x] Keep **one** rough-edges list, in `Development_Steps.md`, and link to it
      from `Project_Structure.md` §9 instead of repeating it. The README has no
      copy, only its "What this is not" section, which is about scope.

**Done when** every claim in the three docs matches the code.

---

## Phase 2 — Publish

The goal's real acceptance test. Everything after this is guesswork until it
has happened.

- [ ] Follow [`../deploy/README.md`](../deploy/README.md). A Cloudflare quick
      tunnel is enough.
- [ ] `node deploy/smoke.mjs <url>` passes from outside.
- [ ] A phone on cellular and a PC on wifi both load the URL, sign up, finish a
      match, and end with the right balances.
- [ ] Note anything that surprised you. It decides the order of phase 4.

**Done when** the two-device test passes and step 11 in `Development_Steps.md`
reads *Done*.

---

## Phase 3 — Cleanup

Safe deletions, now that the shape is proven.

### 3.1 Retire `components/home/`

The three files still in use move first; then the folder goes.

- [x] `portrait.tsx` → `components/match/portrait.tsx` (used by
      `player-seat.tsx`). Drop the parts only the legacy lobby used.
- [x] `findStake` / `Stake` from `lobby-data.ts` → a small
      `lib/cpu-stakes.ts` (used by `cpu-match-page.tsx`). They now come from
      `MATCH_RULES.racStakes`; the old list also offered USDT tables.
- [x] `intro-preview.tsx` → `components/intro/`.
- [x] Delete the rest of `components/home/` and `pages/home-page.tsx`. Their
      fake live matches, fake winners and chat messages go with them.

**Done when** `components/home/` is gone and the typecheck and the e2e suite
pass.

### 3.2 Retire the dead infra

- [x] Delete `apps/api/src/infra/redis.ts`, `supabase.ts` and `queue.ts`,
      and their packages (`ioredis`, `bullmq`, `@supabase/supabase-js`).
- [x] Remove `REDIS_URL` and `SUPABASE_*` from `config.ts` and `.env.example`.
- [x] Decide on `docker-compose.yml`: keep it as the documented Postgres escape
      hatch, or delete it. Either way, say which in the README.
      **Kept as is**, Redis included. The README says the app uses neither.

### 3.3 Line up the game catalog with the game packages

The catalog offers **chess and 4×4**. The packages are **chess, checkers and
tic-tac-toe**. No 4×4 package exists, and nobody has said what 4×4 is (UX spec
§15, question 10).

- [ ] Decide what 4×4 means, or drop it from the catalog.
- [ ] Delete the stubs that are not planned, or put them in the catalog.
- [ ] Optionally, build the catalog from each package's `manifest`, so a
      package and its catalog card cannot drift apart again.

**Done when** every `Coming soon` card has a package behind it, and every
package is either in the catalog or deleted.

---

## Phase 4 — Features

In rough order of value. Re-rank these after phase 2.

### 4.1 Match chat

Specified in UX spec §5.5. It is listed there as an agreed requirement, not an
option.

- [ ] Contracts first: `chat:send` / `chat:message` in
      `packages/shared/src/socket.ts`.
- [ ] Server: players only. Spectators are refused on the server, not hidden in
      the UI. Rate-limited per user, with a length cap. In memory with the
      match; persistence is a policy decision (spec §15, question 6).
- [ ] Web: a collapsible panel in `match-shell.tsx`, plus quick reactions for
      RPS. On mobile it sits **below** the hand buttons.
- [ ] Mute per opponent, so a player can silence the other side.
- [ ] Tests: a spectator cannot send or receive; play still works when chat is
      off.

**Done when** the spec §13 match-room checks for chat pass.

### 4.2 A second game

The real test of whether the match shell is game-agnostic.

- [ ] Pick the game (3.3 decides the candidates). Tic-tac-toe is the cheapest
      true turn-based case.
- [ ] Engine in `packages/games/<id>`, pure, with unit tests, behind the
      `GameEngine` interface.
- [ ] A board component plus one branch in `game-surface.tsx`.
- [ ] Note every change the lobby, match room, queue or wallet needed. Each one
      is a leak in the abstraction to fix.

**Done when** the second game plays end-to-end with no changes outside its
engine, its board, its catalog entry and its registration, or with the
exceptions written up.

### 4.3 Account area

The spec asks for six tabs. Build only the tabs that have real data.

- [ ] Move `/account` to `/account/overview`, and keep `/account` as a redirect.
- [ ] **Profile:** edit the display name, with the same uniqueness rule as
      signup.
- [ ] **Settings:** change the password, and log out everywhere.
- [ ] **Wallet:** the ledger as a transaction list. The data already exists.
- [ ] Missions and Inventory stay hidden until something backs them.

### 4.4 Leaderboards

- [ ] Wait until there are enough finished matches for a ranking to mean
      something.
- [ ] Rank per game, never across games (spec §5.8). Publish the formula on the
      page.

---

## Phase 5 — Hardening

Do these as they become relevant, not all at once.

- [ ] **Password reset.** Testers who forget their password are locked out.
      Needs email, so it waits for a mail provider decision.
- [ ] **Code splitting.** The bundle is one ~520 kB chunk. Lazy-load the match
      room and the account pages.
- [ ] **The e2e flake.** If it comes back, give the test clock more headroom
      than the 10s round, rather than retrying.
- [ ] **Backups.** Check that the backup step in `deploy/README.md` actually
      runs on the host.

---

## Bring the UX spec up to date

Do this alongside the phases above, not as a separate project.

- [ ] Add a short "Implementation status" note at the top of
      [`PvP_Arena_UI_Architecture_UX_Flow.md`](PvP_Arena_UI_Architecture_UX_Flow.md),
      linking here and to the build log.
- [ ] Mark the §15 questions that are already answered: RAC is play-only (Q3);
      human play and CPU practice both exist (Q4); the timeout and disconnect
      rules are fixed (Q7).
- [ ] Record where the build chose differently: a single `/account` page for
      now; `/room/:id` alongside `/matches/:id`.
- [ ] Tick the §13 acceptance criteria that already pass.

---

## Still out of scope

Unchanged from the build log: no real money, no USDT, no second API instance,
no Redis, no Supabase. Any real-value play needs the legal review described in
spec §1 and §10 before any code.
