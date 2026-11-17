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

**Skipped by decision:** no new games for now. The catalog and the stub
packages stay as they are, and the mismatch stays in the build log's rough
edges.

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

- [x] Contracts first: `chat:send` / `chat:message` (plus `chat:history` for a
      reload) in `packages/shared/src/socket.ts`, rules in `chat.ts`.
- [x] Server: players only. Spectators are refused on the server, not hidden in
      the UI. Rate-limited per user (5 per 10s), capped at 200 characters. In
      memory with the match and dropped when it ends; nothing is stored.
- [x] Web: a collapsible panel in `match-shell.tsx`, plus quick reactions for
      RPS. On mobile it sits **below** the hand buttons.
- [x] Mute per opponent, so a player can silence the other side. Local only.
- [x] Tests: a spectator cannot send or receive (`gateway.test.ts` with real
      sockets, `e2e/chat.spec.ts`); every other match test plays without
      touching chat.
- [ ] Not done: reporting a message. There is no moderation backend to send a
      report to.

**Done when** the spec §13 match-room checks for chat pass.

### 4.2 Paid version: USDT rooms

Two currencies that never mix. **RAC is the free version, USDT is the paid
version.** There is no exchange rate and no transfer in either direction.

| | RAC (free) | USDT (paid) |
|---|---|---|
| How you get it | 100 on signup | Deposit USDT on-chain |
| Starting balance | 100 | 0 |
| Stakes | 1 / 5 / 10 | 0.2 / 0.5 / 1 / 2 / 5 / 10 |
| House cut | None, winner takes both stakes | **10% of the pot** |
| CPU practice | Yes | No |
| Cash value | None | Real, withdrawable |

The match rules are the same in both: best of 3, 10-second rounds, 20-second
disconnect grace. Example of the cut: two players stake 1 USDT, the pot is
2 USDT, the house keeps 0.2 and the winner receives 1.8. A refunded match (for
example, one that never started) returns both stakes in full, with no cut.

USDT amounts are stored as **whole integers of 0.000001 USDT** (the token's own
precision), never as decimals, so rounding can never create or lose money. Every
stake and every 10% cut divides exactly.

Built in four parts, in this order. Parts A to C each end with the typecheck,
the unit tests and the e2e suite passing.

#### Part A: two currencies in the game

- [x] **Rules** in `packages/shared/src/economy.ts` (`CURRENCY_RULES`): a
      stake list, a house cut (RAC 0%, USDT 10%) and a signup balance per
      currency, plus `formatAmount` and `parseAmount`.
- [x] **Migration 2** in `apps/api/src/db/migrate.ts`. The wallets, ledger and
      matches already had a `currency` column, so it only gives every existing
      account a USDT wallet at 0 and adds `house_ledger`, where each cut is
      recorded. RAC rows are untouched.
- [x] **Wallet** (`apps/api/src/wallet/*`): stake lock, payout, cut and refund
      per currency. A test checks that no operation ever moves value between
      RAC and USDT.
- [x] **Matchmaking** (`apps/api/src/match/queue.ts`): the queue key is game +
      currency + stake, so a RAC player never meets a USDT player.
- [x] **Lobby:** RAC and USDT tabs, with both balances in the header. Until
      deposits exist, a USDT room you cannot afford disables JOIN NOW and says
      top-up is not open yet; Part B turns that into a **Top up** button. CPU
      practice is offered on the RAC tab only.
- [x] **Match room, result and history** show the currency, and for USDT the
      cut, everywhere an amount appears.
- [x] **Tests:** both currencies through the queue, the payout and the e2e
      suite; two players on the same stake in different currencies are never
      paired (`queue.test.ts`, `runtime.test.ts`, `gateway.test.ts`,
      `e2e/usdt.spec.ts`).
- [x] **Admin script** `pnpm --filter @game-platform/api balance`: shows a
      player's balances, or corrects one by hand with an `adjustment` ledger
      row. It is the "test script" below, and the first piece of part D.

**Done when** two players can finish a USDT match (balances seeded by a test
script) and the database shows the winner +stake×0.8, the loser −stake and the
house +stake×0.2, with RAC untouched. **Done:** `e2e/usdt.spec.ts` plays a
1 USDT match from 5 USDT each and ends at 5.8 / 4 / house 0.2, RAC still 100.

#### Part B: deposits

The flow in the payment screenshots: a **USDT** card under Wallet → payment
method, and a **Top Up By USDT** dialog with **ERC20 / BEP20 / TRC20** tabs.

- [x] **Settings:** the three receiving addresses come from `.env`
      (`USDT_ADDRESS_ERC20`, `USDT_ADDRESS_BEP20`, `USDT_ADDRESS_TRC20`), never
      from code, and are checked at startup. Minimum 3 USDT, deposit fee 1%,
      confirmations 19 (TRC20) / 15 (BEP20) / 12 (ERC20). **No API keys
      needed:** the server reads receipts over plain JSON-RPC (free public
      nodes by default, any provider URL can be set) and TronGrid.
- [x] **Save your sending wallet first.** A TxID is public, so anyone could
      paste someone else's. The server only credits a transfer that came
      **from** the wallet the user saved for that network. An
      address can be saved on one account only.
- [x] **Claim by TxID:** the user pays, pastes the transaction ID, and the
      server checks it on the chain: sent to our address, the real USDT
      contract (not a look-alike token), from the user's saved wallet, enough
      confirmations, at least the minimum, and never claimed before. It then
      credits **amount − 1%** to the USDT balance.
- [x] **Migration 3:** `deposit_wallets` (user, network, address) and
      `deposits` (TxID **unique**, network, amount, fee, credited, time). The
      ledger credit and the deposit row are written in one transaction, so a
      TxID can never be credited twice.
- [x] **Web:** the dialog from the screenshots (address, copy button, the
      notes about minimum, confirmation time and fee), the save-wallet step,
      the TxID box with its status, and a deposit history list on the account
      page. In the lobby, an unaffordable USDT stake shows **Top up USDT**.
      **No QR code:** it would need a new library and the screenshots do not
      have one.
- [x] **Tests** with faked chain answers, so no test touches a real network:
      a good claim, the same TxID twice, the wrong receiving address, a fake
      token, a transfer from another wallet, below the minimum, and not yet
      confirmed. One e2e test of the dialog
      (`deposits/service.test.ts`, `routes.test.ts`, `chain.test.ts`,
      `e2e/usdt.spec.ts`). The real readers were also checked once by hand
      against live USDT transfers on all three chains.
- [x] Mark ERC20 as expensive: Ethereum gas often costs more than a small
      deposit. TRC20 and BEP20 are the recommended networks.

**Done when** a real small TRC20 deposit on the live site shows up in the
user's USDT balance, and claiming the same TxID again is refused.
**Waiting on the owner:** the receiving addresses in `.env`, a restart, and
one real deposit of at least 3 USDT.

#### Part C: withdrawals, with manual admin approval

The server never holds a private key and never sends money by itself.

- [x] **Request:** the user asks to withdraw an amount to their saved wallet
      for a network (the same wallet saved for deposits). The amount moves
      from the balance to `locked` straight away, so it cannot be staked while
      waiting. One waiting request per player.
- [x] **Admin list:** pending requests with the user, amount, network and
      address. The admin sends the USDT from their own wallet, pastes the TxID
      and marks the request **paid**, or **rejects** it, which unlocks the
      amount back to the balance.
- [x] **Admin access:** an `is_admin` flag on the user, set from the command
      line (`pnpm --filter @game-platform/api admin -- "<name>" on`), never
      through the API, and read from the database on every admin call. Every
      decision records who made it and is logged. The page is `/admin`.
- [x] **Migration 4:** `withdrawals` (user, amount, network, address, status
      `pending` → `paid` / `rejected`, payout TxID, admin, times).
- [x] The user sees each request's status in their wallet history, with the
      payout TxID or the rejection reason.
- [x] Withdrawal rules decided: **minimum 10 USDT, fee 1%**. The fee is taken
      from the amount requested, so a 10 USDT request locks 10 and pays out
      9.9.

**Done when** a request goes pending → paid with the balance right at every
step, and a rejected request returns the full amount. **Done:**
`withdrawals/service.test.ts` and `e2e/usdt.spec.ts` check both paths.

#### Part D: running real money

- [ ] **Admin lookup:** find a user and see their deposits, withdrawals,
      matches and ledger.
- [ ] **Daily reconciliation:** the sum of USDT balances (including locked)
      must equal deposits credited − withdrawals paid − house cuts. A mismatch
      is logged as an error.
- [x] **House earnings:** `pnpm balance` prints the total of match cuts,
      deposit fees and withdrawal fees in `house_ledger`.
- [ ] **Backups before every upgrade,** now a hard rule rather than advice.
- [x] **Legal, before Part B goes live.** The owner has confirmed that it is
      legal where the site operates. Recorded in the build log.

### 4.3 A second game

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

### 4.4 Account area

The spec asks for six tabs. Build only the tabs that have real data.

- [ ] Move `/account` to `/account/overview`, and keep `/account` as a redirect.
- [ ] **Profile:** edit the display name, with the same uniqueness rule as
      signup.
- [ ] **Settings:** change the password, and log out everywhere.
- [ ] **Wallet:** the ledger as a transaction list, per currency. The data
      already exists. The USDT deposit and withdrawal screens from 4.2 live
      here.
- [ ] Missions and Inventory stay hidden until something backs them.

### 4.5 Leaderboards

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

No second API instance, no Redis, no Supabase. No conversion between RAC and
USDT, and no automatic payouts: every withdrawal is sent by hand.

USDT is no longer out of scope: it is planned as the paid version in 4.2. The
owner has confirmed the legal side.
