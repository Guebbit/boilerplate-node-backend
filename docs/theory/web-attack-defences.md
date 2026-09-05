# Web Attack Defences

The [Web Attack Catalog](./web-attack-catalog.md) is deliberately theory-only — every flaw a
website can have, with no word about this codebase. This page is the other half: which catalog row
each control stops, and where that control lives. A "clean" verdict is only useful to the next
reader if it says against what, so the perimeter this repo reviewed and left alone is mapped here
too, not just the rows a change actually touched.

Scoped to this backend, and now walked across the whole catalog rather than the authentication
half of it. Personal-data handling (retention, consent, redaction, the export/erasure endpoints)
is a different lens on an overlapping set of files; see [Data Protection](./data-protection.md)
for that side of it. The paired Vue frontend owns the browser-side rows (§2 in full, the client
half of §9 and §14) and has no page of its own yet — that gap is named in
[What is still open](#what-is-still-open).

## How far each catalog section is walked

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 45}}}%%
flowchart TB
    subgraph W["Walked row by row, verdict recorded"]
        direction LR
        W1["§1 Injection<br/>§3 Authentication<br/>§4 Authorization"]
        W2["§5 Business logic<br/>§6 Files and paths<br/>§7 SSRF"]
        W3["§8 HTTP and intermediaries<br/>§10 Disclosure<br/>§11 DoS"]
        W4["§12 Data layer<br/>§13 Infrastructure<br/>§14 Supply chain"]
        W5["§15 API<br/>§16 Real-time<br/>§17 Email"]
        W6["§19 Runtime<br/>§20 Payments<br/>§21 Automation"]
    end
    subgraph N["Out of this repo's reach"]
        direction LR
        N1["§2 Client-side<br/><i>browser code — frontend repo</i>"]
        N2["§9 Crypto and transport<br/><i>partly: TLS terminates upstream</i>"]
        N3["§18 Human and social<br/><i>process, not code</i>"]
    end
    W --> N

    classDef done fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef out fill:#fef3c7,stroke:#d97706,color:#111827;
    class W1,W2,W3,W4,W5,W6 done;
    class N1,N2,N3 out;
```

"Walked" means every row in the section was read against the code and given a verdict — a control
with a location, an explicit "not mitigated, and why", or "this repo has no such surface".
Silence is not one of the three.

## Revocation and session lifetime

| Catalog row (§3 unless noted)                              | Control                                                                                                                                                        | Where                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Missing invalidation                                       | password change, deactivation and soft-delete each revoke every refresh token                                                                                  | `account/services/authentication.ts`, `users/service.ts#update`            |
| JWT — no revocation                                        | refresh tokens are checked against the live, stored set on every use, not just signature-verified                                                              | `account/session/jwt.ts#verifyRefreshToken`, `users/repository.ts`         |
| Insufficient session expiry (deactivated/deleted accounts) | a deactivated or soft-deleted account stops authenticating on its very next request, not merely at its next login                                              | `users/repository.ts#findAuthenticatableById`, `account/module.ts#resolve` |
| Refresh-token misuse — reuse after rotation                | a refresh token replayed after it was rotated away revokes the account's entire refresh set                                                                    | `account/session/jwt.ts#rotateRefreshToken`, `TokenReuseError`             |
| Session hijacking / sidejacking                            | rotating the refresh token's value on every exchange makes a stolen cookie detectable on its next presentation, not silently reusable for the rest of its life | `account/session/jwt.ts#rotateRefreshToken`                                |
| Predictable session tokens                                 | a random `jti` per mint, so two logins in the same second cannot collide into one revocable session                                                            | `account/session/jwt.ts#createRefreshToken`                                |
| Secrets at rest in plaintext (§9)                          | refresh, reset and delete-confirmation tokens are stored as sha256 digests, never the live value                                                               | `users/model.ts#hashToken`                                                 |

## A boot that refuses

| Catalog row (§13)               | Control                                                                                                                                                                                                                                                                                                                       | Where                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Security misconfiguration       | the app refuses to start if `NODE_TOKEN_ACCESS`/`NODE_TOKEN_REFRESH`/`NODE_TOTP_ENCRYPTION_KEY`/`NODE_METRICS_TOKEN` are unset, too short, or still the shipped placeholder; also on a missing `NODE_URL`, a production `NODE_CORS_ORIGIN` left to its localhost default, and an SMTP host configured without its credentials | `kernel/required-config.ts`, each module's `requiredConfig` |
| Insecure defaults of frameworks | a misconfigured `NODE_TRUST_PROXY_HOPS` warns loudly rather than silently trusting a spoofable `X-Forwarded-For`                                                                                                                                                                                                              | `app/security.ts`                                           |
| Secrets in environment          | the demo dataset/seed interlock refuses to run against a build that isn't explicitly `NODE_DEMO` and non-production                                                                                                                                                                                                           | `app/demo.ts`                                               |

## Hardening — the small ones

| Catalog row                                      | Control                                                                                                                               | Where                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Unbounded queries (§11)                          | `page`, not only `pageSize`, is capped                                                                                                | `infrastructure/http/schemas.ts`, `shared/contracts/openapi.root.yaml` |
| Timing attack on comparison / User enumeration   | a login miss compares against a dummy bcrypt hash, so an unknown email costs the same as a wrong password                             | `account/services/authentication.ts#DUMMY_PASSWORD_HASH`               |
| JWT — `alg: none` / key confusion                | `{ algorithms: ['HS256'] }` pinned on every verify                                                                                    | `account/session/jwt.ts`                                               |
| Log injection / log forging (§1), CRLF injection | `x-request-id` is validated against a UUID shape before it's ever reflected back or written to a log line                             | `app/request-context.ts`                                               |
| Large request bodies (§11)                       | an explicit `limit` on `express.json()`/`express.urlencoded()`, rather than trusting the library default                              | `app/security.ts`                                                      |
| Vulnerable dependencies (§14)                    | `npm audit fix` was run for the production-facing advisories — and has since drifted; see [Supply chain](#supply-chain--14-re-walked) | `package.json`                                                         |

## Step-up authentication

| Catalog row (§3)                     | Control                                                                                                                                                                                         | Where                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Email-change without re-verification | the whole reason this wave exists: changing the email, deleting the account, session management, checkout and payment confirmation all demand proof of a RECENT session, not merely a valid one | `kernel/middlewares/authorizations.ts#requireFreshAuth`, mounted per-route in `account/routes.ts`, `cart/routes.ts`, `payments/routes.ts` |
| JWT — no revocation (freshness half) | `auth_time`/`amr` are carried claims, never derived from the clock — a token minted before step-up existed reads as infinitely old and is asked to re-prove itself                              | `account/session/jwt.ts`'s `TokenData` doc                                                                                                |
| Remember-me token flaws              | the "remember me" tiers set the refresh cookie's own lifetime, but do not exempt a sensitive action from the freshness check above — a long-lived session still has to step up                  | `account/session/config.ts#RefreshTokenExpiryTime`                                                                                        |

## Two-factor authentication

| Catalog row (§3)                                                | Control                                                                                                                                                                                                                                                                                   | Where                                                                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OTP / 2FA bypass — attempt cap                                  | a dedicated rate limiter bounds guesses against ONE still-live login challenge, independent of the account/address budgets                                                                                                                                                                | `infrastructure/http/middlewares/rate-limit.ts#mfaChallengeLimiter`                                                                                    |
| OTP / 2FA bypass — response tampering                           | the challenge is server-verified end to end; there is no client-visible intermediate `{ok:false}` a caller could rewrite                                                                                                                                                                  | `account/services/two-factor.ts#verifyLoginChallenge`                                                                                                  |
| OTP / 2FA bypass — replay                                       | the RFC 6238 time step of the last accepted code is tracked per account; the identical code cannot verify twice                                                                                                                                                                           | `account/two-factor/totp.ts#verifyTotpCode`; a delivered code is deleted the moment it is spent                                                        |
| JWT — no revocation / token confusion                           | the login challenge is not a JWT at all — it's a single-use, revocable, hashed-at-rest token, the same mechanism `password-reset` uses, so it fails ordinary token verification outright rather than needing a dedicated rejection, and a right code spends it before a session is minted | `users/model.ts#tokenAdd`, `account/services/tokens.ts#findLiveToken`/`spendLiveToken`, proven by `tests/integration/two-factor.test.ts`'s bypass test |
| Secrets at rest in plaintext (§9)                               | a device secret is AES-256-GCM encrypted with a versioned key, never plaintext; a delivered code is an HMAC under the same key, since six digits fall to a bare digest; backup codes are hashed the way refresh tokens are                                                                | `account/two-factor/`                                                                                                                                  |
| Brute force / Credential stuffing / Password spraying (partial) | a second factor is a real second control past the password, on top of the rate limiting that already bounded these rows                                                                                                                                                                   | `account/two-factor/`, `account/routes.ts`                                                                                                             |

### What two-factor auth adds, honestly

A defence that lists only what it stops and never what it newly exposes is marketing. Two things
worth naming:

- **§3 OTP / 2FA bypass is now a real row against this codebase**, in the way any TOTP
  implementation is — the attempt cap and replay tracking above are what keep it closed rather
  than what makes it not apply.
- **§3 SIM swap and §18 MFA fatigue / push bombing are rows this repo deliberately stays out of
  reach of, by not building the factor they attack.** No SMS or email code — both mostly
  re-verify a channel an attacker may already hold, email especially, since the mailbox is
  already the password-reset path — and no push approval, which brings MFA fatigue with it by
  construction. §3 WebAuthn / passkeys is the acknowledged next step, and the reason `amr` is
  carried as an array rather than a boolean: a future `amr: ['hwk']` is a new value, not a new
  guard.

## The perimeter the auth waves reviewed clean

Not touched by the authentication plan, and reviewed while working through it — mapped here
because "clean" is only a useful verdict against a named row.

| Catalog row                                         | Control                                                                                                                                                                     | Where                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Missing security headers (§13)                      | `helmet()`, applied globally                                                                                                                                                | `app/security.ts`                                                     |
| Permissive CORS (§13/§2)                            | an explicit origin allowlist, not `*`                                                                                                                                       | `app/security.ts`                                                     |
| No WAF / rate limiting at the edge (§13)            | a global per-address burst brake, plus the credential-specific budgets identity/address pair below it                                                                       | `infrastructure/http/middlewares/rate-limit.ts`                       |
| Insufficient logging and monitoring (§13)           | every 429 logs at `warn`, audited or not — the limiters mount before the request logger, so a refusal short-circuits ahead of the only thing that would otherwise record it | `infrastructure/http/middlewares/rate-limit.ts#refuse`                |
| Brute force / Credential stuffing (§3)              | `credentialLimiters` — two independent budgets, per account and per address, spent only by failures                                                                         | `infrastructure/http/middlewares/rate-limit.ts#credentialLimiters`    |
| Large request bodies via uploads (§11)              | a dedicated, tighter budget for routes that accept an image, separate from the general burst brake                                                                          | `infrastructure/http/middlewares/rate-limit.ts#uploadLimiter`         |
| NoSQL injection (§1)                                | search input reaching a `$regex` filter is escaped before it gets there                                                                                                     | `infrastructure/persistence/search.ts#escapeRegex`                    |
| Excessive data exposure / IDOR (§10 / §4)           | a caller's own resource is looked up scoped to their id, not fetched by id and checked after                                                                                | `orders/repository.ts#findByIdScoped` and the equivalent per module   |
| Sensitive data in logs / Credential leakage (§10)   | password hashes, live tokens and (configurably) personal fields are redacted or hashed before a log line is written                                                         | `infrastructure/adapters/logger.ts#SENSITIVE_FIELDS`                  |
| CSRF on the OAuth callback (§3)                     | a double-submit `state` cookie, minted and set in the same response that hands it to the provider; the callback rejects a mismatch with 400                                 | `account/oauth/state.ts`, `account/controllers/get-oauth-callback.ts` |
| Open redirect / callback confusion (§3/§7)          | the redirect URI and the post-login frontend URL are both derived from server config (`NODE_URL`, `NODE_FRONTEND_URL`), never from the request or the provider's response   | `account/oauth/config.ts#oauthRedirectUri`                            |
| Pre-emptive account takeover via OAuth linking (§3) | a provider identity is linked to an existing email only once that provider reports the address as verified; an unverified match is rejected rather than linked              | `account/services/oauth.ts#loginOrCreateFromOAuth`                    |

## Input at the boundary — §1 beyond NoSQL

Every write endpoint parses its body against the Zod schema orval generates from `openapi.yaml`,
in `parseBody`. Zod's object parse STRIPS unknown keys rather than rejecting them, which is what
makes the generated schemas a mass-assignment defence and not merely a validator.

| Catalog row (§1)                          | Control                                                                                                                                                                                               | Where                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| NoSQL injection                           | a body value that is an operator object fails its `z.string()` before it can reach a filter — `POST /account/login` reads `email` raw, and the SERVICE parses it against `LoginBody` before the query | `infrastructure/http/controller.ts#parseBody`, `account/services/authentication.ts#login` |
| Aggregation / pipeline injection          | no pipeline stage, field name or `$expr` operand is ever built from request input; the three `$expr` uses compare two stored fields                                                                   | `products/repository.ts`, `users/repository.ts`                                           |
| ORM / query-builder injection             | no client-controlled sort: `findAll` takes `sort` from the repository's own `DEFAULT_SORT`, and no contract operation declares a sort parameter                                                       | `infrastructure/persistence/create-repository.ts`                                         |
| Regex injection / ReDoS                   | `new RegExp` appears nowhere; the only `$regex` patterns come from `toSearchPattern`, which strips C0/DEL and escapes every metacharacter                                                             | `infrastructure/persistence/search.ts#toSearchPattern`                                    |
| Mass assignment / autobinding             | the admin write path spreads `request.body`, but `users/service.ts#update` assigns field by field — an unknown key has no assignment to reach                                                         | `users/service.ts#update`                                                                 |
| Mass assignment — privilege fields        | self-service `PUT /account` destructures six named fields; `admin` is not one of them, so a user cannot promote themselves through their own profile                                                  | `account/controllers/put-account.ts`                                                      |
| OS command injection / argument injection | no `child_process`, `exec` or `spawn` anywhere in `src/`                                                                                                                                              | —                                                                                         |
| Code injection / `eval`                   | no `eval`, `new Function` or `vm` anywhere in `src/`                                                                                                                                                  | —                                                                                         |
| SSTI / expression-language injection      | EJS templates interpolate with `<%= %>`, which HTML-escapes; `<%- %>` appears only on `include(…)` of a fixed layout path                                                                             | `shared/views/`                                                                           |
| XXE / XML injection                       | nothing parses XML; every body is JSON, urlencoded or multipart                                                                                                                                       | —                                                                                         |
| Insecure deserialization                  | `JSON.parse` only, and the two places it runs on untrusted bytes degrade to a miss / a dead-letter rather than throwing                                                                               | `infrastructure/http/middlewares/cache.ts`, `infrastructure/adapters/queue.ts`            |
| Log injection / CRLF injection            | see the `x-request-id` row above; no other request-controlled value is written to a log line unstructured                                                                                             | `app/request-context.ts`                                                                  |
| Host header injection                     | `request.hostname`, `Host` and `X-Forwarded-Host` are read nowhere; every generated link is built from `NODE_URL` / `NODE_FRONTEND_URL`                                                               | `account/emails.ts`, `account/oauth/config.ts`                                            |
| Path / URL parameter injection            | see §6 below — a stored filename is 16 random bytes plus an extension from a closed set, never any part of what the client sent                                                                       | `infrastructure/adapters/storage.ts#resolveUploadFilename`                                |
| CSV / formula injection                   | nothing exports a spreadsheet; the account export answers JSON                                                                                                                                        | `account/services/export.ts`                                                              |

## Money, stock and the order lifecycle — §5 and §20

The three modules the plan named. What makes this section short is that the arithmetic and the
transitions each live in one place: `orders/domain` owns both, and `cart`, `payments` and
`inventory` read them rather than restating them.

| Catalog row                                | Control                                                                                                                                                                                                                                                                       | Where                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Price manipulation (§5/§20)                | no request ever carries a price. A line's amount is the joined product's `price`; the payment intent freezes `orderTotal(order)`, the same function the order serializer and the confirmation email call                                                                      | `orders/domain/totals.ts#orderTotal`, `payments/service.ts#createIntent`        |
| Trusting user-supplied identifiers (§5)    | the buyer is `authContext.id`; the shipping address is resolved through `addressForCheckout(userId, addressId)`, so naming someone else's entry refuses the checkout before anything is written                                                                               | `cart/services/checkout.ts`, `account/services/addresses.ts`                    |
| Negative or zero quantities (§5)           | `quantity` is `integer, minimum: 1` in the contract, so the generated schema rejects `0` and `-1` at the controller                                                                                                                                                           | `cart/openapi.yaml`, `api/schemas.zod.ts`                                       |
| Integer overflow / precision loss (§5/§20) | money is a branded integer count of minor units; `addMoney`/`scaleMoney` normalise a non-finite result to zero, and the single conversion back to decimals happens on the way out                                                                                             | `orders/domain/money.ts`                                                        |
| Rounding and precision (§20)               | there is no per-line rounding to harvest: `toMinorUnits` rounds once per unit price, and everything after it is integer addition                                                                                                                                              | `orders/domain/money.ts#toMinorUnits`                                           |
| Currency confusion (§5/§20)                | the currency is `NODE_DEFAULT_CURRENCY`, read server-side and frozen onto the payment document; no endpoint accepts one                                                                                                                                                       | `payments/config.ts`, `payments/model.ts`                                       |
| Unit / measurement confusion (§5)          | shipping is priced from the basket's own line total by `priceShipping`, against a method resolved from a server-side table — the request names an id, never a cost                                                                                                            | `delivery/`, `cart/services/checkout.ts`                                        |
| Race condition / double spend (§5)         | checkout empties the cart under the `__v` it read the lines at, so exactly one of two racing checkouts wins; the loser retracts its own order and answers 409                                                                                                                 | `cart/repository.ts#clearLinesIfUnchanged`                                      |
| Checkout race (§20)                        | the units are held by a conditional reserve keyed on the order id, and `updateStatusIfIn` re-asserts the precondition inside the write — a stale read cannot land a status change                                                                                             | `inventory/service.ts#reserveForOrder`, `orders/repository.ts#updateStatusIfIn` |
| Workflow step skipping (§5)                | `payments` asks the order lifecycle whether `paid` is still reachable rather than comparing against a literal; the order's move to `paid` is the gate, and a charge whose order slipped away is refunded on the spot                                                          | `payments/service.ts#confirmPayment`                                            |
| State-machine violations (§5)              | `ORDER_LIFECYCLE` is a total map from status to the moves it permits AND the actor each belongs to, so "cancel after shipped" and "a customer marking their own order paid" are both absent edges                                                                             | `orders/domain/lifecycle.ts`                                                    |
| Refund / return abuse (§5/§20)             | the conditional `succeeded → refunded` move IS the idempotence; nothing else in the module may move money, and both callers come through `performRefund`                                                                                                                      | `payments/service.ts#performRefund`                                             |
| Inventory reservation abuse (§5)           | a hold carries `expiresAt` (`NODE_RESERVATION_TTL_MINUTES`, 30 by default) and a batched sweep expires stale ones — an abandoned cart returns its units instead of holding them forever. The sweep is an admin endpoint an external cron calls, not a timer this process owns | `inventory/config.ts`, `POST /inventory/reservations/sweep`                     |
| Stored card data (§20)                     | `cardLastFour` is the only projection of a card number allowed to leave the provider layer; no PAN is persisted, logged or emitted as analytics                                                                                                                               | `payments/providers/card.ts`                                                    |
| Payment callback forgery / replay (§20)    | no surface: there is no inbound webhook. The demo PSP is called outbound and answers in-process                                                                                                                                                                               | `payments/providers/fake.ts`                                                    |
| Multi-step / workflow bypass (§4)          | `POST /cart/checkout` and `POST /payments/:id/confirm` both sit behind `requireFreshAuth(REAUTH_TIME_CRITICAL)`, so the money steps cannot be reached with a merely-valid session                                                                                             | `cart/routes.ts`, `payments/routes.ts`                                          |

## Files, uploads and paths — §6

The upload pipeline is three gates in a fixed order, composed in one place so a route cannot mount
half of it: declared type, then actual bytes, then quarantine-and-digest.

| Catalog row (§6)                      | Control                                                                                                                                                                     | Where                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Unrestricted file upload              | three raster formats only, and the pipeline is composed by `wrapUpload` rather than assembled per route                                                                     | `infrastructure/adapters/storage.ts#upload`                                        |
| Content-type / extension confusion    | the declared MIME decides the stored extension; the bytes are then read and must identify as that same type, so `shell.php.jpg` and a PNG stored as `.jpg` both fail        | `infrastructure/adapters/image-signatures.ts`, `storage.ts#validateUploadedImages` |
| Stored file served with wrong headers | SVG is refused by name — it is XML browsers execute — so `express.static`, which types by extension, can never answer `text/html` or `image/svg+xml` from an upload path    | `image-signatures.ts#SUPPORTED_IMAGE_FORMATS`                                      |
| Filename injection / path traversal   | the client's `originalname` is discarded whole: the stored name is 16 random bytes of hex plus an extension from the closed set                                             | `storage.ts#resolveUploadFilename`                                                 |
| Insecure direct file access (§4)      | 128 bits of randomness in the name is what makes another user's upload unguessable, and `index: false` removes the listing that would make it unnecessary                   | `app/static-assets.ts`                                                             |
| Insecure temp files                   | uploads stage under `NODE_UPLOAD_STAGING_PATH` (system temp by default), NOT under `public/` — nothing is world-reachable between "multer wrote it" and "the checks passed" | `storage.ts#uploadStagingPath`                                                     |
| Decompression bomb / image bomb       | `limitInputPixels` caps the DECODED pixel count at 50 M before any resize runs, which the 5 MB byte ceiling on its own does not                                             | `infrastructure/adapters/image.ts`                                                 |
| Image-processing exploits             | every accepted image is decoded and re-encoded through libvips into the same format, so a payload smuggled in an ancillary chunk does not survive the round trip            | `image.ts#digestImage`                                                             |
| Metadata leakage                      | EXIF/ICC/XMP are dropped on re-encode; orientation is baked into the pixels first so the strip does not rotate the photo                                                    | `image.ts#decode`                                                                  |
| Directory listing                     | `index: false` on the static mount                                                                                                                                          | `app/static-assets.ts`                                                             |
| Backup / source exposure              | `dotfiles: 'ignore'` — a stray `.env` under `public/` is a 404, not a disclosure; `.dockerignore` keeps `.git`, `.env`, coverage and reports out of the image               | `app/static-assets.ts`, `.dockerignore`                                            |
| Zip slip / symlink tricks             | no surface: nothing extracts an archive or follows a client-named path                                                                                                      | —                                                                                  |
| LFI / RFI / SSI injection             | no surface: no include-style loader, no server-side includes                                                                                                                | —                                                                                  |

## The server as a client — §7

| Catalog row (§7)                  | Control                                                                                                                                                          | Where                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| SSRF — basic, blind, via redirect | every outbound `fetch` in `src/` has a hard-coded host: the two OAuth providers' token and profile endpoints, and the analytics collector at its configured host | `account/oauth/providers/`, `infrastructure/observability/analytics/umami.ts`       |
| Webhook / callback abuse          | no surface: no endpoint accepts a URL to call back, and no field stores one                                                                                      | —                                                                                   |
| Cloud metadata access             | reachable only through an SSRF primitive, and there is none                                                                                                      | —                                                                                   |
| SSRF via the PDF renderer         | Chromium receives HTML through `setContent`, never a URL, and every value the invoice template prints goes through `<%= %>`                                      | `infrastructure/adapters/pdf.ts`, `shared/views/templates-files/orders.invoice.ejs` |

## Proxies, caches and the HTTP layer — §8

| Catalog row (§8)                               | Control                                                                                                                                                                             | Where                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Trusted-proxy misconfiguration                 | `trust proxy` is a HOP COUNT from `NODE_TRUST_PROXY_HOPS`, never `true`, so Express counts back from the forgeable end of `X-Forwarded-For`                                         | `app/security.ts`                                      |
| Host header attacks                            | nothing reads `Host`; see the §1 row above                                                                                                                                          | —                                                      |
| Web cache poisoning / cache-key confusion      | the raw query string is NOT part of the cache key — only the route's declared `keyParameters`, pre-sorted and JSON-serialized — so `?anything=else` cannot mint an entry            | `infrastructure/http/middlewares/cache.ts#getCacheKey` |
| Web cache deception                            | the response cache is keyed by caller (`getCacheScope`) and locale, so a private answer cannot be stored under a shared key                                                         | `cache.ts#getCacheScope`                               |
| Cache poisoning by size                        | an entry over `NODE_REDIS_CACHE_MAX_BYTES` is skipped rather than stored, and only 2xx responses are written at all                                                                 | `cache.ts#serializeCachedResponse`                     |
| Range / partial-content leaks, `103` confusion | no surface: this process serves JSON and static files, and the reverse proxy in front of it is out of this repo                                                                     | —                                                      |
| HTTP request smuggling / desync                | not this repo's layer — one Node process behind whatever proxy the deployment puts in front. `docker-compose.production.yml` binds the API to loopback precisely so one is required | `docker-compose.production.yml`                        |
| Slow HTTP / header size abuse                  | Node's own `headersTimeout`/`requestTimeout` defaults apply, unchanged and unaudited                                                                                                | —                                                      |

## The data layer — §12

| Catalog row (§12)                   | Control                                                                                                                                             | Where                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Exposed database / broker           | neither Mongo, Redis nor RabbitMQ publishes a port in the production compose file; they are reachable on the compose network and nowhere else       | `docker-compose.production.yml`                          |
| Default / weak DB credentials       | `MONGO_PASSWORD` and `RABBITMQ_PASSWORD` use compose's `:?` form, so the stack refuses to start rather than falling back to a default               | `docker-compose.production.yml`                          |
| Missing tenant / owner scope        | the owner clause rides IN the read, and a caller with no id yields `''`, which is not a valid ObjectId — a bug here is a 500, never a widened query | `kernel/authorization.ts#createOwnerScope`               |
| Cache poisoning (application cache) | the key carries the caller and the locale as well as the route — see §8 above                                                                       | `infrastructure/http/middlewares/cache.ts`               |
| Stale authorization in cache        | `invalidateCache` clears by tag on every write, and `getCacheScope` means a revoked caller reads their own bucket rather than a shared one          | `cache.ts#invalidateCache`                               |
| Secrets in database                 | refresh, reset, delete-confirmation and backup-code tokens are stored as sha256 digests; a TOTP device secret is AES-256-GCM under a versioned key  | `users/model.ts#hashToken`, `account/two-factor/`        |
| Queue / event poisoning             | an unparseable message is dead-lettered without requeue rather than retried forever; the broker is internal, so the producer is this application    | `infrastructure/adapters/queue.ts`                       |
| Orphaned / residual data            | soft-deleted rows are filtered by the repository's own `visibleScope`, not by each caller remembering to                                            | `infrastructure/persistence/create-repository.ts`        |
| Unbounded / unindexed queries       | `findAll` applies a 1000-row backstop when no limit is named, and both `page` and `pageSize` are capped at the contract layer                       | `create-repository.ts`, `infrastructure/http/schemas.ts` |
| ObjectId leakage                    | ids are identifiers, never secrets: every read that takes one is scoped, so knowing an id grants nothing                                            | `kernel/authorization.ts`                                |

## The API surface — §15

| Catalog row (§15)                               | Control                                                                                                                                                                                                                                        | Where                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Improper inventory management                   | routes are mounted from each module's own manifest, so the route table and the module list cannot drift                                                                                                                                        | `app/routes.ts`, `kernel/registry.ts`                                                 |
| Broken function-level authorization (§4)        | one app-wide assertion rather than twelve local ones: every write route is authenticated AND admin-guarded unless it is listed, with a reason, in `WRITE_EXCEPTIONS` — so a thirteenth module inherits the guarantee instead of opting into it | `tests/cross-cutting/write-routes-are-guarded.test.ts`                                |
| Forced browsing (§4)                            | the same test enumerates the EFFECTIVE route table from the mounted routers, so a route nobody wrote a suite for is still covered                                                                                                              | `tests/cross-cutting/write-routes-are-guarded.test.ts`, `step-up-auth-routes.test.ts` |
| Version downgrade                               | no surface: there is one unversioned API, so there is no older version still routable                                                                                                                                                          | —                                                                                     |
| Webhook forgery / replay                        | no surface: nothing receives a webhook                                                                                                                                                                                                         | —                                                                                     |
| GraphQL rows (introspection, aliases, batching) | no surface: REST only                                                                                                                                                                                                                          | —                                                                                     |
| Bulk / export endpoints                         | `POST /account/export` answers the caller's OWN data and requires a fresh session; the admin listings page at 100 rows                                                                                                                         | `account/routes.ts`, `infrastructure/http/schemas.ts`                                 |
| Unsafe consumption of upstream APIs             | an OAuth provider's profile response is read for a fixed set of fields, and an unverified email is refused rather than trusted                                                                                                                 | `account/oauth/providers/`, `account/services/oauth.ts`                               |
| Content negotiation confusion                   | Express is given exactly three parsers — JSON, urlencoded, multipart — so there is no XML branch to negotiate into                                                                                                                             | `app/security.ts`                                                                     |
| Missing rate limits per key / user              | the global brake is per address; `credentialLimiters` adds a per-account budget on the credential routes specifically                                                                                                                          | `infrastructure/http/middlewares/rate-limit.ts`                                       |
| API key leakage                                 | the one static credential is `NODE_METRICS_TOKEN`, compared with `timingSafeEqual` and DENIED by default when unset                                                                                                                            | `rate-limit.ts#isMetricsScraper`                                                      |

## Real-time — §16

One surface: `GET /observability/events`, Server-Sent Events, admin-only.

| Catalog row (§16)                             | Control                                                                                                                                                          | Where                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Unauthenticated upgrade                       | `isAdminViaCookie` verifies the refresh cookie the way `GET /account/refresh` does — signature AND presence on the user document, so a revoked token is rejected | `kernel/middlewares/authorizations.ts#isAdminViaCookie` |
| Missing origin check                          | `EventSource` is subject to CORS, and the allowlist is explicit rather than reflected — a foreign origin cannot read the stream                                  | `app/security.ts`                                       |
| Broadcast leakage                             | the stream carries process metrics only: request volumes, error rates, latency, uptime, heap. No user data fans out through it                                   | `infrastructure/observability/stream.ts`                |
| Message injection / per-message authorization | one-way by construction: the server writes, the client never sends                                                                                               | `stream.ts`                                             |
| Unencrypted `ws://`                           | not this repo's layer — TLS terminates at the reverse proxy the production compose file requires by binding to loopback                                          | `docker-compose.production.yml`                         |

## Email — §17

| Catalog row (§17)            | Control                                                                                                                                                                                                     | Where                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Template injection in email  | EJS interpolates with `<%= %>`, which HTML-escapes; the only `<%- %>` in the templates is `include(…)` of a fixed layout path                                                                               | `shared/views/templates-emails/`                |
| Link poisoning               | every link in an email is `NODE_URL` plus a route and a token — the `Host` header is not read anywhere in this codebase                                                                                     | `account/emails.ts`                             |
| Notification content leakage | a delivered 2FA code is the only secret an email carries, and it is single-use, time-boxed and deleted the moment it is spent                                                                               | `account/two-factor/delivered-codes.ts`         |
| Header injection             | the contact form's `subject` is user text and it IS concatenated into the mail's Subject — nodemailer's `mime-node` strips CR/LF from every header value, so the stop is the LIBRARY's, not this codebase's | `feedback/emails.ts#contactRequestEmail`        |
| Address parser differentials | the recipient is always a stored, validated `user.email` or the operator mailbox from config — never a value assembled at send time                                                                         | `infrastructure/adapters/mailer.ts`             |
| Open relay                   | no surface: this application is an SMTP client, never a server                                                                                                                                              | —                                               |
| Email bombing / resend abuse | `credentialLimiters` on `/reset`, `/verify-request` and the 2FA send route; `mfaSendLimiter` bounds outbound codes separately from guesses                                                                  | `infrastructure/http/middlewares/rate-limit.ts` |

## Runtime and process — §19

| Catalog row (§19)                              | Control                                                                                                                                                         | Where                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Unhandled rejections / exceptions              | both are registered: a rejection is audited, an uncaught exception is audited and then exits — the state after one is unknown, so the only safe move is to stop | `app/error-handling.ts#installErrorHandling`                         |
| Environment-variable trust                     | `environmentNumber` bounds every numeric env read, and the boot gate refuses to start on a missing, too-short or placeholder secret                             | `infrastructure/runtime/environment.ts`, `kernel/required-config.ts` |
| Path resolution quirks                         | `toPosixPath` is the one normalisation, and it is safe only because the names it sees are random hex — which is stated where it is written                      | `infrastructure/http/uploads.ts#toPosixPath`                         |
| `vm` / sandbox escape, `eval`, `child_process` | none of the three appears in `src/`                                                                                                                             | —                                                                    |
| Weak `Math.random` tokens                      | every token, code, filename, `jti` and IV comes from `node:crypto` — `randomBytes`, `randomUUID` or `randomInt`                                                 | `account/`, `infrastructure/adapters/storage.ts`                     |
| Container running as root                      | the production image drops to the `node` user after the last `apk`/`npm` step, and `--ignore-scripts` keeps a transitive postinstall from running at build time | `.docker/Dockerfile.production`                                      |
| Debugger / inspector exposed                   | nothing passes `--inspect`; `npm start` is `tsx src/cluster.ts`                                                                                                 | `package.json`                                                       |

## Automation and abuse — §21

| Catalog row (§21)          | Control                                                                                                                                                                                             | Where                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Spam via forms             | a honeypot field (`website`) the contract declares and nothing persists: a non-empty value writes the row as `spam` and skips the notification, and the bot still gets its 201 so it learns nothing | `feedback/service.ts#create`     |
| Fake account creation      | `credentialLimiters` on signup — a per-address and a per-identity budget                                                                                                                            | `account/routes.ts`              |
| Scraping                   | every listing is paginated and capped at 100 rows per page, with `page` capped too, so there is no one call that returns the catalogue                                                              | `infrastructure/http/schemas.ts` |
| Review / vote manipulation | no surface: there are no ratings, reviews or votes                                                                                                                                                  | —                                |
| SMS pumping                | no surface: no SMS factor exists — see "What two-factor auth adds, honestly" above                                                                                                                  | —                                |

## Supply chain — §14, re-walked

The row in "Hardening" above says `npm audit fix` was run for the production-facing advisories.
That was true when it was written and is not true now. As of this walk, `npm audit --omit=dev`
reports 7 advisories in the production tree — 3 high, 2 moderate, 2 low:

| Advisory                                                                                | Reachable here?                                                                                                                                                                   | Fix                               |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `mongoose` — prototype pollution via `__proto__`-prefixed dotted path in update casting | **Yes, in principle.** Every write goes through mongoose. The generated Zod schemas strip unknown keys before a body reaches a service, which is the layer that actually stops it | non-breaking, `npm audit fix`     |
| `qs` — array-limit bypass, and DoS via attacker-controlled `isBuffer`                   | **Yes.** `express.urlencoded({ extended: true })` parses with `qs`                                                                                                                | non-breaking, `npm audit fix`     |
| `body-parser` — an invalid `limit` value silently disables size enforcement             | **Operator-triggered.** The limit is `NODE_JSON_BODY_LIMIT`; a typo in it removes the body-size ceiling rather than failing loudly                                                | non-breaking, `npm audit fix`     |
| `puppeteer-core` → `@puppeteer/browsers` → `extract-zip` (symlink path traversal)       | **No.** `extract-zip` is used by the browser DOWNLOAD path; this repo runs `puppeteer-core` against an `executablePath` and never downloads one                                   | major bump to `puppeteer-core@25` |
| `esbuild` — file read via its development server on Windows                             | **No.** `tsx` uses esbuild as a transpiler; the dev server is never started                                                                                                       | non-breaking                      |

The alarm above is wired correctly and calibrated wrongly: `--audit-level=high` fails on the one
row nothing can act on (the puppeteer chain) and stays silent about the three that are reachable,
because all three are moderate or low. A permanently-red non-blocking job is a job nobody reads,
which is how reachable advisories stayed invisible in a repo that audits on every push.

| Catalog row (§14)                    | Control                                                                                                                                                                                      | Where                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Install scripts                      | the runtime image installs with `--ignore-scripts`, so no transitive `postinstall` runs at build time                                                                                        | `.docker/Dockerfile.production`             |
| Lockfile tampering                   | `npm ci`, never `npm install`, in both image stages — it installs exactly the lockfile and never rewrites it                                                                                 | `.docker/Dockerfile.production`             |
| Third-party scripts / CDN compromise | no surface on this side: this process serves JSON and its own static files, and loads no remote script                                                                                       | —                                           |
| Build-pipeline compromise            | the build stage IS the gate: `tsc --noEmit && eslint` must pass or no image is produced                                                                                                      | `.docker/Dockerfile.production`             |
| Base-image vulnerabilities           | pinned to `node:25-alpine` by major only, so a rebuild picks up patches — and only a rebuild does                                                                                            | `.docker/Dockerfile.production`             |
| Vulnerable dependencies              | `npm audit --omit=dev` runs on every push and PR, deliberately OUTSIDE the `ci` gate — a transitive high with no non-breaking fix must not block every merge, so it alerts rather than gates | `.github/workflows/ci.yml`, the `audit` job |

## What is still open

The catalog's own honesty rule, applied to the whole walk: a row with no control gets said out
loud. Two lists — decisions, and findings.

### Deliberate, and why

- **§18 MFA fatigue / push bombing, §3 SIM swap** — see "What two-factor auth adds" above: not
  mitigated because the factor they attack was never built.
- **Self-service 2FA reset by email** — deliberately absent. Recovery from a lost authenticator
  and lost backup codes is admin-assisted only (`DELETE /users/:id/2fa`), audited, and requires
  no code — the one deliberate exception, made loudly rather than inherited from a convenience
  endpoint. A mailbox-based reset would reduce 2FA to mailbox possession, the exact thing it
  exists to defend against.
- **§3 Enforcing 2FA on admins** — open: worth wanting, but a policy layer on top of everything
  above, and it needs an answer for the admin who enrols nothing and locks the panel. Not
  answered here.
- **§3 2FA bypass via linked OAuth provider** — `GET /account/oauth/:provider/callback` mints a
  session without consulting `twoFactorEnabledAt`. An account with a linked provider has an
  unchallenged way in, so 2FA on this deployment is a control on the password path only. See
  [Security](../tools/security.md#what-is-not-covered).
- **§8 request smuggling, §9 TLS, §13 edge WAF** — one Node process, no proxy in this repo.
  `docker-compose.production.yml` binds the API to loopback so a TLS-terminating proxy is
  structurally required, and that proxy's configuration is deliberately out of scope here.
- **§2 Client-side in full** — XSS, CSP, clickjacking, token storage and the browser half of CSRF
  are the frontend's rows. This backend sets `helmet()` and `SameSite=Lax`, `HttpOnly`,
  `Secure`-in-production cookies; everything downstream of that is `boilerplate-vue-frontend`'s
  to answer, and it has no defences page yet.

### Found by this walk, not yet answered

- **§14 Vulnerable dependencies — the production tree has drifted, and the alarm's threshold
  hides it.** Seven advisories. `mongoose`, `qs` and `body-parser` all have non-breaking fixes
  that are simply not applied, and all three are below the `--audit-level=high` the CI job uses —
  so the job is red for the unfixable puppeteer chain and quiet about the reachable ones. See the
  supply-chain table above for which are actually reachable.
- **§12 Over-privileged DB account.** The application connects as the Mongo ROOT user
  (`authSource=admin`, the account `MONGO_INITDB_ROOT_*` creates). One compromised connection
  string reads and drops every database on the instance, not just this one.
- **§12 Exposed message broker / weak cache credentials.** Redis runs with no `requirepass`.
  Network isolation — no published port — is the entire control, so a second container on the
  compose network, or any SSRF primitive that later appears, reaches it unauthenticated.
- **§17 Unverified email at signup / §3 pre-account-takeover.** Nothing enforces `verified`: no
  route, no middleware, no guard reads it. An account bound to an address its holder does not own
  can order, check out and pay. The OAuth link path is the only place that demands a verified
  address, and it demands it of the PROVIDER, not of this account.
- **§21 Insufficient anti-automation.** There is no CAPTCHA, proof-of-work or device signal
  anywhere. Rate limits and the contact form's one honeypot field are the whole story, and rate
  limits are per address — which a distributed client does not have one of.
- **§15 The contract's `additionalProperties: false` is not enforced at runtime.** orval emits
  `zod.object({…})`, not `.strict()`, and Zod STRIPS unknown keys rather than rejecting them. The
  security outcome is fine — an extra field never reaches a service — but a request the contract
  forbids is answered `200`, so the contract and the runtime disagree about what is legal.
- **§11 Slow HTTP.** Node's own `headersTimeout` / `requestTimeout` defaults are unchanged and
  were never audited against this deployment. Nothing in-process bounds a slow-read client.
- **§12 Queue message validation.** A consumer shape-checks a payload and dead-letters what it
  cannot use; it does not parse it against the generated AsyncAPI schema. The broker is internal
  and the producer is this application, which is why it has been acceptable — it stops being
  acceptable the day anything else publishes to these queues.
- **§20 The PSP is a stub.** `payments/providers/fake.ts` never talks to the outside world, which
  is why the whole webhook half of §20 reads "no surface" above. A real integration brings
  callback forgery, callback replay and 3-D Secure back in one commit, and none of the controls
  for them exist yet.

## Keeping this page true

Nothing enforces it structurally, the same caveat the catalog itself carries. A file named in the
table above that moves or is renamed should update its row in the same commit; a control removed
without removing its row here is worse than never having written the row.

The supply-chain table is the one section with a shelf life measured in weeks rather than commits:
it records what `npm audit --omit=dev` said on the day it was walked, and it is stale the moment a
lockfile moves. Re-run it, do not trust it.
