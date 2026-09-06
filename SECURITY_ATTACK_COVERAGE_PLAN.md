# Security attack coverage — the scan is done; this is what it left

The row-by-row scan this file used to only propose has been run against
`boilerplate-node-backend`. Its output is
[`docs/theory/web-attack-defences.md`](docs/theory/web-attack-defences.md), now extended from the
authentication-only pass to every catalog section this repo has a surface for. This file is what
is left over: the findings that need a change rather than a row, and the second repo that still
has no page at all.

## What the scan changed

`docs/theory/web-attack-defences.md` gained ten sections — §1 beyond NoSQL, §5/§20, §6, §7, §8,
§12, §14 re-walked, §15, §16, §17, §19, §21 — and a consolidated "What is still open" that
replaces the old "Not mitigated" list. Two headline results:

- **The three modules the old version of this file worried most about are the ones that came back
  cleanest.** `orders`/`payments`/`inventory` keep money in branded integer minor units, own the
  lifecycle as a total actor-aware map, and hold stock behind conditional writes. No request
  carries a price, a currency, a shipping cost or an owner id. §5 and §20 close almost entirely.
- **The gaps are not in the business logic. They are in the dependency tree, the datastore
  credentials, and one policy that was never written.** See below.

## Findings that need a change, in the order worth doing them

### 1. ~~The audit alarm is inverted~~ — DONE

The production tree went from 7 advisories (3 high) to **one `low`** — `esbuild`'s dev-server file
read, unreachable because `tsx` uses esbuild as a transpiler and never starts its server. The CI
threshold is now `--audit-level=moderate`, so the job is green and the next reachable advisory is
not filtered out the way these were.

| Package          | From   | To     |
| ---------------- | ------ | ------ |
| `mongoose`       | 9.3.3  | 9.9.5  |
| `qs`             | 6.15.3 | 6.16.0 |
| `body-parser`    | 2.2.2  | 2.3.0  |
| `puppeteer-core` | 24.40  | 25.10  |

**Two things were not the non-breaking bumps `npm audit fix` advertises**, and both are worth
knowing before the next dependency pass:

- **mongoose's own types broke, on a MINOR bump.** 9.9 stopped accepting `unknown` in the
  `TQueryHelpers` slot, so `Model<Doc, unknown, …>` in `orders`, `products` and `users` no longer
  compiled — those three were the outliers, the other ten models already used the default, so the
  fix made them consistent rather than working around anything. A second break needed the
  `QueryFilter` cast `create-repository.ts` already uses, because spreading a
  `Record<string, unknown>` scope widens the filter past what the generic accepts. Bisecting showed
  the advisory is patched from **9.7.4** and that EVERY patched version has that second break —
  there was no version that both closed the advisory and compiled untouched.
- **puppeteer-core 25 is ESM-only** and dropped its CommonJS build. Any jest suite reaching
  `adapters/pdf.ts`, even transitively through a route table, failed to PARSE. Carving it into
  `transformIgnorePatterns` just moved the error to `@puppeteer/browsers` and would have cascaded;
  a lazy `import()` does not help either, since `tsconfig.jest.json` is `module: node16` and
  downlevels it to `require()`. The suite now maps the package to
  `tests/support/puppeteer-core.stub.ts`, whose `launch` THROWS — nothing wanted the real package
  (CI installs no Chromium, `INSTALL_CHROMIUM` defaults to false), and a silent no-op would let a
  test pass while asserting nothing. v25 also removed `networkidle0` from `setContent`, replaced
  with `'load'`; the invoice template loads nothing external, so it costs nothing.

The allowlist from step 4 was NOT built — the puppeteer major removed the only advisory that
would have needed one. Still the right move if an unfixable finding ever parks the job on red;
`ci.yml`'s own comment now says so.

### 2. ~~Mongo runs as root~~ — DONE

**Is this bad?** Not as an entry point. It is not exploitable as the stack ships: the database
publishes no port, and the connection string only exists inside the app container. Nothing in this
finding is reachable from the internet.

It is a **blast-radius** problem. The app connects with `authSource=admin` as the account
`MONGO_INITDB_ROOT_*` creates — the instance's root user. So the moment that connection string
leaks (an env dump in an error, a `.env` committed by accident, a compromised container, a debug
endpoint someone adds), what the attacker gets is not "this application's data" but:

- **`dropDatabase` on anything**, including databases this app never touches;
- **user management** — create a new Mongo user and the access survives rotating the app's own
  credential;
- **`admin.system.users`** — the hashed credentials of every other user of the instance.

With a `readWrite`-on-one-database user, the same leak gets an attacker exactly what the
application could already read anyway. That is the whole delta, and it is why this is worth a day
rather than a sprint.

**Done:** `.docker/mongo-init.js` creates a scoped `readWrite` user on `MONGO_DB` the first time
the volume is empty, and `docker-compose.production.yml` connects as it (`MONGO_APP_USER` /
`MONGO_APP_PASSWORD`) instead of root. `MONGO_ROOT_USER` / `MONGO_ROOT_PASSWORD` remain, for
maintenance access only.

### 3. ~~Redis has no password~~ — DONE

**What is actually at stake.** Redis here is not only the response cache: it is also the
rate-limit store (`infrastructure/http/middlewares/rate-limit-store.ts`, a separate connection to
the same server). And the cache read path replays a stored entry verbatim —
`response.status(cachedResponse.status).json(cachedResponse.body)` — with the key shaped
`identity?params:user:<id>:locale`.

So anyone who reaches Redis unauthenticated can:

- **read every cached API response**, across all users, in bulk;
- **reset rate-limit budgets**, which removes the brute-force and submission brakes;
- **write a poisoned entry for a NAMED user** — user ids appear in URLs and responses, so the key
  is guessable — and the application will serve that attacker-chosen status and body back to them
  as a cache HIT.

The third one is the reason this is worth more than "it's only a cache". It is a stored-response
injection with a per-user target.

**Is this bad?** Same answer as finding 2: not an entry point — no published port, so it needs
network position first. But `--requirepass` is one line in the compose command and one in the
URL, on the same `:?`-refuses-to-start pattern `MONGO_PASSWORD` and `RABBITMQ_PASSWORD` already
use. There is no reason for it to be the one credential that trusts the network.

**Done:** `docker-compose.production.yml`'s `cache` service now runs `--requirepass`
(`REDIS_PASSWORD`), and `NODE_REDIS_URL` carries it. `NODE_RATE_LIMIT_REDIS_URL` needed no
change — unset, it already falls back to `NODE_REDIS_URL`.

### 4. Email verification is enforced nowhere — moved out

Split into its own plan: [`EMAIL_VERIFICATION_PLAN.md`](EMAIL_VERIFICATION_PLAN.md). It turned out
to be two problems sharing one mechanism — nothing reads `verified`, AND an email change binds the
new address before it is proven while never telling the old one — plus a product decision about
where the guard mounts. Too much to carry as a bullet here.

### 5. ~~Anti-automation~~ — moved out

Split into its own plan: [`ANTI_AUTOMATION_PLAN.md`](ANTI_AUTOMATION_PLAN.md). It grew past a
bullet once the shape became clear — four independent rungs, each switched on by one environment
variable and each off by default, because a boilerplate must not choose a CAPTCHA vendor on a
project's behalf. The free tier (identity-keyed rather than address-keyed limits) is the part that
should have been there already.

### 6. ~~`additionalProperties: false` is decorative at runtime~~ — DONE

**What the problem is: the contract states a rule that nothing enforces.** Every module fragment
declares `additionalProperties: false` on its request bodies. orval turns that into
`zod.object({…})` — not `.strict()` — and Zod STRIPS unknown keys rather than rejecting them. A
request carrying a field the contract forbids is answered `200`.

Nothing is exploitable: the stripped field never reaches a service, which is precisely why the
generated schemas count as a mass-assignment defence elsewhere in the defences page. The cost is
truthfulness, and it is paid by everything downstream that believes the contract:

- the generated Postman / Insomnia / Bruno / Mockoon collections and the Prism mock all describe
  an API that rejects unknown fields;
- the paired frontend's generated client is typed against the same promise;
- schemathesis and the contract suites are asserting against a document that says one thing while
  the server does another — today that is a gap in coverage, tomorrow it is a failing test nobody
  can explain;
- and the day someone cites "the contract rejects unknown fields" as a security argument in a
  review, they will be wrong.

**Done:** `orval.config.ts` sets `override.zod.strict.body = true` — `body` only, since no
controller ever runs a generated response schema through `safeParse` at runtime, so making those
strict too would add risk for no gain. `parseBody` needed no change: it already answers 422 for
any `ZodError`, `unrecognized_keys` included.

Two hand-composed schemas turned out to inherit strictness from the generated body schemas they
build on, and needed a decision each rather than a blanket exemption:

- `updateProfile`'s `zodProfileSchema` (`PUT /account`) is now correctly strict — `admin`,
  `active` and `password` are refused outright rather than silently dropped, which is the
  intended tightening. The escalation test in `self-service.test.ts` was updated to assert the
  422 instead of a success that ignored the extra fields.
- `userService.validateData`, the admin panel's create/edit FORM validator, calls `.strip()` on
  its schema locally rather than inheriting strict from `zodUserSchema`: a PUT body legitimately
  carries `id` — row identity, not user data — so this ONE caller stays lenient while
  `zodUserSchema`'s other callers (signup, the schema `validateData` itself builds on) keep the
  strictness their own contracts require.

### 7. Smaller, and honest about being smaller

- ~~**Slow HTTP.**~~ Done: `applyServerTimeouts` sets `headersTimeout` 15s and `requestTimeout`
  120s (Node ships 60s/300s), both configurable. Verified empirically first — `headersTimeout`
  counts from a request's first byte rather than the socket's, so it may safely sit below
  `keepAliveTimeout`, and `requestTimeout` bounds receipt only, so tightening it cannot cut off a
  slow PDF render. `keepAliveTimeout` is exposed at Node's own 5s: the right value depends on the
  proxy in front, and guessing it causes the 502s it is meant to prevent.
- ~~**Queue messages are shape-checked, not schema-parsed.**~~ Done: `gen:asyncapi` now emits a Zod
  validator beside each payload interface, and `consumeFromQueue` takes the matching schema. A
  message that fails it dead-letters rather than requeueing, and `.strict()` means a field the
  contract never declared is refused rather than passed through.
- ~~**The PSP is a stub.**~~ Done, as documentation rather than code: the three requirements a real
  provider must meet — verify the signature over the raw body, refuse a repeated event id, never
  trust a browser-reported status — are stated on the provider port, where whoever writes the
  integration passes through before writing the happy path. The "no surface" verdicts elsewhere are
  now explicitly conditional on the stub.

## ~~The other half: the frontend has no page at all~~ — DONE

`boilerplate-vue-frontend` now carries a verbatim copy of the catalog and its own
[Web Attack Defences](https://github.com/Guebbit/boilerplate-vue-frontend/blob/main/docs/theory/web-attack-defences.md)
page, walked the same way: one section at a time, read the catalog row, read the code, write the
verdict. All seven rows this file used to list as "only the frontend can answer" are on it now —
XSS in every form (none found: no `v-html`, no `innerHTML`, no `eval` anywhere in `src/`), CSP
(unset, and why), clickjacking (`X-Frame-Options` from the app's own nginx config), token storage
(in-memory access token, `HttpOnly` refresh cookie), cookie flags as read/set client-side, the
client half of CSRF, and its own dependency tree (two `high` advisories, both build-time-only).

Turned out not to split as cleanly as "backend rows vs. frontend rows": CSRF, clickjacking, cookie
flags, CORS, missing security headers and the contact form's honeypot each need a control on both
sides to close, so this backend's own page now marks those **shared** and names the other repo's
half inline, instead of waving the whole row across the boundary.

The walk also found two real findings on the frontend side, both fixed in the same pass rather
than left open: `identifyUser` no longer forwards the visitor's email to Umami's `identify()` —
only Faro, this deployment's own error/session tool, still gets it — and the `isAuth`/`rememberMe`
cookies it sets client-side now carry `Secure` whenever the page is served over `https:`. See the
frontend page's own
[What is still open](https://github.com/Guebbit/boilerplate-vue-frontend/blob/main/docs/theory/web-attack-defences.md#what-is-still-open)
for what is still genuinely open there (missing SRI on the Umami script, two build-time-only
dependency advisories).

## Sequencing

1. ~~**Finding 1**~~ — done. Advisories closed, threshold recalibrated, gate green.
2. ~~**Findings 2 and 3**~~ — done. Mongo connects as a scoped `readWrite` user, Redis requires
   `--requirepass`; both touched `docker-compose.production.yml` only.
3. ~~**Finding 6**~~ — done. Finding 7's three bullets are also done (see above).
4. ~~**The frontend page**~~ — done, in its own repo, same discipline. See above.
5. **[`EMAIL_VERIFICATION_PLAN.md`](EMAIL_VERIFICATION_PLAN.md)** — its own plan, starting with
   the mount decision it opens on.
6. **[`ANTI_AUTOMATION_PLAN.md`](ANTI_AUTOMATION_PLAN.md)** — its own plan; rung 1 is the part
   worth doing regardless of whether any vendor is ever switched on.
