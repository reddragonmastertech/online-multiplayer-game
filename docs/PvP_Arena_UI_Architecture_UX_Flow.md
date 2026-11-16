# PvP Arena — UI Architecture & UX Flow Specification

**Version:** 1.0  
**Status:** Approved product direction / reference for UI implementation  
**Audience:** Product designer, frontend engineer, Cursor AI  
**Initial game:** Rock–Paper–Scissors (RPS)  
**Future games:** Chess, 4×4 and other one-versus-one games  
**Platforms:** Responsive web (desktop, tablet, mobile)

---

## 1. Purpose and product direction

Build a visually polished, user-friendly **multi-game PvP platform**, not a single-purpose RPS website. RPS is the first playable game; the information architecture, component system, navigation, and match-room shell must accommodate additional games without a full redesign.

Core product jobs:

1. **Discover:** Choose a game and find an opponent with minimal friction.
2. **Play:** Understand the match, take actions, communicate appropriately, and see clear results.
3. **Watch:** Observe permitted public matches without affecting play.
4. **Manage:** Review wallet, stats, history, identity, missions, inventory, and settings.

**Design principle:** Make finding and starting a match the lobby's primary action. Promotional content belongs on the public intro page; personal and administrative information belongs in the account area.

The platform may eventually include both free and permitted real-money/token-staked matches. **A country-specific legal and compliance review is a release gate for any real-money or crypto-staked feature.** Do not assume that any mode is lawful merely because the UI can display it.

### 1.1 Terminology

| Term | Meaning |
|---|---|
| **Intro page** | Public marketing/home page introducing the platform. |
| **Main lobby** | Central hub for choosing a game, continuing play, and finding public matches. |
| **Game lobby** | Dedicated discovery/matchmaking page for one game and its modes. |
| **Match room** | Shared visual shell around a live game, including participants, status, game board, and optional chat. |
| **Spectator** | Non-participant viewing an explicitly public match in read-only mode. |
| **RAC** | Existing product-specific balance/token label. Its economic and withdrawal rules are **not yet defined** by this document. |
| **USDT** | Existing stablecoin denomination shown in current UI. Actual availability depends on payment/compliance decisions. |
| **Paid match** | Any entry involving real value or something convertible to real value. Must be gated by authorization and eligibility. |

### 1.2 Out of scope

- Replacing the chosen frontend/backend stack or designing the entire backend.
- Defining exchange rates, payout mechanics, country eligibility, or regulatory classification.
- Building chess or 4×4 game logic in the RPS-first release.
- Inventing live player counts, earnings, testimonials, rankings, or other fabricated social proof.

---

## 2. Product principles and visual goals

1. **Play first:** Game selection and matchmaking lead the visual hierarchy.
2. **Platform-neutral:** The brand and navigation should work for chess and future games, not just RPS.
3. **One main action per section:** Clear primary buttons, restrained secondary controls.
4. **Useful over decorative:** No permanently empty rankings, huge ad modules, or irrelevant sidebars.
5. **Legible in motion:** Timers, scores, round states, choices, and network status must be easy to read.
6. **Trustworthy with money:** State stake, fee, possible payout, balance, transaction outcome, and rules explicitly.
7. **Responsive:** No horizontal overflow; critical actions stay accessible on mobile.
8. **Accessible:** Keyboard navigation, visible focus, readable contrast, labels, and reduced-motion support.
9. **Honest state:** Distinguish a real user, CPU/bot, queued player, spectator, disconnected user, and mock data.
10. **Predictable navigation:** Users can return to a relevant lobby without losing an active match accidentally.

### 2.1 Visual language

- **Mood:** Premium, modern, competitive, calm enough for longer chess sessions; not a crowded casino dashboard.
- **Color direction:** Deep navy/charcoal base, slightly raised surfaces, one primary interactive accent (suggested teal), restrained gold for ranking/rewards, semantic red for danger and warnings. Do not use green, gold, and pink as three competing primary action colors.
- **Typography:** Clear sans-serif text for content, optional expressive display font for titles; do not apply display typography to compact labels.
- **Density:** Spacious game cards and active board; compact secondary data; reasonable vertical rhythm.
- **Artwork:** Distinct artwork/icons for each game, coherent illustration style; never depend on imagery alone to identify a game or status.
- **Effects:** Subtle hover, reveal, and victory animation; no flashing, auto-playing noisy media, or motion that distracts from timed input.

Suggested starting tokens (validate contrast before shipping):

| Role | Example |
|---|---|
| Page background | `#090F1D` |
| Main surface | `#121D2D` |
| Elevated surface | `#1B2940` |
| Border | `#30425B` |
| Primary text | `#F5F8FD` |
| Secondary text | `#B1C0D2` |
| Main accent | `#42DDCD` |
| Prestige/reward accent | `#EBC26A` |
| Danger | `#FF7080` |

Keep tokens configurable; examples are not final brand approval. Use consistent spacing (4/8/12/16/24/32 px steps), card radii, focus treatment, and button hierarchy.

---

## 3. Audience, permissions, and product stages

### 3.1 User roles

| Role | Can do | Cannot do |
|---|---|---|
| **Visitor** | View intro page, browse game information, view permitted public leaderboards/matches. | Join authenticated matches, send player chat, access wallet/private data. |
| **Registered player** | Play eligible free modes, join queues, manage account, use match chat, view own match history. | Use restricted paid features unless eligibility and payment requirements are met. |
| **Eligible paid player** | Enter approved paid modes, use wallet functions, view stakes/fees and transaction history. | Bypass limits, unavailable regions, game restrictions, or compliance checks. |
| **Spectator** | Observe an allowed public match and its public event log. | Submit game moves, manipulate timers, view private player chat or hidden choices. |

Do not require a user to register just to learn which games exist. The transition to a protected action should prompt authentication, preserve intended destination, and return the player to it afterward.

### 3.2 Rollout scope

**MVP / design and implement now**

- Intro page, auth flow, main lobby, RPS game lobby, RPS match room, read-only spectator room.
- Public live-match discovery where appropriate.
- Account overview, profile editing, settings, match history.
- Wallet interface and transaction states **only to the extent supported by the actual backend/payment system**.
- Shared navigation, dialogs, empty/loading/error states, responsive design.
- Room-scoped player chat with block/mute/report affordances when chat is enabled.
- Leaderboards route with a meaningful empty state if the ranking system is not yet active.

**Ready in the information architecture, but feature-gated until real**

- Chess, 4×4, and other game catalogs/modes.
- Missions and mission rewards if the mission backend is not yet supported.
- Inventory, cosmetics, gifts, tournaments, seasons, achievements, friends, invites, rematches when unsupported.
- Regulated cash/crypto modes until eligibility, payments, and responsible-play requirements are approved.

Do not display empty or fake modules merely to fill the screen. `Coming soon` labels are acceptable for a small number of genuinely planned games; no broken CTAs.

---

## 4. Information architecture and routes

Use route names as **illustrative frontend conventions**; adapt them to the existing routing implementation without breaking deployed URLs.

```text
Public
  /                         Intro / marketing home
  /games                    Optional public catalog alias or discovery
  /how-it-works             Rules, platform mechanics, FAQs
  /login                    Accessible auth route (may also open modal)
  /signup                   Accessible auth route (may also open modal)
  /legal/*                  Terms, privacy, eligibility, responsible play

Platform
  /lobby                    Main multi-game lobby
  /games/:gameId            Game-specific lobby
  /watch                    Live/public matches directory
  /matches/:matchId         Active match (player or spectator presentation)
  /leaderboards             Rankings; filter by game and time period

Account (authentication required)
  /account/overview         Balances summary, results, stats, history
  /account/wallet           Deposit, withdraw, transactions, financial tools
  /account/profile          Avatar, public name, slogan, appearance
  /account/missions         Missions and progress (feature flag)
  /account/inventory        Collected items (feature flag)
  /account/settings         Security, privacy, notifications, limits

Utility
  /support                  Help, contact, reporting, dispute guidance
  /404                      Not found / safe navigation
```

### 4.1 Main navigation

**Logged-out header:** Brand | Games | How It Works | Watch (if public) | Log In | Sign Up.

**Logged-in header:** Brand | Games/Lobby | Watch | Leaderboards | Wallet balance summary | Account avatar/menu.

- Use `Games` or `Lobby` consistently as the main entry; avoid duplicating both as equal links if they go to the same location.
- Desktop: single restrained header; tablet/mobile: compact navigation or menu, with Play/Games kept easy to reach.
- Account avatar opens menu with Overview, Wallet, Profile, Settings, Support, and Log Out.
- Header balances display only legitimate balances in their correct units; do not blur promotional rewards with cash balance.
- A user in an active match needs match status and a clear return-to-match affordance on eligible pages.
- Footer links: Rules, Support, Terms, Privacy, Eligibility, Responsible Play, and relevant company/legal details.

### 4.2 Content relocation from current screenshots

| Current lobby element | New location / behavior |
|---|---|
| Large featured match/ad | Remove from lobby; marketing demo/video belongs to intro page. |
| Global chat panel | Remove; put participant chat inside match room. |
| Daily/total mission lists | Account > Missions, with optional small progress shortcut later. |
| Seasonal ranking sidebar | Dedicated Leaderboards page; optional compact preview only if active and populated. |
| Recent winner sidebar | Remove from main lobby; optional privacy-aware public match activity later. |
| RPS stake-only tiles | RPS game lobby, after selecting RPS. |
| Live match cards | Main lobby preview + full Watch directory, filter by game. |

---

## 5. Screen specifications

## 5.1 Intro page — `/`

**Goal:** Explain the platform, introduce the games, establish trust, and take visitors to play/discovery. This is a marketing page, not an active-match dashboard.

**Sections in order:**

1. **Hero:** Platform-neutral headline, concise description, primary `Explore Games` or `Play Now`, secondary `How It Works`.
2. **Product demo:** User-controlled teaser video or interactive preview; poster image before play, muted by default, avoid heavy forced autoplay.
3. **Games gallery:** RPS available; chess/4×4 visually distinct and honestly labeled if unavailable.
4. **How it works:** Choose a game → select mode / find opponent → play and see results.
5. **Fairness and transparency:** Explain matching, rules, publicly described game outcomes, security controls, and published paid-mode fees where applicable.
6. **Competitive features:** Preview rankings/achievements only if genuine; otherwise frame as upcoming.
7. **FAQ:** Is it free? Who can play? How does matchmaking work? Are cash games available in my location? How do I get help?
8. **Footer:** Policies, support, eligibility and responsible-play resources.

**Behavior:**

- `Play Now` from an unauthenticated visitor can go to public game selection. Require auth only when joining a protected mode.
- Auth links retain intended destination.
- Avoid earnings-promising copy such as `Win Bigger, Earn Faster`.
- Money-related content must distinguish free entertainment from optional legally permitted staked play.

**Mobile:** Hero stacks vertically; demo does not consume excessive initial viewport; game cards become a swipeable row or stacked cards with real focus/scroll support.

## 5.2 Main lobby — `/lobby`

**Goal:** Get the user from arrival to a chosen game quickly. Primary interaction: select a game.

**Desktop content order:**

1. **Compact welcome/utility strip:** `Choose your next match`, small connection/availability status. Logged-in state can show `Welcome back, {displayName}`.
2. **Game library grid (primary):** RPS prominent; each card includes artwork, game name, short description, match type/duration estimate if known, availability, and action `Play`/`View Game`.
3. **Quick actions (when applicable):** `Continue Match` if one is active, `Quick Play` for last-used eligible mode, `Create Private Room` if supported.
4. **Live matches (secondary):** Preview 3–6 public matches with game, players, status, round/score, `Watch`. Link to all.
5. **Optional personalized activity:** Last match, personal rank, or recent progress, but only if populated and useful.

**Do not show:** Featured ad/video, public chat, full missions list, full seasonal rankings, recent payout feed, RPS stake denominations as the entire platform homepage.

**Game card states:** Available, Coming Soon, Temporarily Unavailable, Maintenance. Show meaningful reason, never an active `Play` CTA for unavailable games.

**Empty cases:** If no live matches, show `No public matches right now` with a `Start Playing` link; don't invent live activity. If a future game is not ready, disable its action and explain availability.

**Responsive:** Desktop 2–4 game cards per row depending on width; mobile one or two readable cards without squeezed text. Live matches below game selection, not as a tall permanent sidebar.

## 5.3 Game lobby — `/games/:gameId`

**Goal:** Make the selected game's rules and available match types clear, then let a player enter a match.

**Components:**

- Breadcrumb or back navigation: Lobby / {Game name}.
- Compact game header: name, description, rules link, game artwork.
- `Game mode` selector: examples RPS Quick, Best of 3, Best of 5, Private; chess modes are different and configured per game.
- `Play type` selector: Free/Casual and eligible Paid modes; **do not default users into a paid stake**.
- Stake selector **only when eligible paid play is supported**, with amounts and currency; distinguish RAC from USDT.
- Primary action: `Find Opponent` / `Play Free` / `Create Private Room` depending on selection.
- Optional public rooms/queues with honest population and estimated waits only when measured.
- Mini live matches list for selected game.
- Rules and fee disclosure accessible before entering a paid match.

**RPS mode examples:** Free Quick Match, First to 2, Best of 5, Private Challenge. Specific stake presets are configuration, not hardcoded main-lobby components.

**Paid confirmation (when legally enabled):** Show entry stake, balance impact, any commission/fee, prize pool, expected winner payout, draw/refund rules, and explicit confirmation. If ineligible, explain restriction and offer free modes without misleading invitations.

**Guardrails:** If no opponents are available, allow waiting/canceling and optionally a **clearly labeled** CPU practice mode. Never imply a bot is a human opponent, and never permit a bot to impersonate a paid PvP participant.

## 5.4 Matchmaking / waiting state

**Goal:** Make the temporary state informative, safe, and reversible.

- Show selected game, mode, stake/fee if any, search duration, connection status, and `Cancel Search`.
- Don't promise invented wait times. If a measured estimate exists, label it as an estimate.
- On opponent found: show ready confirmation if required, player names, and mode summary.
- Handle cancel, timeout, disconnect, insufficient balance, eligibility change, failed readiness, and match creation failures gracefully.
- For funds: the backend decides reserve/commit/release; UI displays the true authoritative state and never infers that a payment succeeded.

## 5.5 Active match room — `/matches/:matchId`

**Goal:** Put the actual game at center and keep all peripheral controls subordinate to play.

**Shared desktop structure:**

```text
Match header: Back / Game · mode · stake/pot (if applicable) · help · connection

Main playing region                          Chat drawer/panel
  Participant A · score                      Players-only chat
  Game state / clock / round                 Mute · report · collapse
  Participant B · score
  Game-specific interaction surface

Expandable round/move log · Rules · Match details
```

This is a hierarchy sketch, **not a pixel-accurate mockup**. Player cards may be positioned horizontally around the board on desktop and stacked compactly on mobile. Do not let chat shrink the playable board below comfortable size.

**Shared components:**

- Header: game name, game mode, match identifier if useful, status, optional stake/pot/fee summary, exit/back.
- Participant cards: avatar, display name, game-relative score/rating if relevant, active/ready/disconnected state, clear `You` designation.
- Center arena: large, responsive game-specific board/interaction area.
- Status strip: whose turn, current round, timer, connection/reconnect state.
- History drawer: RPS round results; chess moves; any game-specific history.
- Chat panel: private to participating players, optionally collapsed by default for very short games; quick reactions for RPS.
- Result/exit actions: Rematch when supported, Back to Game Lobby, View Match Summary.

**RPS-specific interaction:**

- Display round and objective (e.g., first to 2); clear countdown where used.
- Three large labeled Rock/Paper/Scissors controls; explicit selected/locked/pending states.
- Do not expose opponent's unrevealed selection. Show neutral `Choosing…` or `Locked in` until reveal is allowed.
- Once both choices are resolved, animate brief reveal, name round winner or draw, and append accurate round log.
- Disable repeat submissions after choice locks; never send actions from spectators.
- On time expiry, follow documented server rules for timeout outcome; do not assume forfeiture/refund without configured rules.

**Chess-specific future behavior:** Board and clocks replace RPS buttons. History shows algebraic moves or equivalent. Chat stays available for longer sessions; timers and last move remain prominent.

**4×4-specific future behavior:** Replace board and legal-move interaction, not the shared match shell.

**Navigation safety:** Attempting to leave an active match should explain whether that constitutes resignation/forfeit or allows reconnection. Never silently abandon a paid match. If the app permits navigation without resignation, show `Return to active match` globally.

### Room chat requirements

- **Players-only by default.** Spectators do not see or post private player messages.
- Clearly label `Match chat`; message composer, timestamps where useful, auto-scroll without hijacking reading older messages.
- Profanity/spam protections, rate limits, mute/block/report affordances, and appropriate retention/moderation rules.
- Quick emoji reactions can be first-class in RPS; do not force a typing workflow into a ten-second round.
- Treat chat as optional to gameplay. The user must be able to play even if chat fails or is disabled.
- If public spectator chat is ever added, treat it as a separate, independently moderated channel and never mix it with private player messages.

## 5.6 Spectator room — `/matches/:matchId` (spectator view)

**Goal:** Watch a public match with absolutely no capability to participate.

**Requirements:**

- Clear `Spectating` state in header.
- Same core board and public match progress as participant view.
- Remove/disable all playable controls and private player chat.
- Show public round log/moves only after they are safe to reveal.
- Respect private-room privacy; do not expose secret moves, financial identifiers, private chat, or hidden player information.
- `Back to Live Matches` and optional `Watch Another` actions.
- Handle finished match, spectator limit, public visibility changes, removal, disconnect, and unavailable match.
- Consider delayed spectator updates where fair-play/anti-collusion requirements warrant it.

## 5.7 Live directory — `/watch`

**Goal:** Make public spectator content discoverable without overwhelming the main lobby.

- Filters: Game, status (live/finished when available), possibly mode.
- Match list/cards: player display names/avatars, game type, elapsed/round state, public score, `Watch` action.
- Sort by relevant live status; show honest counts only.
- If no eligible public matches, offer game discovery instead of empty fake cards.
- Do not show private matches or information users opted to keep private.

## 5.8 Leaderboards — `/leaderboards`

**Goal:** Competitive motivation without cluttering the main lobby.

- Filter by game and period: weekly, monthly, season (only if active/configured).
- Rank, avatar, display name, **appropriate game-specific scoring metric**, matches played where relevant.
- Show current player's own position when logged in.
- RPS and chess rankings must not pretend to use equivalent skill metrics; any cross-game score requires a clearly published scoring system.
- If seasons are paused, show an honest paused state and available historical results; hide empty preview panels from lobby.
- A leaderboard entry can link to a player's public profile if allowed; never expose wallet or private details.

## 5.9 Account area — `/account/*`

**Goal:** Separate account management from active gameplay and group related tasks with six predictable tabs.

**Layout:** Profile banner/avatar, name and optional slogan, then persistent account navigation. Desktop uses side navigation or a clear tab bar; mobile uses a compact scrollable tab row or menu with active location visible.

| Tab | Components | Important states / notes |
|---|---|---|
| **Overview** | Profile summary, RAC/USDT summaries if applicable, matches played, wins, win rate, streak, game-specific performance, match history filters. | Meaningful zero-state; define how draws and forfeits affect win rate. Show transaction-specific details in Wallet instead. |
| **Wallet** | Balances by currency and type, deposit, withdraw, transaction log, receipts/status, payment settings, limits. | Separate available/pending/held, promotional vs withdrawable. Pending/failed/succeeded states, eligibility and compliance messaging. |
| **Profile** | Avatar upload, display name, slogan/bio, preview of public profile, save/cancel. | Validate size/type and display-name rules; cropping/preview; explain public visibility. |
| **Missions** | Daily/weekly objective cards, progress, reward/claim state, countdown only when genuine. | Hide behind feature flag until implemented; completed, expired, unavailable and claim-error states. |
| **Inventory** | Cosmetic items, badges, gifts, categories, equip/unequip where supported. | Feature flag until inventory has real data; no phantom economy. |
| **Settings** | Password/security, session devices, 2FA if implemented, notification/privacy preferences, blocked users, responsible-play tools, account closure. | Confirmation for consequential actions; security and limits easy to locate. |

**Match history detail:** Game icon, opponent, date/time, mode, result, score, and if applicable a clearly labeled stake/fee/net settlement. Click/tap row for match detail, where authorized. Do not conflate a win indicator with proof of positive profit.

**Wallet specific requirements:**

- Clearly label each currency and whether it is play-only, promotional, pending, held, or withdrawable.
- Always show fee/conversion disclosures before confirmation, plus success/failure/pending states only after authoritative confirmation.
- Include accessible transaction history with status and date filters.
- Show financial limit and responsible-play links prominently when paid play is offered.
- Never claim payout eligibility solely from a wallet balance or invite a restricted user to deposit.

## 5.10 Authentication: modal + standalone routes

**Goal:** Fast entry with clear, recoverable errors and no lost navigation context.

**Sign in:** Email, password, show/hide, forgot-password action, submit, switch to sign up.  
**Sign up:** Display name, email, password and appropriate verification/consent steps; do not combine marketing consent with required terms.  
**Optional:** Email verification, password reset, 2FA, eligibility checks when relevant.

**Behavior:**

- Modal may open above lobby on protected action; `/login` and `/signup` also work as standalone deep-link routes.
- Preserve intended destination and selected game/mode after successful login.
- Allow closing when login is optional; never trap keyboard focus or strand a visitor.
- Use inline validation and sensible error copy; never expose whether a sensitive account exists unnecessarily.
- Password-manager friendly fields; accessible labels, visible focus, keyboard submission.
- No promised bonus near buttons unless it is real, available, and its conditions are disclosed.

---

## 6. UX journeys and state transitions

### 6.1 Visitor discovers and plays free RPS

1. Opens Intro → `Explore Games`.
2. Main Lobby → chooses `Rock Paper Scissors`.
3. RPS Lobby → reads mode/rules → selects `Free Quick Match`.
4. If unauthenticated, auth modal/route opens; after success, return to the same mode.
5. Waiting state → opponent found → match ready.
6. Match room → choose hands each round → result.
7. Result summary → `Play Again` (if supported) or `Back to RPS Lobby`.

**Exceptions:** User cancels search; no opponent found; session expires; network disconnects; user forfeits; a move times out. Every exceptional state has an understandable explanation and clear safe next action.

### 6.2 Eligible paid match (future, gated)

1. Choose Game → Paid mode → Stake.
2. Check eligibility, jurisdiction, account verification, limits, and actual available balance.
3. Display full confirmation: per-player stake, fees, total pool, payout, draw/refund rules.
4. Explicitly confirm; authoritative server reserves/commits funds as designed.
5. Start match only after server confirms eligibility and funds state.
6. On finish, show official settlement status; wallet reflects actual confirmed outcome.
7. If match fails/disconnects/aborts, show clear pending or refunded status and support path.

**Non-negotiable:** The UI must never determine or settle money independently. All outcomes and balances come from the authoritative service. Actual regulatory approval and anti-fraud controls are separate release gates.

### 6.3 Spectator watches another match

1. Main Lobby → Live preview or Watch directory.
2. Selects a publicly viewable match.
3. Sees spectator banner, player cards, public state and log; no move/chat controls.
4. Match ends → summary → Back to Watch / Back to Lobby.

**Exceptions:** Match becomes private, ends before loading, or becomes unavailable → friendly explanation and safe link back.

### 6.4 Returning user checks account

1. Open profile/avatar → Account Overview.
2. Review stats and match history, filter by game.
3. Navigate Wallet / Profile / Missions / Inventory / Settings.
4. Edit permitted fields, save with success or field-level validation; no silent loss of unsaved changes.

### 6.5 Cross-cutting match lifecycle

```text
GAME_SELECTED
  → MODE_SELECTED
  → [ELIGIBILITY_CHECK / CONFIRM_STAKE if applicable]
  → SEARCHING
  → OPPONENT_FOUND
  → READY_OR_STARTING
  → IN_PROGRESS
  → ROUND_RESOLVING / TURN_CHANGING (repeat)
  → FINISHED
  → RESULT_AND_SETTLEMENT_STATE

Alternative exits: CANCELLED, TIMED_OUT, INELIGIBLE,
DISCONNECTED/RECONNECTING, ABORTED, FORFEITED, ERROR.
```

Only show states the product actually supports. Make transitions resilient to refresh/reconnect and duplicate events. Rehydrating an in-progress match must prioritize the authoritative current state.

---

## 7. Reusable UI architecture

Prefer three layers:

1. **Global app shell:** Brand, navigation, logged-in status, wallet shortcut, dialogs/toasts, footer.
2. **Page templates:** Intro, lobby, game lobby, live directory, match shell, leaderboard, account shell.
3. **Game plugin surface:** Each game's unique board/actions/rules/history interpretation, plugged into a common room.

### 7.1 Suggested component inventory

**Foundations:** Button, IconButton, TextField, Tabs, Badge, Card, Tooltip, Dialog, Drawer, Skeleton, EmptyState, StatusMessage, Toast, Avatar, TimerDisplay, ConfirmDialog, CurrencyAmount.

**Global:** SiteHeader, SiteFooter, AuthModal, AuthForm, AccountMenu, WalletSummary, ConnectionBanner, ActiveMatchShortcut.

**Discovery:** GameCard, GameGrid, ModeSelector, StakeSelector, QueueStatus, LiveMatchCard, LiveMatchGrid, PublicPlayerPreview, LeaderboardPreview.

**Match:** MatchHeader, PlayerSeat, MatchStatusBar, GameSurface, Move/RoundLog, MatchChat, ReactionsBar, SpectatorBanner, MatchResultDialog, MatchDetails.

**Account:** AccountLayout, AccountSidebar/Tabs, StatCard, WalletBalanceCard, TransactionTable/List, MatchHistoryList, ProfileEditor, MissionCard, InventoryItemCard, SettingsSection.

### 7.2 Future-game contract (conceptual)

Each game should provide metadata and its own renderer/interaction model, for example:

```text
GameDefinition
  id, displayName, description, artwork, availability
  supportsSpectating, supportsPrivateRooms, availableModes
  optional free/paid eligibility flags
  rules and match summary labels

GameRenderer (conceptual)
  receives authoritative match state + current viewer role
  renders board and permitted controls
  emits well-defined player intents (not final results)
  exposes game-specific progress/history to shared match shell
```

**Important:** Components must take a `gameId`/game definition instead of assuming `gameId === "rps"` everywhere. New chess or 4×4 renderers should not require rewriting navigation, account, player seats, chat, or match discovery.

**Game-dependent metrics:** A chess rating, an RPS season score, and a 4×4 record are distinct. The shared leaderboard component displays metadata-driven columns/labels; it does not silently normalize unlike scores.

---

## 8. Responsive behavior

Use actual layout constraints, not just scaled-down desktop screens. Breakpoint thresholds can follow the existing project; practical targets:

| Context | Layout priority |
|---|---|
| Wide desktop | Main content centered/max-width; game grid; room board with side chat. |
| Laptop/tablet | 2-column game cards; narrower match details; chat drawer if needed. |
| Mobile portrait | Single-column cards or readable 2-up only when feasible; game board first; sticky critical actions if required; chat opens as drawer/sheet. |

**Match mobile order:** Compact top bar → turn/timer and both player summaries → full usable game surface → current controls → collapsible log/chat. Never place chat before the move buttons. Keep choice controls large enough for touch.

**Account mobile:** Tab menu accessible without six tiny squeezed labels; tables become cards with key details, accessible full history/filter options.

**Auth mobile:** Dialog can become full-screen sheet/page; form must not hide submit button behind keyboard.

**Media:** Images use fixed aspect ratio, lazy-loading where appropriate; demo video has fallback poster; honor reduced motion.

---

## 9. Interaction and content rules

### 9.1 Button hierarchy

- Primary: One prominent action per decision area (`Play`, `Find Opponent`, `Confirm Entry`, `Submit Move`).
- Secondary: Supporting actions (`How to Play`, `Create Private Room`, `Watch`, `Back`).
- Destructive: `Forfeit`, `Cancel Paid Entry`, `Withdraw`, `Close Account` use clear confirmation where appropriate.
- Disabled action must explain what blocks it, especially eligibility or connectivity.

### 9.2 State coverage

Every data-driven section must support:

- Loading/skeleton, populated, empty, stale/reconnecting, failure and retry.
- Unauthorized or expired session.
- Feature disabled/coming soon.
- Timed action expiring during interaction.
- Duplicate submission prevention where applicable.

Avoid fake progress bars or static online counts. If live data is absent, use skeleton or honest empty state.

### 9.3 Copy examples

| Context | Preferred text |
|---|---|
| Main lobby | `Choose your next game` |
| No live matches | `No public matches are live right now.` |
| Waiting | `Looking for an opponent…` |
| Paid entry | `Review your entry details` |
| RPS waiting on opponent | `Opponent is choosing…` |
| Reconnecting | `Connection lost. Trying to reconnect…` |
| Spectating | `You’re watching this match` |
| Locked future game | `Coming soon` |
| Result pending settlement | `Match finished. Settlement is processing.` |

Keep labels honest and neutral. Avoid guaranteed-winning or income claims, artificial scarcity, manipulative countdowns, and congratulating a net loss as a win.

### 9.4 Accessibility baseline

- Target WCAG 2.2 AA where applicable; test actual colors/components, not tokens alone.
- Keyboard-operable menus, tabs, dialogs, game controls, and chat.
- Visible focus and logical focus order; modal focus trap and return to triggering control.
- Semantic form labels, inline error descriptions, screen-reader announcement for key state changes without excessive announcements.
- Do not encode score/result/status solely by green/red color.
- Ensure readable target sizes and game controls on mobile.
- Respect reduced motion; provide captions/transcripts for important intro video content.

Reference: https://www.w3.org/TR/WCAG22/

---

## 10. Real-money UX, privacy, and integrity constraints

These are **design constraints, not legal certification**. Exact regulations vary by jurisdiction, game classification, payment method and license.

1. Show the amount risked, platform fee/commission, currency/token value, possible payout and draw/refund terms **before** entry confirmation.
2. Place financial limits, spend/history and responsible-play options where a player can find them quickly.
3. Distinguish promotional RAC (if applicable) from real, withdrawable funds. Do not imply RAC has real-money value until actual business rules confirm that.
4. Require appropriate age, region, account verification and payment eligibility before enabling real-value play.
5. Explain disconnected matches, forfeits, disputes and settlement delays in plain language.
6. Avoid autoplayed repeat wagers, deceptive win animations, fabricated winner feeds, nudges to chase losses, or income-promising copy.
7. Server authority governs clocks, RNG/outcomes where relevant, legality of player actions, fee calculation, settlement, and user balances.
8. Treat player-to-player chat as a moderated private channel; protect against harassment and leakage of private account data.
9. Spectators receive only allowed public state. For hidden simultaneous moves such as RPS, don't leak selections before reveal. For strategic games, review spectator timing/visibility for integrity.
10. Show real status from services: `Pending`, `Settled`, `Refunded`, `Failed`, etc. A local animation is not proof of funds movement.

Illustrative regulatory UX references (verify against launch jurisdiction):

- UK Gambling Commission — customer account information: https://www.gamblingcommission.gov.uk/standards/remote-gambling-and-software-technical-standards/rts-1-customer-account-information
- UK Gambling Commission — financial limits: https://www.gamblingcommission.gov.uk/standards/remote-gambling-and-software-technical-standards/rts-12-financial-limits

---

## 11. Explicit design decisions

The following are agreed requirements and should **not** be silently reverted during implementation:

1. The platform is multi-game even while only RPS is playable.
2. Remove the full chat panel from the main lobby.
3. Add room-specific chat for the two playing users; spectator access is separate and read-only.
4. Remove the featured-match promotional module from the main lobby.
5. Put marketing/demo videos on the intro page.
6. Move daily and total missions into Account > Missions.
7. Create a dedicated Leaderboards destination; don't retain the giant empty ranking sidebar.
8. Remove recent-winner sidebar from the primary lobby; any future public activity must be honest and privacy-aware.
9. Move stake/mode selection to game-specific lobbies rather than showing only RPS stake tiles on the global lobby.
10. Give account a six-part structure: Overview, Wallet, Profile, Missions, Inventory, Settings (hide unimplemented tabs until appropriate).
11. Keep RPS controls and spectators correctly separated.
12. Keep game-specific functionality inside a reusable match shell.

---

## 12. Implementation order for Cursor

Work incrementally. Preserve existing working functionality while replacing the presentation.

### Phase A — UI foundations and navigation

- Audit current pages/components and existing routes before edits.
- Create theme tokens, button/card/form primitives, responsive container patterns.
- Redesign site header, account menu and modal foundations.
- Establish global IA and route navigation; do not break existing auth or match connections.

### Phase B — Core discovery and intro

- Build/refine public intro page.
- Rework main lobby to game-first layout.
- Build reusable game card and RPS game-specific lobby.
- Relocate/remove old featured ad, global chat, missions and ranking sidebars.
- Build honest loading/empty states.

### Phase C — Match and spectator experience

- Create shared match shell without modifying the authoritative match engine.
- Adapt RPS board/hand selection, player cards, timer and round log.
- Add participant-only chat panel and quick reactions with proper permissions.
- Create spectator variant with no active controls/private messages.
- Handle reconnect, timeout, win/loss/draw, and exit confirmation.

### Phase D — Account and secondary screens

- Implement account layout and Overview, Wallet, Profile, Settings.
- Put mission/inventory interfaces behind capability flags until real.
- Add Watch directory and Leaderboards screens with honest states.
- Align Login and Sign Up modals and standalone routes with new visual system.

### Phase E — QA and expansion readiness

- Check all viewport sizes, keyboard/accessibility, loading/empty/errors.
- Verify auth redirects, game-type isolation, spectator security, financial disclosures and disabled-mode behavior.
- Confirm a placeholder second `GameDefinition` can be displayed without touching RPS-specific renderer logic.
- Remove dead UI code, repeated styles and conflicting legacy components only when safely confirmed unused.

---

## 13. Acceptance criteria

Use as a checklist before declaring the redesign complete.

### Main lobby

- [ ] Game selection is visibly the primary feature above the fold at common desktop sizes.
- [ ] Selecting RPS opens a dedicated RPS lobby, not an RPS-specific section embedded everywhere.
- [ ] No featured promo block, permanent public chat, full mission list, recent winner sidebar or large empty seasonal ranking sidebar.
- [ ] Public live games are clearly labeled; unavailable games are not clickable as playable.
- [ ] Works on mobile without horizontal scrolling or tiny controls.

### Match rooms

- [ ] Participants see game controls; spectators never see usable game controls.
- [ ] Participants can open/collapse private match chat; spectators cannot see it.
- [ ] RPS input reflects choosing, selected, locked, revealed and timed-out states correctly.
- [ ] Round history and score update from authoritative match events.
- [ ] Network loss/reconnection is explained.
- [ ] Leaving an active match does not accidentally conceal a forfeiture.

### Account, auth and wallet

- [ ] Correct six-tab account structure; unavailable functions feature-gated.
- [ ] Profile changes save with validation and feedback.
- [ ] Match history includes results and modes, with game filters if supported.
- [ ] Balance types and units are clear; stake/fees and settlement state are not misleading.
- [ ] Authentication preserves intended navigation and works without mouse.

### Platform readiness

- [ ] `GameDefinition` and `GameRenderer` separation supports future games.
- [ ] Consistent design tokens, button states, cards, icons and typography.
- [ ] Functional on desktop/tablet/mobile, with reduced-motion support.
- [ ] No fabricated online counters or result/revenue claims.
- [ ] Paid modes remain disabled unless approved and fully supported.

---

## 14. Cursor handoff prompt (copy into Cursor with this file attached)

> Read `PvP_Arena_UI_Architecture_UX_Flow.md` in full and treat it as the product/UX source of truth for the PvP Arena UI redesign. First inspect the existing frontend, routes, state, and component structure. Summarize which existing code can be reused and provide a staged implementation plan. Implement the redesign incrementally in the order defined in Section 12, starting with foundations, intro page, multi-game lobby, and RPS-specific lobby. Keep the visual design premium, responsive, and accessible. Preserve existing working authentication, real-time gameplay, and payment logic; don't invent APIs or live data. Use shared game-agnostic components and a game-specific renderer for RPS. Follow the mandatory design decisions and acceptance criteria exactly. Do not implement real-money features or future-game functionality that is not already authorized and supported. After each stage, show the files changed and test/verify the UI behavior.

---

## 15. Open product questions (resolve before implementing gated features)

These are intentionally **not** assumptions in the spec:

1. What is the final platform brand/name beyond the current `RPS Arena`?
2. In which country/countries will real-money or crypto-staked matches legally operate?
3. What exactly is RAC — play-only points, non-withdrawable credits, or convertible value?
4. Are there free human-vs-human matches, CPU practice, or both? Which modes can earn rewards?
5. Can players create private invite-only matches in MVP?
6. Does chat persist after the match, and what moderation/retention policy applies?
7. What constitutes a draw/timeout/disconnect/refund for each mode, particularly paid matches?
8. What is the ranking formula for each game, and are seasons operational at launch?
9. Which account verification, deposit/withdrawal, and responsible-play functions actually exist today?
10. Which future game is next, and what exactly does the planned `4×4` game mean?

These questions do **not** block building the navigation, visual system, or RPS-first UI shell. Use safe feature flags and clear placeholders instead of assuming answers.

