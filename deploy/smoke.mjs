// Checks a deployed arena from outside. Read-only by default.
//
//   node deploy/smoke.mjs https://your-public-url
//   node deploy/smoke.mjs https://your-public-url --signup   (creates one account)
//
// The --signup pass proves the database is writable and the RAC bonus lands.
// It leaves a real account behind, so skip it against anything you care about.

const base = (process.argv[2] ?? "").replace(/\/$/, "");
const withSignup = process.argv.includes("--signup");

if (!base.startsWith("http")) {
  console.error("usage: node deploy/smoke.mjs <url> [--signup]");
  process.exit(2);
}

let failures = 0;

function check(label, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
}

async function get(path, init) {
  const response = await fetch(`${base}${path}`, { redirect: "follow", ...init });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { response, text, json };
}

console.log(`checking ${base}\n`);

// 1. The process is up.
{
  const { response, json } = await get("/health");
  check("health responds", response.ok && json?.status === "ok", `status ${response.status}`);
}

// 2. HTTPS, because the socket upgrade and the login form both ride on it.
check("served over https", base.startsWith("https://"), base.startsWith("https://") ? "" : "a tunnel or reverse proxy should terminate TLS");

// 3. The site itself, not just the API.
{
  const { response, text } = await get("/");
  const looksLikeApp = text.includes("<div id=\"root\"") || text.includes("<script");
  check("serves the web app", response.ok && looksLikeApp, `status ${response.status}`);
}

// 4. A deep link must reach the app shell, not a 404.
{
  const { response, text } = await get("/games/rps");
  check("deep links reach the app", response.ok && text.includes("<script"), `status ${response.status}`);
}

// 5. An unknown API route must stay JSON.
{
  const { response, json } = await get("/api/definitely-not-a-route");
  check("unknown api routes 404 as json", response.status === 404 && json?.error?.code === "not_found");
}

// 6. The public match directory.
{
  const { response, json } = await get("/api/live");
  check("live directory responds", response.ok && Array.isArray(json?.matches), `${json?.matches?.length ?? "?"} live`);
}

// 7. Private data stays private.
{
  const { response } = await get("/api/me");
  check("private endpoints require a login", response.status === 401, `status ${response.status}`);
}

// 8. Caching, so a deploy actually reaches a returning browser.
{
  const { response } = await get("/");
  const cache = response.headers.get("cache-control") ?? "";
  check("app shell is not cached hard", cache.includes("no-cache"), `cache-control: ${cache || "(none)"}`);
}

if (withSignup) {
  const stamp = Date.now();
  const name = `Smoke${stamp}`;
  const body = {
    name,
    email: `smoke${stamp}@example.test`,
    password: `smoke-${stamp}-pw`,
  };

  const { response, json } = await get("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const rac = json?.wallets?.find((wallet) => wallet.currency === "rac");
  check("signup works and credits RAC", response.ok && rac?.available === 100, `status ${response.status}`);

  if (json?.token) {
    const me = await get("/api/me", { headers: { Authorization: `Bearer ${json.token}` } });
    check("the token is accepted", me.response.ok && me.json?.user?.name === name);
    console.log(`\n      left behind an account: ${body.email}`);
  }
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
