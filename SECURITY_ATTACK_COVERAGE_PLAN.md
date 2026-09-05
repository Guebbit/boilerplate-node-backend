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

### 1. The audit alarm is inverted — it is red for what cannot be fixed and silent about what can

**The CI wiring is not the problem.** `.github/workflows/ci.yml`'s `audit` job runs
`npm audit --omit=dev --audit-level=high` on every push and PR, and is deliberately excluded from
the `ci` gate's `needs:` — an alert, not a blocker, for exactly the reason its own comment gives:
a transitive high with no non-breaking fix would otherwise block every merge indefinitely. That
was the right call and it should stay.

The problem is what the threshold lets through. Severities in the current production tree:

| Severity | Package                | Advisory                                                   | Reachable here                                     | Fix          |
| -------- | ---------------------- | ---------------------------------------------------------- | -------------------------------------------------- | ------------ |
| high     | `puppeteer-core` chain | `extract-zip` unvalidated symlink path traversal           | **no** — the browser-DOWNLOAD path, unused         | major bump   |
| moderate | `mongoose`             | prototype pollution via `__proto__`-prefixed dotted path   | **yes** — every write goes through it              | non-breaking |
| moderate | `qs`                   | array-limit bypass; DoS via attacker-controlled `isBuffer` | **yes** — `express.urlencoded({ extended: true })` | non-breaking |
| low      | `body-parser`          | an invalid `limit` silently disables size enforcement      | operator-triggered via `NODE_JSON_BODY_LIMIT`      | non-breaking |
| low      | `esbuild`              | file read via its dev server on Windows                    | **no** — `tsx` uses it as a transpiler only        | non-breaking |

`--audit-level=high` fails the job on the ONE row nobody can act on and says nothing about the
three that are both reachable and trivially fixable. The job has therefore been red for a while,
and a permanently-red non-blocking job is a job nobody reads — which is how three reachable
advisories stayed invisible in a repo that audits on every push.

**Do, in this order:**

1. `npm audit fix` — clears `mongoose`, `qs`, `body-parser`, `esbuild`, non-breaking.
2. Decide on `puppeteer-core@25`. The PDF adapter is the only consumer and its surface is two
   functions, so the major is cheap. Taking it makes the job green, which is worth more than the
   "not reachable" argument — that argument has to be re-proved after every puppeteer change.
3. Once the noise is gone, **lower the threshold to `--audit-level=moderate`**. The reachable
   findings in this tree were all moderate or low; a high-only alarm would not have caught any of
   them. Keep the job out of `needs:` either way.

### 2. Mongo runs as root — bad, but bounded, and worth fixing while nothing is on fire

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

**Do:** a Mongo init script that creates a scoped `readWrite` user on the app's database, and a
compose change to connect as it. Keep the root account for maintenance only.

### 3. Redis has no password — and it holds more than a cache

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

**Do:** add `--requirepass` and carry it in `NODE_REDIS_URL` / `NODE_RATE_LIMIT_REDIS_URL`.

### 4. Email verification is enforced nowhere — moved out

Split into its own plan: [`EMAIL_VERIFICATION_PLAN.md`](EMAIL_VERIFICATION_PLAN.md). It turned out
to be two problems sharing one mechanism — nothing reads `verified`, AND an email change binds the
new address before it is proven while never telling the old one — plus a product decision about
where the guard mounts. Too much to carry as a bullet here.

### 5. Anti-automation is rate limits and one honeypot — scoping, not implementation

No CAPTCHA, proof-of-work or device signal anywhere, and the rate limits are per address, which a
distributed client does not have one of. This is a real gap and also a genuine boilerplate
question: a CAPTCHA is a third-party dependency and a privacy decision, not a line of code. Worth
naming a recommended integration point rather than shipping one.

### 6. `additionalProperties: false` is decorative at runtime — an hour

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

**Do:** pick one and make the two agree — either configure orval to emit `.strict()`, or drop
`additionalProperties: false` from the fragments so the contract stops promising it. Making them
strict is the better half of the trade: it is the behaviour the contract already describes, and
`parseBody` already answers 422 for a Zod failure, so no controller changes.

### 7. Smaller, and honest about being smaller

- **Slow HTTP.** Node's `headersTimeout`/`requestTimeout` defaults are unchanged and unaudited.
  Nothing in-process bounds a slow-read client.
- **Queue messages are shape-checked, not schema-parsed.** Acceptable while this application is
  the only producer; stops being acceptable the day it is not.
- **The PSP is a stub.** The whole webhook half of §20 reads "no surface" because
  `payments/providers/fake.ts` never talks to anything. A real integration brings callback
  forgery, callback replay and 3-D Secure back in one commit, and none of those controls exist.

## The other half: the frontend has no page at all

`boilerplate-vue-frontend` (at `../boilerplate-vue-frontend`) has neither a catalog copy nor a
defences page. The catalog is project-agnostic and belongs in both repos verbatim; the defences
page has to be written from scratch, because the rows only a browser can answer are exactly the
ones this backend's page marks out of reach:

| §   | Rows only the frontend can answer                                                   |
| --- | ----------------------------------------------------------------------------------- |
| 2   | XSS in all five forms, `v-html` usage, DOM clobbering, `postMessage`, tabnabbing    |
| 2   | CSP: whether one exists, and whether it is escapable                                |
| 2   | Clickjacking — `frame-ancestors` as the app declares it, not just as helmet sets it |
| 2   | Where the access token lives, and why that choice                                   |
| 2   | Cookie flags as READ client-side, not just as this backend sets them                |
| 2   | CSRF token handling on the client half of the double-submit                         |
| 14  | The frontend's own dependency tree, and any third-party script in the bundle        |

Same discipline as this pass: one section at a time, read the catalog row, read the code, write
the verdict. Both pages keep linking back to the shared catalog.

## Sequencing

1. **Finding 1** — `npm audit fix` first, then the puppeteer decision, then lower the threshold.
   No design work, and it turns the alarm back into something worth reading.
2. **Findings 2 and 3** — mechanical, touch compose and `.env-example` only, and both are cheaper
   now than after anything else changes around them.
3. **Finding 6**, and finding 7's first bullet — an hour each.
4. **[`EMAIL_VERIFICATION_PLAN.md`](EMAIL_VERIFICATION_PLAN.md)** — its own plan, starting with
   the mount decision it opens on.
5. **The frontend page** — its own session, its own repo, same discipline.
6. **Finding 5 and finding 7's remaining bullets** — recorded, deliberately not scheduled.
