# game-platform

Modular multiplayer game platform. Step 1 is the workspace shell: a blank web UI and an API process with no product behavior.

## Layout

```text
apps/web                  React + Vite
apps/api                  Fastify + Socket.IO
packages/shared           Shared Zod schemas
packages/game-core        Game module contract and registry
packages/games/rps        Rock Paper Scissors module
packages/games/tic-tac-toe
packages/games/chess
packages/games/checkers
```

Game packages currently export a manifest only. Matchmaking, wallets, auth, and gameplay are later steps.

## Run

```bash
pnpm install
pnpm dev
```

- Web shell: http://localhost:5173
- API health: http://localhost:3001/health

The API listens and registers game manifests. It does not serve lobby, match, or wallet routes.

PostgreSQL and Redis are described in `docker-compose.yml` for later steps. Copy `.env.example` to `.env` when those services are connected.
