# Project structure

Written for someone who has just cloned this and wants to know where things
live and why. It assumes you can read TypeScript and React but have never seen
this codebase.

Read [`../README.md`](../README.md) first if you have not run it yet.

---

## 1. The shape of it

This is a **pnpm workspace**: one repository holding several packages that
import each other by name instead of by relative path.

```text
pvp-online-game-platform/
├── apps/
│   ├── api/          the server
│   └── web/          the browser app
├── packages/
│   ├── shared/       types both sides agree on
│   ├── game-core/    what a "game" must provide
│   └── games/        one folder per game
├── deploy/           how to host it
└── docs/             why it looks like this
```

`apps/*` are things you run. `packages/*` are libraries they import.

When you see `@game-platform/shared` in an import, that is
`packages/shared`. The mapping lives in [`pnpm-workspace.yaml`](../pnpm-workspace.yaml)
and each package's `package.json` `name` field.

### Why split it up at all

Two reasons, and both earn their keep:

1. **The browser must not decide who won.** Game rules live in
   `packages/games/rps` so the *server* can run them. If the rules sat in the
   React app, a player could edit them in devtools.
2. **The web and the API must agree on every message.** If the client sends
   `{hand: "Rock"}` and the server expects `{move: "rock"}`, nothing tells you
   until it breaks at runtime. Putting the schemas in `packages/shared` means
   the TypeScript compiler catches it.

---

## 2. `packages/shared` — the contract

Every HTTP body and every socket message is defined here once, as a
[Zod](https://zod.dev) schema. Zod gives you a runtime validator *and* a
TypeScript type from the same definition.

| File | Holds |
|---|---|
| `src/common.ts` | ID types, the list of error codes, the error envelope |
| `src/auth.ts` | Signup/login bodies, `User`, and `apiPaths` — every REST URL |
| `src/economy.ts` | `Wallet`, and `MATCH_RULES`: the frozen numbers |
| `src/match.ts` | Match state, rounds, history, the live-match summary |
| `src/socket.ts` | Every socket event name and payload |
| `src/index.ts` | Re-exports everything; this is what others import |

**Start here when adding a feature.** Define the shape first, then the server
and the client both get a compile error until they implement it.

`MATCH_RULES` in `economy.ts` is worth knowing by heart:

```ts
winScore: 2,                 // first to 2 rounds
roundSeconds: 10,            // per round
disconnectGraceSeconds: 20,  // before a dropped player forfeits
revealMs: 1500,              // pause showing the result
signupBonusRac: 100,
racStakes: [1, 5, 10],
```

Nothing hardcodes those numbers elsewhere. Change them here and the UI, server
and tests all follow.

---

## 3. `packages/game-core` and `packages/games/*`

`game-core` defines what a game must provide:

```ts
interface GameEngine<TState, TMove> {
  initialState(players): TState
  applyMove(state, playerId, move): TState
  resolveRound(state): TState
  status(state): { kind: "playing" | "draw" | "winner", ... }
}
```

`packages/games/rps` implements it. `src/engine.ts` is the whole of Rock Paper
Scissors: who beats whom, scoring, and when someone has won. It is pure — no
database, no sockets, no clock. That is why it is easy to test
(`engine.test.ts`) and why the server can trust it.

`chess`, `checkers` and `tic-tac-toe` are **stubs**: a manifest with a name and
player counts, and no logic. The API registers them in its game registry
(`apps/api/src/games/register.ts`), which is why they show up in its startup
log.

They are **not** what the lobby shows. The web catalog is a hand-written list
in `apps/web/src/lib/catalog.ts`, and it offers RPS, chess and `4 × 4`.
Checkers and tic-tac-toe appear nowhere in the UI, and no package exists for
4×4. Lining the two up is [roadmap item 3.3](Roadmap.md).

> Adding a game means writing an engine here and a board component in the web
> app. The lobby, match room, wallet and matchmaking should not need changes.

---

## 4. `apps/api` — the server

Fastify for HTTP, Socket.IO for realtime, SQLite for storage. One process.

```text
src/
├── index.ts          entry point: start, and shut down cleanly
├── server.ts         assembles everything; read this first
├── config.ts         environment variables, validated
├── auth/             who you are
├── db/               SQLite connection and schema
├── economy/          RAC: locking, refunding, settling
├── match/            the queue and the live match loop
├── http/             error helpers, serving the built site
├── games/            registers the game modules
└── infra/            Sentry; also some unused leftovers
```

### `server.ts` — the map

Read this file first. It shows the whole assembly in order:

1. Create the Fastify app and open the database
2. CORS, restricted to `WEB_ORIGIN`
3. `/health`
4. Auth and account routes
5. Socket.IO, with JWT checked on the handshake
6. Release matches a previous process left unfinished
7. The match gateway (queue + live matches)
8. `GET /api/live`
9. Serve the built website — **registered last**, so it can never shadow an
   API route

### `auth/`

| File | Role |
|---|---|
| `routes.ts` | `POST /api/auth/signup`, `/login`, `GET /api/me`, `GET /api/matches` |
| `password.ts` | Hashing. Never stores a plain password |
| `jwt.ts` | Signs and verifies the token |
| `session.ts` | Reads a user and wallet out of the database |
| `socket.ts` | Checks the same JWT when a socket connects |

Signup and login sit inside rate-limited scopes, because signup is an open
endpoint that hands out 100 RAC.

### `db/`

- `client.ts` — opens the SQLite file, turns on WAL, runs migrations.
- `migrate.ts` — a numbered list of migrations. The file records how far it
  has got in SQLite's `user_version`; each newer migration runs once, in its
  own transaction. To change the schema, **add** an entry with the next
  number. Never edit one that has shipped: databases past it will not run it
  again.
- `schema.ts` — Drizzle table definitions, used for typing.

Six tables: `users`, `wallets`, `ledger_entries`, `matches`, `match_players`,
`match_rounds`.

### `economy/wallet.ts` — the money rules

Small file, highest stakes. Three operations:

- `lockRacStake` — moves RAC from `available` to `locked` when you join a queue
- `refundRacStake` — moves it back when you leave or a match is abandoned
- `settleRacMatch` — unlocks both stakes, then moves the loser's to the winner

Two invariants it exists to protect:

1. **You cannot overdraw.** The `available >= stake` check is part of the SQL
   `UPDATE`, not a read followed by a write, so two simultaneous joins cannot
   both succeed on the same balance.
2. **The ledger explains the balance.** Every entry's `amount` is the change to
   `available`, so a user's entries always sum to their `available`. The two
   payout rows of a match sum to zero — that is the no-rake rule, visible in
   the data.

### `match/` — the heart of it

| File | Role |
|---|---|
| `queue.ts` | Who is waiting. Pure, in-memory, no sockets — so it is testable |
| `runtime.ts` | Live matches: the clock, the hands, judging, settling |
| `gateway.ts` | Translates socket events into queue and runtime calls |
| `store.ts` | Writes match rows; releases matches a dead process left behind |
| `history.ts` | Reads finished matches back for `/account` |

**`queue.ts`** holds at most one ticket per user. That is what stops you
pairing with yourself across two tabs.

**`runtime.ts`** is the biggest file and worth reading carefully. One 250ms
ticker drives every live match. The important function is `stateFor`, which
builds the view **for one specific viewer**:

- your own hand: visible to you
- your opponent's hand: `locked` until the round resolves
- a spectator: both `locked` until the round resolves

The hand is never sent to someone who should not see it. That is enforced
here, not by hiding something in the UI.

**`gateway.ts`** is where cheating gets refused. A move from someone who is not
seated, a second move in one round, a move after the match ended — all rejected
with an error code, and nothing changes.

### `http/web.ts`

Serves `apps/web/dist`. The interesting part is the not-found handler: a URL
like `/room/abc123` is not a file, so it returns `index.html` and lets React
Router handle it. Anything under `/api`, `/socket.io` or `/health` is excluded,
so a mistyped endpoint returns a JSON 404 instead of a web page.

### `infra/`

`monitoring.ts` initialises Sentry if `SENTRY_DSN` is set.

`redis.ts`, `supabase.ts` and `queue.ts` are **dead code** — leftovers from an
earlier plan. Nothing imports them. Do not take them as a sign that this uses
Redis or Supabase; it does not.

---

## 5. `apps/web` — the browser app

React 19, Vite, Tailwind v4, React Router, Zustand.

```text
src/
├── main.tsx        mounts React
├── app.tsx         every route
├── index.css       the theme: colours and fonts as CSS variables
├── pages/          one file per route
├── components/     reusable pieces
├── stores/         shared state
└── lib/            API client, socket client, helpers
```

### `stores/` — where state lives

Four Zustand stores. Each is a plain object with values and the functions that
change them; any component can read one without prop-drilling.

| Store | Owns |
|---|---|
| `session-store` | Who is logged in, their wallet, the token |
| `queue-store` | Are we searching for a match, and did we find one |
| `match-store` | The live match: state, round log, result |
| `ui-store` | Is the auth dialog open |

Both `queue-store` and `match-store` attach listeners to the **same** socket
from `lib/socket.ts`. Each guards with its own `bound` variable so listeners
are attached exactly once.

**The wallet is never calculated in the browser.** After anything that moves
RAC, the store calls `refresh()` and re-reads the real balance from the server.

### `pages/`

One file per route in `app.tsx`. The ones that matter:

| Page | Route | Does |
|---|---|---|
| `intro-page` | `/` | Marketing home |
| `lobby-page` | `/lobby` | Pick a game; preview live matches |
| `game-lobby-page` | `/games/:gameId` | Pick a stake, JOIN NOW, wait |
| `game-room-page` | `/room/:id`, `/matches/:id` | Play, or spectate |
| `account-page` | `/account` | Balance and match history |
| `watch-page` | `/watch` | Every live match |
| `cpu-match-page` | `/vs/:stakeId` | Practice. Runs entirely in the browser |

`game-room-page` is the most involved: it decides player vs spectator from the
server's `viewerRole`, never from a local guess.

### `components/`

| Folder | Holds |
|---|---|
| `layout/` | Header, footer, page frame |
| `auth/` | The login/signup dialog |
| `catalog/` | Game cards, artwork, the live-match list |
| `match/` | The match room, split for reuse |
| `intro/` | The tap-a-hand rules preview on the intro page |
| `ui/` | `Button` |

`components/match/` is deliberately split so a second game can reuse it:

- `match-shell.tsx` — the frame: header, two player seats, the board slot,
  round history. Knows nothing about Rock Paper Scissors.
- `game-surface.tsx` — picks a board from `gameId`.
- `rps-board.tsx` — the three hand buttons. **The RPS-specific part.**
- `player-seat.tsx`, `round-log.tsx`, `match-closed.tsx` — shared pieces.
- `portrait.tsx` — stock art for the **CPU** opponent only. Real players get
  initials, never a photograph.

Adding chess means writing `chess-board.tsx` and one line in `game-surface.tsx`.

### `lib/`

| File | Role |
|---|---|
| `api.ts` | `fetch` wrapper; attaches the token, unwraps errors |
| `socket.ts` | One Socket.IO connection, keyed by token |
| `protocol.ts` | Re-exports the shared types for convenience |
| `catalog.ts` | The game catalog shown in the lobby |
| `cpu-stakes.ts` | The CPU practice stakes, taken from `MATCH_RULES` |
| `utils.ts` | `cn()` for merging Tailwind classes |

### `index.css` — the theme

Colours and fonts are CSS variables under `@theme`:

```css
--primary: #42ddcd;    /* teal accent */
--background: #090f1d; /* deep navy */
--gold: #ebc26a;       /* scores, rewards */
--danger: #ff7080;
--font-display: Rajdhani, Inter, sans-serif;
```

Tailwind turns each into a utility: `text-primary`, `bg-background`,
`font-display`. **Use those, not hex codes.** Writing `text-[#42DDCD]` produces
identical CSS but silently stops following the token, so changing the brand
colour would leave that element behind.

---

## 6. Following one match through the code

The useful exercise. A player presses a hand button:

1. **`rps-board.tsx`** calls `onPick(hand)`.
2. **`game-room-page.tsx`** passes it to `match-store.move()`.
3. **`match-store.ts`** emits `match:move` over the socket and marks the hand
   pending so the button shows as selected. *It does not decide anything.*
4. **`gateway.ts`** receives it, checks the sender is seated and has not
   already moved this round, then calls `runtime.move()`.
5. **`runtime.ts`** records the hand. If only one player has moved, it sends
   each side a state built by `stateFor` — the mover sees their hand, the
   opponent sees `locked`.
6. When both have moved, `runtime` calls `rpsEngine.resolveRound()` in
   **`packages/games/rps/engine.ts`** — the only place a winner is decided.
7. `runtime` writes the round to `match_rounds`, emits `match:reveal` to
   everyone in the room, and pauses for `revealMs`.
8. If someone has reached 2, it calls `settleRacMatch` in
   **`economy/wallet.ts`**: both stakes unlock, the loser's moves to the
   winner, four ledger rows, one transaction. Then `match:over`.
9. **`match-store.ts`** stores the result and calls
   `session-store.refresh()`, which re-reads the real balance.

Notice what the browser never does: judge a round, change a score, or move RAC.

---

## 7. Tests

| Where | What | Run |
|---|---|---|
| `packages/games/rps/src/engine.test.ts` | The rules | `pnpm test` |
| `packages/game-core/src/registry.test.ts` | Game registration | `pnpm test` |
| `apps/api/src/db/migrate.test.ts` | Fresh, legacy and newer databases; rollback on failure | `pnpm test` |
| `apps/api/src/economy/wallet.test.ts` | Locking, refunds, ledger | `pnpm test` |
| `apps/api/src/match/queue.test.ts` | Pairing, no self-pairing | `pnpm test` |
| `apps/api/src/match/runtime.test.ts` | Clock, hidden hands, settling | `pnpm test` |
| `apps/api/src/server.test.ts` | Startup, shutdown, rate limits | `pnpm test` |
| `apps/api/src/http/web.test.ts` | Which URLs are the app vs the API | `pnpm test` |
| `apps/web/e2e/*.spec.ts` | Two real browsers playing | `pnpm test:e2e` |

The runtime tests inject a fake clock, so a 10-second round and a 20-second
disconnect grace are tested in milliseconds.

The browser tests run **one worker at a time**. Matchmaking is a single global
queue, so parallel tests would pair with each other's players.

---

## 8. Where do I change…?

| I want to… | Go to |
|---|---|
| Change a game rule number | `packages/shared/src/economy.ts` → `MATCH_RULES` |
| Change how RPS is scored | `packages/games/rps/src/engine.ts` |
| Add an API endpoint | `packages/shared/src/auth.ts` (`apiPaths`), then `apps/api/src/auth/routes.ts` |
| Add a socket event | `packages/shared/src/socket.ts`, then `apps/api/src/match/gateway.ts` |
| Change what a spectator can see | `apps/api/src/match/runtime.ts` → `stateFor` |
| Change the match room layout | `apps/web/src/components/match/match-shell.tsx` |
| Add a game board | New component + a branch in `game-surface.tsx` |
| Change colours or fonts | `apps/web/src/index.css` |
| Add a database table or column | A new numbered entry in `apps/api/src/db/migrate.ts`, then `schema.ts` |
| Change how it is hosted | `deploy/` |

---

## 9. Traps worth knowing

- **One process only.** The queue and live matches are in memory. A second
  instance means two players never meet.
- **Some code is dead.** Do not take `apps/api/src/infra/` as a sign that this
  uses Redis or Supabase. The current list is
  [Known rough edges](Development_Steps.md#known-rough-edges) in the build log.
- **`pnpm dev` and the tests use different databases.** Accounts you create by
  hand will not appear in test runs. That is intentional.
- **Port 3001 may serve a stale site.** It serves whatever was last built. In
  development, use 5173.
- **The signup rate limit counts per IP.** Everyone behind one router is one
  client. Raise `SIGNUP_RATE_LIMIT` when testing with people on your network.
- **Never edit a shipped migration.** Add a new one. An older build refuses to
  open a database a newer build has migrated, so roll back by restoring a
  backup, not by redeploying old code.
