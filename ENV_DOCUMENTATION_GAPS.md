# `.env-example` → documentation: what is still missing

Status: **findings only, nothing scheduled.** Produced while reformatting `.env-example`; parked
here so the reformat could ship without waiting on the writing.

Measured by taking every variable in `.env-example` and checking whether it — or, where the name
is absent, the _concept behind it_ — appears anywhere under `docs/`.

```
130 variables
  ├─  102  documented
  ├─    5  decided: no documentation needed (OAuth, see below)
  ├─    5  concept documented, variable name never written  (cosmetic)
  └─   18  genuinely missing
```

---

## Decided — not gaps

The five social-login variables — `NODE_OAUTH_GOOGLE_CLIENT_ID` / `_SECRET`,
`NODE_OAUTH_GITHUB_CLIENT_ID` / `_SECRET`, `NODE_FRONTEND_URL`. The names are self-explanatory and
the section note in `.env-example` carries the rest (which provider registration page to use, the
callback URL shape, and that `NODE_FRONTEND_URL` is not `NODE_CORS_ORIGIN`). There is no OAuth
page in `docs/` and, by decision, there does not need to be one.

## Covered in prose, name never written

Not worth writing a paragraph for; worth knowing the search is a false negative.

| variable                                                       | where the concept lives                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `NODE_DEFAULT_LOCALE`, `NODE_FALLBACK_LOCALE`                  | `docs/tools/i18n.md` — the boot locale and the fallback chain, at length       |
| `NODE_AUTH_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX` | `docs/tools/security.md` — both buckets and why `skipSuccessfulRequests` is on |
| `MONGOMS_SYSTEM_BINARY`                                        | `docs/tools/unit-testing.md` — the `mongodb-memory-server` lifecycle           |

---

## The 18, by consequence

### 1. Limiter counting — 3 variables, the only live failure mode

`NODE_RATE_LIMIT_REDIS_ENABLED` · `NODE_RATE_LIMIT_REDIS_URL` · `NODE_REDIS_RATE_LIMIT_PREFIX`

`docs/tools/security.md` does not mention Redis once. It documents every budget and omits the
thing that decides whether those numbers mean anything: with no Redis the counters are **per
process**, so under a worker per CPU every budget is silently multiplied by the worker count. The
app logs an error at boot, which nobody reads.

**Where it goes:** `docs/tools/security.md`, a subsection under _The rate-limit budgets_.
**Should also cover:** the three-tier resolution — `NODE_RATE_LIMIT_REDIS_URL` → `NODE_REDIS_URL`
→ `NODE_REDIS_HOST` + `NODE_REDIS_PORT` (`rate-limit-store.ts:38-44`), and that
`NODE_RATE_LIMIT_REDIS_ENABLED=0` is what the test suites set.

### 2. Locale tenants — 4 variables, an entire subsystem

`NODE_LOCALE_TENANT_BACKEND` · `NODE_LOCALE_TENANT_FRONTEND` · `NODE_LOCALE_TENANTS_EXTRA` ·
`NODE_LOCALE_OVERRIDE_REFRESH_MS`

The word **"tenant" appears zero times** in `docs/tools/i18n.md`. Not thin — absent. There is an
admin-editable translation-override system with its own `GET /locales/tenants` endpoint, a
backend/frontend split, and a refresh interval, and nothing written says what a tenant is.

**Where it goes:** `docs/tools/i18n.md`, a new section.
**Should cover:** what a tenant is (one audience's overrides, layered over the deployed files);
why the backend's own are never served to clients; which one
`GET /locales/{locale}/messages` builds when the client names none; the `id=Label` format of
`_TENANTS_EXTRA`; and why the refresh interval exists at all — the worker that served an edit
applies it at once, the others do not, and this bounds the disagreement.

### 3. Email — 3 variables missing from a table that already exists

`NODE_SMTP_SENDER` · `NODE_CONTACT_NOTIFY_EMAIL` · `NODE_EMAIL_TEMPLATES_DIR`

`docs/tools/email-and-rendering.md` has an SMTP table covering HOST / PORT / USER / PASS / NAME
and stops. The cheapest of these fixes — three rows.

`NODE_SMTP_SENDER` earns more than a row: it is the `From` header **and**, via its display half,
the issuer name shown in every user's authenticator app (`two-factor/totp.ts#totpIssuer`).
Changing it renames the entry in everyone's authenticator.

### 4. Umami container credentials — 4 variables

`UMAMI_APP_SECRET` · `UMAMI_DB_NAME` · `UMAMI_DB_USER` · `UMAMI_DB_PASSWORD`

`docs/tools/frontend-observability.md` explains the fixed-website-id trick well, and never the
container's own Postgres credentials or what `UMAMI_APP_SECRET` hashes.

### 5. Health-report URLs — 2 variables

`NODE_LOKI_HOST` · `NODE_FARO_COLLECTOR_URL`

Nothing anywhere records that these are **declarative only**: nothing dials them, they exist so
`GET /observability/health` can report `integrations.loki` / `.faro` as present. Easy to read as
configuration and set carefully for no effect. `NODE_UMAMI_HOST` is the third of this shape and
_is_ documented, which makes the omission of the other two look deliberate.

**Where it goes:** `docs/tools/observability-reference.md`, next to `NODE_UMAMI_HOST`'s own
paragraph in `docs/tools/analytics.md` — same "declarative only" shape, cross-link the two.

### 6. `NODE_JSON_BODY_LIMIT` — 1 variable

"body limit", "JSON_BODY", "100kb": **zero hits across all of `docs/`**. A request-size ceiling
(`app/security.ts:25`) that no page mentions.

### 7. `NODE_URL` — 1 variable

One incidental mention, in `docs/tools/opentelemetry.md`. Its actual job — the base for every
outgoing link, so password-reset emails, account-deletion confirmations and OAuth callbacks point
at the right host — is unwritten. A wrong value means every emailed link is broken, which is a bad
thing to learn from a support ticket.

---

## Suggested order

1. **§1 limiter counting** — the only one with a silent production failure behind it.
2. **§2 locale tenants** — the only whole subsystem with nothing written.
3. **§3 email** — three table rows, ten minutes.
4. §5, §6, §7 — a paragraph each.
5. §4 — lowest value; the variables are compose-only and their names nearly carry it.

## How to re-measure

```bash
python3 - <<'PY'
import re, pathlib
vars_ = [m.group(1) for l in open('.env-example')
         if (m := re.match(r'^#?([A-Z][A-Z0-9_]*)=', l))]
docs = [p for p in pathlib.Path('docs').rglob('*.md') if '.vitepress' not in str(p)]
blob = '\n'.join(p.read_text() for p in docs)
missing = [v for v in vars_ if v not in blob]
print(f"{len(vars_) - len(missing)}/{len(vars_)} documented")
print('\n'.join('  ' + v for v in missing))
PY
```

Remember it is a literal name match: a hit is not proof of an explanation, and a miss is not proof
of absence — the five in _Covered in prose_ above are all false positives of this script.
