# PvP Arena — Visual UI Mockups

These seven high-fidelity desktop mockups illustrate a common visual direction for the multi-game PvP platform. They accompany `PvP_Arena_UI_Architecture_UX_Flow.md` and are intended as **design references for Cursor**, not code, final product copy, or authoritative application state.

| File | Screen | Primary design intent |
|---|---|---|
| `01_Intro_Page.png` | Public landing page | Clear platform introduction, game previews, and primary discovery action. |
| `02_Main_Lobby.png` | Multi-game lobby | Game selection first; compact live-match discovery; no persistent chat, ads, or missions. |
| `03_RPS_Game_Lobby.png` | RPS matchmaking | Mode selection and free-play CTA; paid mode visibly gated; concise rules. |
| `04_Active_Match_Room.png` | Player game room | Game controls dominate; 2-player room-only chat, timer, score, and round history. |
| `05_Spectator_Room.png` | Read-only spectator room | Public match events and safely hidden choices; no move controls or private chat. |
| `06_Account_Overview.png` | User account | Six-tab information architecture, balances, stats, and match history. |
| `07_Login_Modal.png` | Login overlay | Focused, accessible authentication modal layered over the lobby. |

## Visual direction

- Deep midnight-navy backdrop, layered navy cards, subtle borders.
- Bright teal for primary interaction; small gold accent for prestige/rewards.
- Calm, generous spacing and clear sans-serif typography.
- Game-specific imagery inside the game cards and header art, with usable UI elsewhere.
- Desktop-first reference images; actual implementation must also adapt to tablet and mobile.

## Important implementation notes

1. **The architecture document takes precedence** if a generated image accidentally introduces an unsupported element, wrong label, inconsistent nav item, or extra interaction.
2. All player identities, balances, online counts, rankings, match results, dates and messages in the images are **illustrative fake sample content**, not live business data or requirements.
3. The brand `ARENA` is a working visual direction; use the actual confirmed product brand when implementing.
4. Do not infer functionality from the images. For example, unavailable games, currency modes, notifications, seasons and paid matches must follow real feature flags and supported backend behavior.
5. The spectator view must never expose private chat or hidden/unrevealed game actions; only safe public match state is shown.
6. Do not copy brand-specific artwork or other invented game names from generated imagery. Use licensed/original project assets.
7. The images provide visual hierarchy and aesthetic direction; implement actual interface components in the app's native code, with responsive layouts, keyboard accessibility and real states.

## Suggested Cursor instruction

> Use these PNG mockups as high-fidelity visual references and `PvP_Arena_UI_Architecture_UX_Flow.md` as the behavioral and information-architecture source of truth. Implement the design using existing app patterns and responsive components. Match the spacing, colors, hierarchy, typography and game-card/room composition while preserving functional routing, auth, real-time gameplay, spectator permissions and wallet accuracy. Do not reproduce placeholder counts, players, or payout amounts as real data. Start with the global shell, intro page and main lobby, then the RPS game lobby and shared match-room shell.
