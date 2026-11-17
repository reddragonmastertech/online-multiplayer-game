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

### Roadmap phase 1 — before publishing

See [`Roadmap.md`](Roadmap.md). Done before publishing because both would be
harder once strangers have accounts:

- **The blank legacy routes are gone.** `/play`, `/missions`, `/ranking` and
  `/wallet` rendered an empty page in an older app shell. They now redirect to
  the intro page.
- **Migrations are versioned.** The version is SQLite's `user_version` rather
  than a table, because it then commits or rolls back with the migration
  itself. The existing schema became migration 1, all `IF NOT EXISTS`, so every
  database made by the old migrator adopts it without a change. A database
  newer than the build refuses to start, which makes rolling back a restore
  from backup rather than a redeploy. The runbook says so.
- **The docs match the code again,** and the rough edges are kept in one list.

### Roadmap phase 3 — cleanup

- **`components/home/` is gone,** with `pages/home-page.tsx` and all their fake
  live matches, winners and chat. The three files still in use moved:
  `portrait.tsx` to `components/match/` (trimmed to the CPU portrait),
  `intro-preview.tsx` to `components/intro/`, and the CPU stake lookup to
  `lib/cpu-stakes.ts`.
- **CPU practice no longer offers USDT tables.** The old stake list carried
  `0.1`, `0.2` and `0.5 USDT` next to the RAC ones, so `/vs/0-1-usdt` opened a
  "0.1 USDT MATCH" despite the rule that USDT stays hidden. The stakes now come
  from `MATCH_RULES.racStakes`, the same list live play uses, and the e2e suite
  checks both.
- **The Redis, BullMQ and Supabase leftovers are gone:** the three
  `infra/` modules, their npm packages, and the `REDIS_URL` / `SUPABASE_*`
  settings. An old `.env` that still sets them keeps working; the config
  ignores keys it does not know.

### Roadmap phase 4 — match chat

The two seated players can talk during a match; nobody else can.

- **Spectators are kept out by the server, not the UI.** They share the match
  room so they get reveals and results, which means chat cannot be a room
  broadcast. The gateway checks the sender is seated and emits each message to
  the two players' own sockets.
- **It lives and dies with the match.** `match/chat.ts` holds messages in
  memory, up to 50 per match; a reload gets them back through `chat:history`.
  When the match ends the chat is dropped. Nothing touches the database, so
  there is no retention question yet.
- **Abuse limits are small and local:** 200 characters, 5 messages per 10
  seconds per player, and a mute that hides the opponent on your own device.
  There is no reporting, because there is nowhere to send a report.
- **Quick reactions** (`👍`, `GG`, …) are ordinary messages sent in one tap,
  so nobody has to type during a ten-second round.
- **The first API tests with real sockets** (`match/gateway.test.ts`), because
  "a spectator who sends anyway is refused" is a gateway rule that unit tests
  of the chat module cannot reach.

### Decision — a paid version in USDT (planned, not built)

This reverses "USDT stays hidden". The plan is Roadmap step 4.2.

- **Two currencies that never mix.** RAC stays free (100 on signup, stakes
  1 / 5 / 10). USDT is the paid version: deposited on-chain, starting balance
  0, stakes 0.2 / 0.5 / 1 / 2 / 5 / 10. No exchange rate, no transfer between
  them.
- **The house keeps 10% of the pot** in USDT matches. RAC matches have no cut.
- **Deposits** go to fixed ERC20 / BEP20 / TRC20 addresses set in `.env`. The
  user saves their sending wallet, pastes the TxID, and the server verifies it
  on the chain before crediting the amount minus a 1% fee.
- **Withdrawals are approved by hand.** An admin sends the USDT and marks the
  request paid. The server never holds a private key. Minimum 10 USDT, fee 1%.
- **Legal:** the owner has confirmed that it is legal where the site operates.

### Roadmap 4.2 part A — USDT rooms

The paid version plays; money cannot get in or out yet except by hand.

- **Most of the schema was already there.** `wallets` was keyed by user and
  currency, and the ledger and matches carried a `currency` column, but every
  query said `'rac'`. Migration 2 only adds a USDT wallet at 0 for every
  existing account and a `house_ledger` table. The wallet functions lost
  their `Rac` names and each takes a currency.
- **Amounts are integers of the smallest unit.** 1 RAC, or 0.000001 USDT, so
  a 1 USDT stake is `1000000`. Every stake and every 10% cut divides exactly,
  and `formatAmount` / `parseAmount` convert without floating point. One
  stake schema serves both currencies, which means the server checks each
  stake against that currency's list: `5` in USDT is refused rather than
  read as 0.000005 USDT.
- **The cut comes off the winner's side.** Settlement still writes the same
  unlock and payout rows; in USDT the winner gets a `house_cut` row as well
  and the house gets a `house_ledger` row. Players plus house always sum to
  what came in, and a test checks it. Refunds never take a cut.
- **The queue needed nothing.** Its key already included the currency.
- **The lobby has RAC / USDT tabs,** the header shows both balances, and the
  match room, result, history and live list print amounts in the match's
  currency. CPU practice stays RAC-only. The FAQ, how-it-works and legal
  pages no longer say paid play does not exist.
- **`pnpm balance`** is a hand tool for showing or correcting a balance. Each
  change is an `adjustment` ledger row. Until deposits land it is the only way
  to put USDT in, which is how the e2e paid match is set up.
- **The e2e suite showed load failures** on this machine while about 13 GB of
  other browser processes were running (`ERR_INSUFFICIENT_RESOURCES`, a
  crashed worker, 30s timeouts). Every test passed when rerun.

### Roadmap 4.2 part B — USDT deposits

A player pays on-chain, pastes the transaction ID, and the server checks it
on the chain before crediting amount − 1%.

- **No API keys after all.** The plan assumed Etherscan and BscScan keys.
  Reading the receipt directly over JSON-RPC (`eth_getTransactionReceipt`)
  gives the same facts, works with any node, and the defaults are free
  public endpoints. Tron goes through TronGrid. Swapping in a paid provider
  is one `.env` line.
- **The sending wallet is the proof of ownership.** A TxID is public, so the
  server only credits a transfer that came from the wallet the player saved
  beforehand, and an address can be saved on one account only. If someone
  saves another person's address first, the real owner is told it is taken
  and has to go to support; that is the price of not asking for a signed
  message.
- **Checks, in order:** network open, TxID well-formed, wallet saved, not
  already claimed (all before touching the chain), then on the chain:
  succeeded, real USDT contract, to our address, from the saved wallet, at
  least 3 USDT, enough confirmations. "Not found" and "not deep enough" are
  `deposit_pending`, so the player tries again; nothing is stored for a
  failed claim.
- **USDT on BNB Smart Chain has 18 decimals,** not 6. Amounts are converted
  with BigInt and any dust below 0.000001 USDT is dropped.
- **A double credit is impossible by construction:** `deposits` has
  UNIQUE (network, tx_id), and the deposit row, the balance, the ledger row
  and the fee in `house_ledger` are one transaction.
- **The browser tests use a fake chain:** `DEPOSIT_CHAIN_FAKE_FILE` points
  the e2e server at a JSON file the test writes. The config refuses it in
  production. The real readers were run once by hand against live USDT
  transfers on Ethereum, BNB Chain and Tron.
- **No QR code** in the dialog: it would need a new library and the
  screenshots have none.

### Roadmap 4.2 part C — USDT withdrawals, approved by hand

The player asks; an admin sends the USDT from their own wallet and marks it
paid, or rejects it. The server never holds a key.

- **One wallet per network, both ways.** The payout goes to the wallet the
  player saved for deposits. That wallet is already tied to one account, so
  there is no second address to verify or to be tricked into changing.
- **The amount is locked when asked,** in the same transaction as the
  request, so it cannot be staked or asked for twice. Minimum 10 USDT, 1% fee
  taken from the amount (a 10 USDT request pays out 9.9). One waiting request
  per player keeps the admin list readable.
- **Paid** drops the amount from `locked` and books the fee to
  `house_ledger`; **rejected** returns the whole amount to `available` with a
  ledger row, and the player sees the reason. Only a pending request can be
  decided, and the status check is inside the UPDATE, so two admins cannot
  both decide one. A payout TxID can settle one request only.
- **Admins are made from the command line** (`pnpm admin`), never through the
  API, and `is_admin` is read from the database on every admin call, so
  taking it away works at once. `/admin` lists what is waiting with the exact
  amount, network and address to send to.
- **The ERC20 gas cost is the house's.** The admin pays gas when sending; a
  1% fee on a 10 USDT ERC20 withdrawal (0.1 USDT) will not cover it.

---

## Deliberately not built

| Thing | Why |
|---|---|
| Docker | SQLite is a file |
| Redis | One process; the queue is in memory |
| Supabase | Our own JWT is enough |
| Postgres | Would need Docker for no gain yet |
| Automatic USDT payouts | Withdrawals are sent by hand by an admin; the server never holds a key |
| A second API instance | Would split the queue |
| Email verification, password reset | Testers use email + password |
| Chat reporting and moderation | Mute exists; there is nowhere to send a report |
| Leaderboards | Route exists with an honest empty state |
| The six-tab account area | Overview only, until there is more to show |
| Chess, 4×4 | Catalog entries marked `Coming soon` |

Swapping SQLite for the Postgres in `docker-compose.yml` later would not change
the match code or the socket contracts.

---

## Known rough edges

The one list of these. Other docs link here rather than repeating it.

- **The game catalog and the game packages disagree.** The lobby offers chess
  and 4×4 (`apps/web/src/lib/catalog.ts`). The stub packages are chess,
  checkers and tic-tac-toe, and there is no 4×4 package.
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
2. **The paid version:** USDT rooms, deposits and hand-approved withdrawals.
   Decided; see the decision entry above.
3. **A second game.** The structure is ready; it is the real test of whether
   the match shell is as game-agnostic as intended. Deferred for now by
   decision.
4. **The account area** beyond the overview: profile, settings, the ledger as
   a wallet page.
5. **Leaderboards**, once there are enough matches for a ranking to mean
   anything.
