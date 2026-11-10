# Deploying the arena

One Node process serves the API, the websockets and the built site. No Docker,
no Redis, no Postgres: the database is a SQLite file.

**One process only.** Matchmaking and live matches live in that process's
memory. A second instance keeps its own queue, so two players would never meet.
Do not scale this horizontally without moving the queue out of memory first.

## What the machine needs

- Node 22 or newer
- pnpm 10
- git

That is all. TLS comes from the tunnel or reverse proxy in front.

## Configuration

Copy `.env.example` to `.env` in the repository root and fill it in:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
WEB_ORIGIN=https://your-public-url
DATABASE_URL=file:./data/game.db
JWT_SECRET=<a long random string>
TRUST_PROXY=true
```

Notes:

- `JWT_SECRET` has no default in production and the process refuses to start
  without it. Generate one with `openssl rand -base64 48`. Changing it later
  logs everybody out.
- `WEB_ORIGIN` must be the public URL. It is the only origin CORS allows.
- `TRUST_PROXY=true` whenever something terminates TLS in front of the app,
  which is every setup below. Without it the rate limiter sees the proxy's
  address instead of the caller's and limits everyone as one client.
- `DATABASE_URL` is resolved from `apps/api`, so `file:./data/game.db` means
  `apps/api/data/game.db`. An absolute path also works.
- `REDIS_URL` and the `SUPABASE_*` entries stay empty. Nothing reads them yet.

Optional:

| Variable | Default | Purpose |
|---|---|---|
| `LOG_LEVEL` | `info` | `warn` is quieter on a busy box. |
| `WEB_DIST` | `apps/web/dist` | Where the built site is read from. |
| `SIGNUP_RATE_LIMIT` | `10` | Signups per IP per hour. Each mints 100 RAC. |
| `LOGIN_RATE_LIMIT` | `20` | Login attempts per IP per minute. |

The signup limit is counted per client address, and everyone behind one router
shares an address. If your testers are all in the same house or office they
count as a single client, so raise `SIGNUP_RATE_LIMIT` for that session. The
limit exists because signup is an open endpoint that hands out 100 RAC; it is
not protecting anything else.

## Install and build

```bash
git clone <your repo>
cd pvp-online-game-platform
pnpm install
pnpm --filter @game-platform/web build
```

The build must be re-run on every deploy. The API serves whatever is in
`apps/web/dist`, and starts API-only if that directory is missing.

## Running it

### Option A — your own PC plus a Cloudflare tunnel

No open router ports, no server to rent. The tunnel gives you an HTTPS URL that
forwards to the port the app is listening on.

```bash
# terminal 1
pnpm start                       # builds the site, then runs the server

# terminal 2
cloudflared tunnel --url http://localhost:3001
```

`cloudflared` prints a `https://<something>.trycloudflare.com` address. Put that
in `WEB_ORIGIN` and restart the app, otherwise CORS will reject the browser.

A quick tunnel's address changes every time you start it, which means editing
`WEB_ORIGIN` each time. For anything you will share more than once, use a named
tunnel against a domain you own.

**This publishes your development machine to the internet.** The URL is
unauthenticated and anyone who has it can sign up. Stop `cloudflared` when you
are finished testing.

### Option B — a Linux box with systemd

```bash
sudo useradd --system --home /srv/arena arena
sudo chown -R arena:arena /srv/arena
sudo cp deploy/arena.service /etc/systemd/system/arena.service
sudo systemctl daemon-reload
sudo systemctl enable --now arena
journalctl -u arena -f
```

Adjust `WorkingDirectory`, `User` and `ReadWritePaths` in the unit if you do not
use `/srv/arena`.

### Option C — PM2

```bash
pnpm --filter @game-platform/web build
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup          # prints the command that survives a reboot
```

## Put TLS in front

Do not expose port 3001 directly. Either use the Cloudflare tunnel above, or
terminate TLS with Caddy and forward:

```caddyfile
your-public-url {
    reverse_proxy localhost:3001
}
```

Caddy gets a certificate on its own. Whichever you choose, websockets must be
forwarded too — both of the above do that by default. Then set
`TRUST_PROXY=true`.

## Checking it

From another machine:

```bash
node deploy/smoke.mjs https://your-public-url
```

That checks the process, the site, deep links, the public match list, caching,
and that private endpoints still demand a login. Add `--signup` to prove the
database is writable and the RAC bonus lands; it leaves one real account behind.

Then the test that actually matters, which needs two devices:

1. Phone on cellular, PC on wifi. Both open the URL.
2. Sign up on each.
3. Both pick the same stake and tap JOIN NOW.
4. Play the match out.
5. Both check `/account`: winner up by the stake, loser down by it, nothing
   locked.

## Restarts and the database

The process handles SIGTERM: it stops the match clock, refunds any match still
running, and closes SQLite cleanly. systemd and PM2 both send SIGTERM, and the
configs here give it time to finish.

A match cannot survive a restart. Players in one get their stake back rather
than losing it, and anything missed by a hard kill is swept on the next start.

Back up `apps/api/data/`. It holds every account, balance and result. SQLite
runs in WAL mode, so copy the `.db`, `.db-wal` and `.db-shm` files together, or
stop the service first:

```bash
sudo systemctl stop arena
tar czf arena-$(date +%F).tar.gz -C /srv/arena/apps/api data
sudo systemctl start arena
```

## Upgrading

```bash
git pull
pnpm install
pnpm --filter @game-platform/web build
sudo systemctl restart arena      # or: pm2 restart arena
```

Players in a match at that moment are refunded, not charged.

## What is deliberately missing

Nothing here handles real money. RAC is play-only credit with no cash value and
no withdrawal path. There is no email verification, no password reset, and no
moderation tooling. Treat the deployment as a test among people you know, not a
public launch.
