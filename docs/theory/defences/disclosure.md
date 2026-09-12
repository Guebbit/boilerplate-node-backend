# Information disclosure

The site tells you too much. Individually these are the "low severity" findings nobody prioritises;
collectively they are the recon stage, and recon is what turns three unrelated weaknesses into a
chain. A stack trace names the ORM, the ORM version names the CVE, the CVE names the payload.

**Fixing the boring rows is what turns a chain into a dead end.**

## The server talking about itself

| Attack                       | How it works                                                          | This boilerplate                                                                                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verbose error messages       | debug mode in production; unhandled exceptions rendered to the caller | An error response carries `errors` — user-facing messages, typically already translated — and nothing else. The stack goes to the log and the OTel span, never to the body — `infrastructure/http/errors.ts`, `app/error-handling.ts`             |
| Error-based schema leakage   | validation errors echoing field names and types                       | A Mongo/Mongoose driver failure passes through ONE interpreter that maps it to a status and a fixed message, so all twelve models answer a duplicate key or a bad ObjectId identically — `infrastructure/http/errors.ts#databaseErrorInterpreter` |
| Version banners              | `Server`, `X-Powered-By`, framework error pages                       | `helmet()` removes `X-Powered-By` — `app/security.ts`                                                                                                                                                                                             |
| Debug / diagnostic endpoints | profilers, debug consoles, `/actuator`, `/__debug__`                  | Routes are mounted from each module's own manifest, so there is no undeclared route to find — `app/routes.ts`, `kernel/registry.ts`. The one test-only surface (`/__test/restore`) is mounted only outside production.                            |
| Source code disclosure       | an exposed `.git`, or handlers serving `.ts` as text                  | `dotfiles: 'ignore'` on the static mount, and `.dockerignore` keeps `.git` out of the image — `app/static-assets.ts`, `.dockerignore`                                                                                                             |
| Source maps in production    | `.map` files deployed alongside the bundle                            | The frontend's row. This process ships TypeScript run through `tsx`, and `src/` is not served.                                                                                                                                                    |
| HTML comments and dead code  | TODOs with hostnames, commented-out admin links                       | No HTML is generated except email and invoice templates, which render fixed markup — `shared/templates/`                                                                                                                                          |

## The response saying more than the UI shows

| Attack                             | How it works                                               | This boilerplate                                                                                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Excessive data exposure            | the whole document serialised; hidden fields still present | Each module serialises through its own shape rather than returning the document, and a caller's own resource is fetched already scoped to their id — `orders/repository.ts#findByIdScoped`                       |
| Enumeration via responses          | status codes, messages or timing reveal existence          | Login, signup and reset answer the same shape whether or not the account exists — see [Knowing an account exists](authentication.md#knowing-an-account-exists).                                                  |
| Side-channel timing                | a database hit costs measurably more than a miss           | Same answer for the credential paths, which are the ones where existence is worth hiding.                                                                                                                        |
| API documentation exposure         | Swagger with internal endpoints; GraphQL introspection on  | The contract IS the public API — there are no internal endpoints omitted from it, which is what makes publishing it safe rather than a leak.                                                                     |
| Sequential / guessable identifiers | auto-increment ids reveal counts and let you walk them     | Ids are identifiers, never secrets: every read that takes one is scoped, so knowing an id grants nothing — `kernel/access/query.ts`. ObjectIds do embed a timestamp; that is a metadata leak, not an access one. |
| Cached sensitive responses         | private data stored by a shared cache                      | The response cache is keyed by caller and locale — see [HTTP and caches](http-and-caches.md#caches).                                                                                                             |
| Autocomplete on sensitive fields   | the browser stores an OTP or card value                    | The frontend's row.                                                                                                                                                                                              |

## Identifiers and URLs

| Attack                 | How it works                                                    | This boilerplate                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sensitive data in URLs | tokens or emails in query strings reach logs, referrer, history | Reset, verification and delete-confirmation tokens travel in the URL path by necessity — they are single-use and time-boxed, which is what bounds the exposure. No credential is ever a query parameter. |
| Referrer leakage       | no `Referrer-Policy`; outbound links from private pages         | `helmet()` sets `Referrer-Policy: no-referrer` — `app/security.ts`. The frontend's static server sets the equivalent for the pages this app never touches.                                               |

## Logs and telemetry

A log line is a copy of your data with none of your access controls on it.

| Attack                             | How it works                                                        | This boilerplate                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sensitive data in logs             | request bodies, tokens, card numbers written verbatim               | Two separate policies, kept separate on purpose. `SENSITIVE_FIELDS` (passwords, tokens, cookies, `authorization`, card fields) are REPLACED — a credential must never be hashed-and-kept. `PERSONAL_FIELDS` (email, ip, phone, address) are HASHED by default, so a trace stays followable without the line being readable — `infrastructure/adapters/logger.ts` |
| Third-party analytics leakage      | user ids and emails in event payloads                               | The analytics collector is self-hostable and its host is configured, not hard-coded to a vendor — `infrastructure/observability/analytics/umami.ts`. Event payloads are asserted by `tests/cross-cutting/analytics-events.test.ts`.                                                                                                                              |
| Log exposure                       | a log viewer without auth; logs in a public bucket                  | Logs go to stdout; where they are shipped is the deployment's. The SSE stream that exposes process metrics requires `platform.observability.read` — see [Real-time](real-time.md).                                                                                                                                                                               |
| Metrics / health endpoints exposed | `/metrics` or `/health` with dependency detail on the public origin | `/metrics` is behind `NODE_METRICS_TOKEN`, compared with `timingSafeEqual` and DENIED by default when unset — `rate-limit.ts#isMetricsScraper`. The detailed overview sits behind a permission key; the bare liveness probe is deliberately public and says nothing but "up".                                                                                    |
| Memory disclosure                  | Heartbleed-style over-reads in native code                          | See [Runtime](runtime.md#native-code).                                                                                                                                                                                                                                                                                                                           |

## Outside the application

Listed because they are real rows, and because this repo cannot close them — naming the owner is
the honest verdict.

| Attack                        | How it works                                    | Owner                                                                                  |
| ----------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Directory listing             | autoindex on a static directory                 | Closed here — `index: false`, see [Files](files-and-uploads.md#what-gets-served-back). |
| Metadata files                | `robots.txt` listing admin paths, `sitemap.xml` | The frontend's static server.                                                          |
| Subdomain / asset enumeration | certificate transparency logs, DNS brute force  | DNS and the domain owner.                                                              |
| DNS zone transfer             | AXFR allowed to anyone                          | The DNS provider.                                                                      |

## Related

- [Authentication](authentication.md) — enumeration through the credential endpoints
- [Authorization](authorization.md) — the scoping that makes an id safe to reveal
- [Runtime](runtime.md) — crashes, and what they print on the way out
- [Data protection](../data-protection.md) — the same fields under a privacy lens
