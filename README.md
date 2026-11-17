# PvP Arena

A multiplayer game platform where two people play Rock Paper Scissors against
each other for RAC, a play-only arena credit. The server owns the clock, the
hands and the payout; the browser only sends intent.

Rock Paper Scissors is the first game, not the point. The lobby, match room,
spectator view and account area are game-agnostic so chess or a 4×4 game can be
added without rewriting navigation, matchmaking or the wallet.

> **RAC has no cash value and cannot be withdrawn.** There is no payment
> integration and no real-money play. See [What this is not](#what-this-is-not).

---

## Run it

Needs **Node 22+**, **pnpm 10**, and git.

```bash
pnpm install
pnpm dev
```

- Web: <http://localhost:5173>
- API: <http://localhost:3001>

`pnpm dev` runs Vite and the API together. Vite proxies `/api` and `/socket.io`
to the API, so you only ever open 5173.

### Play a real match locally

Matchmaking needs two people, so open a second **private/incognito window** (not
just a second tab — they would share a login). Sign up in each, pick the same
stake, press JOIN NOW in both.

### Run it the way a visitor gets it

```bash
pnpm start
```

Builds the site and serves everything — pages, API and websockets — from
<http://localhost:3001> on one port. This is the production shape. No Vite.

---

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Vite + API, hot reload, two ports |
| `pnpm start` | Build the site, serve it and the API on one port |
| `pnpm typecheck` | TypeScript across every package |
| `pnpm test` | Unit tests (engine, queue, wallet, server) |
| `pnpm build` | Build everything |

From `apps/web`:

| Command | What it does |
|---|---|
| `pnpm test:e2e` | Browser tests against the dev server |
| `pnpm test:e2e:served` | Same tests against the built bundle on one port |

The end-to-end tests drive two real browsers through signup, matchmaking and a
whole match. They need Chromium once:

```bash
pnpm --filter @game-platform/web exec playwright install chromium
```

They run on their own ports with their own throwaway database, so they never
touch your development data.

---

## Configuration

Everything has a working default for development; you only need a `.env` to
host it. Copy `.env.example` to `.env` in the repository root.

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3001` | |
| `HOST` | `0.0.0.0` | Use `127.0.0.1` when a tunnel fronts it |
| `WEB_ORIGIN` | `http://localhost:5173` | **The only origin CORS allows.** Must be the public URL when hosted |
| `DATABASE_URL` | `file:./data/game.db` | Relative to `apps/api` |
| `JWT_SECRET` | dev-only default | **Required in production**; the process refuses to start without it |
| `TRUST_PROXY` | `false` | `true` behind a tunnel or reverse proxy |
| `SIGNUP_RATE_LIMIT` | `10` | Per IP per hour. Everyone behind one router counts as one |
| `LOGIN_RATE_LIMIT` | `20` | Per IP per minute |
| `LOG_LEVEL` | `info` | |
| `WEB_DIST` | `apps/web/dist` | Where the built site is read from |

`SENTRY_DSN` (API) and `VITE_SENTRY_DSN` (web) are optional and turn on error
reporting.

---

## Hosting

**One process only.** Matchmaking and live matches live in that process's
memory. A second instance keeps its own queue, so two players would never meet.

[`deploy/README.md`](deploy/README.md) covers the Cloudflare tunnel (no account
needed), systemd, PM2, TLS, backups and upgrades. To check a deployment from
outside:

```bash
node deploy/smoke.mjs https://your-url
```

---

## How it fits together

```text
apps/web          React + Vite. Pages, stores, the socket client.
apps/api          Fastify + Socket.IO. Also serves the built site.
packages/shared   Zod schemas for every REST body and socket event.
packages/game-core  The contract a game module implements.
packages/games/*  Per-game rules. rps is the only playable one.
deploy/           Runbook, systemd unit, PM2 config, smoke check.
docs/             Product spec, build log, structure guide.
```

The browser never decides who won. It sends `match:move`; the server runs the
engine in `packages/games/rps`, writes the result, and tells both sides.

**New to the codebase?** Read [`docs/Project_Structure.md`](docs/Project_Structure.md)
— it walks through every folder, what each file is for, and traces one match
from button press to payout.

| Document | What it is |
|---|---|
| [`docs/Project_Structure.md`](docs/Project_Structure.md) | Every folder and file, written for someone new |
| [`docs/Development_Steps.md`](docs/Development_Steps.md) | What was built, in order, and why |
| [`docs/Roadmap.md`](docs/Roadmap.md) | What is left to do, in order, with done-when checks |
| [`docs/PvP_Arena_UI_Architecture_UX_Flow.md`](docs/PvP_Arena_UI_Architecture_UX_Flow.md) | The product and UX specification |
| [`deploy/README.md`](deploy/README.md) | Hosting runbook |

---

## The rules, frozen

- Best of 3, first to 2 wins. A draw scores nothing.
- 10 seconds per round. A missing hand is chosen at random.
- Hands stay hidden until both are in or the clock runs out.
- Stakes are 1, 5 or 10 RAC. New accounts start with 100 RAC.
- Winner takes both stakes. There is no rake.
- Disconnect: 20 seconds of grace, then forfeit.

---

## What this is not

- **Not real money.** RAC is play-only credit. No deposits, no withdrawals, no
  payment processor. Adding one would make this a regulated product in most
  places and needs legal review first.
- **No email verification, password reset, or moderation tools.**
- **Not multi-instance.** See the hosting note above.
- Chess and 4×4 appear in the catalog as `Coming soon` and are not playable.
- Spectating works; match chat, leaderboards and the full account area are
  specified in the UX document but not built.
