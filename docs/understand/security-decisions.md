---
type: concept
audience: [developer, architect]
---

# Security: smaller decisions

Why a handful of narrow security choices were made as they were.

| Decision                                                                                                     |
| ------------------------------------------------------------------------------------------------------------ |
| [Why the metrics endpoint has its own credential](#why-the-metrics-endpoint-has-its-own-credential)          |
| [Why search text is escaped before it reaches `$regex`](#why-search-text-is-escaped-before-it-reaches-regex) |
| [Redis and RabbitMQ stay plaintext](#redis-and-rabbitmq-stay-plaintext)                                      |
| [One environment switch](#one-environment-switch)                                                            |
| [`trust proxy`, and the two ways to get it wrong](#trust-proxy-and-the-two-ways-to-get-it-wrong)             |
| [401 or 403, and why the guards agree](#_401-or-403-and-why-the-guards-agree)                                |
| [Why the SSE endpoints authenticate by cookie](#why-the-sse-endpoints-authenticate-by-cookie)                |

## Why the metrics endpoint has its own credential

`/observability/metrics` cannot use the bearer token the other observability routes check
`read:ObservabilitySnapshot` on: it is scraped by Prometheus, which has no way to log in, refresh
a token or hold a session. What Prometheus does
support is a static bearer credential in its `scrape_configs`, so that is the credential here.

Left open, the endpoint is free reconnaissance: request volumes, error rates, latency percentiles,
in-flight counts, login success/failure counters, process uptime and heap. None of it is user data;
all of it is a map of how the service behaves and when it is weakest.

::: warning Deny by default
An unauthenticated metrics endpoint is not a state to arrive at by forgetting a variable, so an
unset `NODE_METRICS_TOKEN` denies rather than opens. The shipped `.env-example` and compose config
both set it, so the stack works out of the box — change it, like any other secret, before it faces
anything.
:::

The comparison is `timingSafeEqual`, not `===`: a byte-by-byte comparison that returns early leaks
the token's prefix to anyone willing to measure, and the whole token to anyone patient.

## Why search text is escaped before it reaches `$regex`

`$regex` with unescaped input is a remote denial of service, not a correctness nit. MongoDB
evaluates the pattern **server-side against every candidate document**, and a catastrophic
backtracking pattern costs seconds of CPU per document from a handful of characters — `(a+)+$`
against a 31-character subject takes ~45s in one engine. `POST /products/search` and
`GET /products?text=` are public, so that is an unauthenticated request pinning a core.

It is also simply what a search box means. Unescaped, `.` matches every character, `^` anchors, and
a lone `(` is a syntax error the driver raises as a 500 — so a user searching for `1.5` or
`50% (off)` gets wrong results or an error rather than the products they wanted.

Literal matching gives up regex search as a feature. Nothing in this API offered it: these helpers
back "type words into a box", and a query language for anonymous callers is not a thing to expose
by accident.

One detail is load-bearing: a term that vanishes under stripping returns **`undefined`**, not an
empty pattern. `$regex: ''` matches every document, so it would silently turn a filter into
"everything" — the exact inversion of what the caller asked for.

## Redis and RabbitMQ stay plaintext

Redis and RabbitMQ are reached over plaintext on the compose network of the single host, and
publish no port outside it. Nothing refuses a plaintext URL: a deployment that crosses a network
sets `rediss://` and `amqps://` itself. Sentry's and GitLab's self-hosted setups make the same
choice for their own bundled stores.

The SMTP leg is the one that does cross a network, so it is the one that insists on TLS: on port 587
the transport refuses to continue without STARTTLS (`requireTLS`). A parked (dead-letter) job is
kept seven days and then dropped by the broker; the TTL is declared in code, so it holds on an
operator's own broker too.

## One environment switch

`NODE_ENV` has two settings that matter: **development or test** (a developer's machine, CI) and
**everything else**. Everything else is strict, an unset value and `staging` included. One helper
says which, `isRelaxedEnvironment()` in `infrastructure/runtime/config.ts`, and every switch
below reads it. The failure it closes: a safety switch that turned on only for the exact word
`production` stayed off for a server that forgot to set it.

| Switch                                | Strict (a deployment)        | Relaxed (development/test)        |
| ------------------------------------- | ---------------------------- | --------------------------------- |
| Session and OAuth cookies             | `Secure`                     | not `Secure`, so local HTTP works |
| `scenario:apply` (the seeder)         | refuses to run               | runs                              |
| Presence rules marked production-only | checked                      | skipped                           |
| Stack traces in logs                  | left out                     | kept                              |
| Log level, console format             | `info`, JSON                 | `debug`, pretty on a terminal     |
| Cache `max-age`, `autoIndex`          | as declared, `autoIndex` off | clamped, Mongoose's default       |

A staging server therefore cannot seed demo data. That is intended: a
switch that must differ gets its own explicit variable, never a relaxed `NODE_ENV`. Standards:
[OWASP secure by default](https://devguide.owasp.org/en/04-design/02-web-app-checklist/01-secure-by-default/),
[Node.js: run with `NODE_ENV=production`](https://nodejs.org/en/learn/getting-started/nodejs-the-difference-between-development-and-production),
[Twelve-Factor config](https://12factor.net/config).

## `trust proxy`, and the two ways to get it wrong

Everything that identifies a caller by address — the rate limiter's bucket key, the audit log's
`ip` — reads `request.ip`. Behind a proxy that is the **proxy's** address unless Express is told
otherwise, and both failure modes are silent:

| Setting                                      | What breaks                                                                                                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unset** (Express's default) behind a proxy | Every request looks like one client. The per-IP limiter becomes a single shared bucket, so one busy caller 429s everyone else, and the audit log records the proxy as every actor. |
| **`true`** (trust everything)                | `X-Forwarded-For` is client-supplied. A caller sets it to a random value per request and never hits the limit at all — strictly worse than unset for anything security-related.    |

The correct value is the **number of proxies you actually run**, so Express counts back from the
right-hand end of `X-Forwarded-For` — the part a client cannot forge. `NODE_TRUST_PROXY_HOPS`
carries it, and `0` (the default) means "no proxy, use the socket address", which is right for local
development and the dev compose stack, where the API is published directly. The production compose stack binds the API to loopback for your TLS proxy, so a production deployment sets it to `1` (`.env-example` leaves it commented; [first deploy](../operate/first-deploy-proxy-and-storage.md) says where).

`0` is handed to Express as `false`, and that is what lets express-rate-limit spot the one mistake
worth a warning: an `X-Forwarded-For` arriving while no proxy is counted. The library checks **once
per limiter**, on the first request that reaches it (the orchestrator probes are skipped before the
check), and logs through the app logger as `rate-limit: express-rate-limit reports a
misconfiguration`.

## 401 or 403, and why the guards agree

The distinction is the client's next move, not a shade of politeness:

- **401** — "authenticate and try again". The frontend redirects to login and returns the visitor
  to where they were aiming.
- **403** — "you are known and still refused". Logging in again would only loop.

Every guard follows it: no credentials at all is 401 even on the most tightly keyed route, and a
verified caller who does not hold the rule is 403. The same rule decides what the auth resolver
does with a token whose user no longer exists — it resolves `undefined` rather than rejecting, so
a deleted account gets the same 401 as a bad token, so the answer never tells a caller whether an
account exists.

Every 401 carries a `WWW-Authenticate` challenge (RFC 9110 §15.5.2): `rejectResponse` adds
`Bearer realm="api"` by default, and a guard that knows more sets its own first
(`error="invalid_token"` for an `sk_` key or a bad bearer, `error="insufficient_user_authentication"` for a
step-up). The app's own clients read `errors[].code` and never the header. A failed human check
is not a 401: it is a 403 `ANTIBOT_VERIFICATION_FAILED`, so no client reads it as a logout. See
[Error Responses](../reference/errors.md#headers-on-an-error).

An [api-key](./security.md#machine-to-machine-credentials) follows the same rule from a third direction: it IS
a credential, so a route it holds no permission for is 403 like any other refusal — including a
`platform.` route, which it is refused outright rather than merely never granted, since a
tenant-scoped credential can never reach one by construction.

## Why the SSE endpoints authenticate by cookie

`EventSource` — the only way a browser consumes SSE — **cannot set request headers**. That is a
limitation of the browser API, not an oversight, so `isAuth`, which reads `Authorization: Bearer`,
can never be satisfied by an SSE connection.

What `EventSource` does send, given `withCredentials: true`, is cookies, and this app already
issues an `HttpOnly` refresh cookie at login. So `requirePermissionViaCookie` takes the same
action and subject every other guard takes and verifies that cookie exactly as `POST /account/refresh`
does — signature **and** presence on the user document — so a revoked or
logged-out token is rejected, not merely an expired one.

A stream of the caller's own data (`GET /notifications/stream`) asks no rule, only a signed-in
account, so it mounts `requireSessionViaCookie`: the same cookie check, no rule. Its 30-second
re-check, `stillSignedInViaCookie`, ends the stream on revocation or a ban just as the rule version
does.

::: danger Not a query-string token
The obvious alternative is `?token=…`. URLs land in access logs, proxy logs, browser history and
`Referer` headers, and a refresh token in any of those is a full account takeover.
:::

## Read next

- [security](./security.md): the hub this page belongs to.
