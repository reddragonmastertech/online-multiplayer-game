# Development steps

The original goal, what got built, and what is left. Read
[`Project_Structure.md`](Project_Structure.md) for where the code lives, and
[`PvP_Arena_UI_Architecture_UX_Flow.md`](PvP_Arena_UI_Architecture_UX_Flow.md)
for the product specification.

---

## The goal

A **single always-on Node process** and two browsers. Docker, Redis, USDT and
Supabase stay out. Postgres stays out too: a SQLite file is enough.

**Done when** a friend opens your URL, signs up, gets free RAC, taps JOIN NOW,
plays you at RPS, and the winner's RAC goes up.

## Where it stands

Steps 1–10 are done. Step 11 is code-complete but **not published** — that last
part is a two-device test only you can run.

| Step | Status |
|---|---|
| 1. Freeze the rules | Done. Unchanged since. |
| 2. Shared contracts | Done. `packages/shared` holds every REST body and socket event. |
| 3. RPS engine | Done. `packages/games/rps` decides winners. The browser does not. |
| 4. Match shell | Done. `MatchShell` + `RpsBoard`, reused by CPU practice and live play. |
| 5. Identity + 100 RAC | Done. Signup, login, `/api/me`, JWT on the socket handshake. |
| 6. Queue | Done. In-memory, stake locked on join, refunded on leave or disconnect. |
| 7. Server match loop | Done. Server owns clock, hands, judging and payout. |
| 8. Wire the lobby | Done. Full stranger path, plus live-match discovery and spectating. |
| 9. One site from the API | Done. Fastify serves the bundle and `/socket.io` on one port. |
| 10. Two-browser test | Automated in Playwright. |
| 11. Public URL | Code and runbook ready. **Not published.** |

### To publish

Everything is in [`../deploy/README.md`](../deploy/README.md). The quickest
route needs no accounts at all: a Cloudflare quick tunnel gives an HTTPS URL
that forwards to your machine. `node deploy/smoke.mjs <url>` checks it from
outside.

The remaining acceptance test: phone on cellular and PC on wifi both load the
URL, both sign up, both finish a match, and both balances are right.

---

## The rules, frozen at step 1

Unchanged throughout. They live in `MATCH_RULES`
(`packages/shared/src/economy.ts`), not scattered as literals.

- Best of 3, first to 2. A draw scores nothing.
- 10s server-side timer. A missing hand is chosen at random.
- Hands stay hidden until both are in or the timer fires.
- Stakes: **1 / 5 / 10 RAC** only. USDT stays hidden.
- New accounts start with **100 RAC**.
- Join locks the stake. The winner takes both. No rake.
- Disconnect: 20s grace, then forfeit.

---

## Build log

What each step actually produced, including the decisions that were not in the
original plan. Newest last.

### Steps 1–5 — contracts, engine, shell, identity

Shared Zod contracts, the RPS engine with unit tests, a reusable match shell,
and SQLite-backed accounts.

The database is `apps/api/data/game.db`, opened with **Node's built-in SQLite
driver** rather than `better-sqlite3`, which needs a C++ toolchain. Tables:
users, wallets, ledger entries, matches, match players, match rounds. Signup
writes the 100 RAC bonus.

Also landed before step 5: the public routes `/`, `/lobby`, `/games/:gameId`,
`/watch`, `/leaderboards`, `/account`, in teal-on-navy. The old lobby chat,
ads, missions, rankings and USDT cards are gone from those pages.

### Step 6 — the queue

`apps/api/src/match/queue.ts`, held in one process's memory. A user holds at
most one ticket, which is what stops two tabs on one account pairing with each
other.

Stake moves are `apps/api/src/economy/wallet.ts`. The `available >= stake` test
is part of the SQL `UPDATE`, so concurrent joins cannot overdraw. Ledger
`amount` is always the delta to `available`, so a user's entries sum to their
balance.

Two additions the plan did not list, both needed to prove it works:

- **A socket client for the web app.** There was none — only the shared types.
  Now `apps/web/src/lib/socket.ts` plus `stores/queue-store.ts`.
- **A restart sweep.** Matches left `queued` or `live` by a dead process can
  never resume, so the API cancels them at boot and refunds the stakes. Without
  it every restart stranded RAC in `locked`.

### Step 7 — the match loop

`apps/api/src/match/runtime.ts`. One 250ms ticker drives every live match; the
clock is only broadcast when the whole second changes.

`match:state` is built **per viewer**, so an opponent's hand reads `locked` and
the glyph is never transmitted until the round resolves.

Settlement is `settleRacMatch`: both stakes unlock, then the loser's moves to
the winner, in one transaction. The two payout rows sum to zero — the no-rake
rule, visible in the ledger.

Two decisions:

- **`match:state` carries the round log.** Without it a player who refreshed
  lost their history, because the log only existed in `match:reveal` events
  they had already missed.
- **Closing one tab does not forfeit.** The disconnect grace starts only when a
  user's *last* socket closes.

### Step 8 — discovery and spectating

"Live list from memory + DB" turned out to need spectating too: a `Watch`
button landing on "not your match" is a broken CTA, which the UX spec forbids.

- `GET /api/live` is public. The summary carries names, scores and the pot and
  **no hands**, so there is nothing in it to withhold.
- `match:watch` / `match:unwatch` subscribe a non-player. Spectators get the
  same restricted view an opponent gets. No account needed.
- The server refuses `match:move` and `match:forfeit` from anyone not seated,
  so read-only is enforced server-side, not by hiding buttons.

Also changed here: **player seats no longer show stock portraits.**
`i.pravatar.cc` serves photographs of real people, and attaching one to a real
player's arena name misrepresents them — which started mattering once strangers
could watch. Real seats render initials; CPU practice keeps its stock art.

The e2e suite dropped to **one worker**. Matchmaking is a single global queue
keyed by game/mode/stake, so parallel tests paired with each other's players.

### Step 9 — one port

`apps/api/src/http/web.ts` serves the bundle. It registers last so it cannot
shadow an API route, and its not-found handler turns a client route such as
`/room/:id` into the app shell. `/api`, `/socket.io` and `/health` are excluded
and still return JSON 404s.

- `index.html` is `no-cache`, hashed assets `immutable`. Without that split a
  returning tab keeps an old shell after a deploy.
- The bundle path resolves from the API source, not the working directory.
  `WEB_DIST` overrides it.
- With no bundle present the API starts API-only and says so — the development
  case, where Vite serves the site and proxies here.
- CORS allows `WEB_ORIGIN` and nothing else, echoing that origin rather than
  the caller's.

`pnpm --filter @game-platform/web test:e2e:served` runs the whole suite against
the built bundle on one port. Faster than the dev suite, and closer to what a
visitor gets.

### Step 11 — hosting

See [`../deploy/README.md`](../deploy/README.md). Four code changes, all because
they only matter once this is reachable from the internet:

- **Clean shutdown.** `SIGTERM` stops the match clock, refunds every match
  still running, and closes SQLite properly. PM2 and systemd both restart with
  `SIGTERM`, so without this a restart left stakes locked and the WAL
  mid-write.
- **Rate limits.** Signup is an open endpoint handing out 100 RAC. Capped per
  address per hour; logins per minute. Note the limit counts per address, so
  testers behind one router are a single client.
- **`TRUST_PROXY`.** Behind a tunnel the socket address is the proxy, so
  without this the limiter treats every visitor as the same client.
- **`LOG_LEVEL`,** because `info` logs every request.

### After step 11 — design tokens

A cleanup pass, not a feature. The theme defined `--font-display` and a colour
palette in `index.css`, but components hand-wrote the same values as
`font-[Rajdhani,Inter,sans-serif]` and `text-[#F5F8FD]`. Identical CSS, but the
token stopped being the single source of truth — changing the brand colour
would have left the match room behind.

29 font literals and 53 colour literals in live components now use the token
classes. Artwork colours with no matching token were left alone, as was the
unrouted `components/home/` legacy code.

---

## Deliberately not built

| Thing | Why |
|---|---|
| Docker | SQLite is a file |
| Redis | One process; the queue is in memory |
| Supabase | Our own JWT is enough |
| Postgres | Would need Docker for no gain yet |
| USDT, payments | Out of scope. RAC is play-only credit |
| A second API instance | Would split the queue |
| Email verification, password reset | Testers use email + password |
| Match chat | Specified in the UX doc, not started |
| Leaderboards | Route exists with an honest empty state |
| The six-tab account area | Overview only, until there is more to show |
| Chess, 4×4 | Catalog entries marked `Coming soon` |

Swapping SQLite for the Postgres in `docker-compose.yml` later would not change
the match code or the socket contracts.

---

## Known rough edges

- **`components/home/` is dead code with mock data.** `home-page.tsx` is not
  routed. It still contains fabricated live matches and winners. It should be
  deleted, carefully: `portrait.tsx` and `lobby-data.ts` are still used.
- **`infra/redis.ts`, `infra/supabase.ts`, `infra/queue.ts` are dead.** Nothing
  imports them.
- **The e2e suite showed one unexplained flake** in four runs during step 11 and
  has not reproduced since. Most likely the 10s round clock expiring mid-step
  under load.
- **The web bundle is one ~520 kB chunk.** Vite warns about it. Fine for now;
  code splitting would help a slow connection.

---

## Suggested next work

The detailed, ordered plan is [`Roadmap.md`](Roadmap.md). In short, in rough
order of value:

1. **Publish it** and run the two-device test. Everything else is guesswork
   until real people have played.
2. **Delete `components/home/`** and the dead `infra/` modules.
3. **Match chat** — specified in §5.5 of the UX doc, scoped to the two players.
4. **A second game.** The structure is ready; it is the real test of whether
   the match shell is as game-agnostic as intended.
5. **Leaderboards**, once there are enough matches for a ranking to mean
   anything.
