# Web Attack Defences

The [Web Attack Catalog](./web-attack-catalog.md) is deliberately theory-only — every flaw a
website can have, with no word about this codebase. This page is the other half: which catalog row
each control stops, and where that control lives. A "clean" verdict is only useful to the next
reader if it says against what, so the perimeter this repo reviewed and left alone is mapped here
too, not just the rows a change actually touched.

Scoped to authentication and session hardening — the one area a dedicated plan worked through row
by row. Personal-data handling (retention, consent, redaction, the export/erasure endpoints) is a
different lens on an overlapping set of files; see [Data Protection](./data-protection.md) for
that side of it.

## Revocation and session lifetime

| Catalog row (§3 unless noted)                              | Control                                                                                                                                                        | Where                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Missing invalidation                                       | password change, deactivation and soft-delete each revoke every refresh token                                                                                  | `account/services/authentication.ts`, `users/service.ts#update`                |
| JWT — no revocation                                        | refresh tokens are checked against the live, stored set on every use, not just signature-verified                                                              | `account/session/jwt.ts#verifyRefreshToken`, `users/repository.ts`             |
| Insufficient session expiry (deactivated/deleted accounts) | a deactivated or soft-deleted account stops authenticating on its very next request, not merely at its next login                                              | `users/repository.ts#findAuthenticatableById`, `account/module.ts#resolve`     |
| Refresh-token misuse — reuse after rotation                | a refresh token replayed after it was rotated away revokes the account's entire refresh set                                                                    | `account/session/jwt.ts#rotateRefreshToken`, `TokenReuseError`                 |
| Session hijacking / sidejacking                            | rotating the refresh token's value on every exchange makes a stolen cookie detectable on its next presentation, not silently reusable for the rest of its life | `account/session/jwt.ts#rotateRefreshToken`                                    |
| Predictable session tokens                                 | a random `jti` per mint, so two logins in the same second cannot collide into one revocable session                                                            | `account/session/jwt.ts#createRefreshToken`                                    |
| Secrets at rest in plaintext (§9)                          | refresh, reset and delete-confirmation tokens are stored as sha256 digests, never the live value                                                               | `users/model.ts#hashToken`, `db/migrations/20260901120000-hash-user-tokens.js` |

## A boot that refuses

| Catalog row (§13)               | Control                                                                                                                                                | Where                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Security misconfiguration       | the app refuses to start if `NODE_TOKEN_ACCESS`/`NODE_TOKEN_REFRESH`/`NODE_TOTP_ENCRYPTION_KEY` are unset, too short, or still the shipped placeholder | `kernel/registry.ts`, each module's `requiredConfig` |
| Insecure defaults of frameworks | a misconfigured `NODE_TRUST_PROXY_HOPS` warns loudly rather than silently trusting a spoofable `X-Forwarded-For`                                       | `app/security.ts`                                    |
| Secrets in environment          | the demo dataset/seed interlock refuses to run against a build that isn't explicitly `NODE_DEMO` and non-production                                    | `app/demo.ts`                                        |

## Hardening — the small ones

| Catalog row                                      | Control                                                                                                   | Where                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Unbounded queries (§11)                          | `page`, not only `pageSize`, is capped                                                                    | `infrastructure/http/schemas.ts`, `shared/contracts/openapi.root.yaml` |
| Timing attack on comparison / User enumeration   | a login miss compares against a dummy bcrypt hash, so an unknown email costs the same as a wrong password | `account/services/authentication.ts#DUMMY_PASSWORD_HASH`               |
| JWT — `alg: none` / key confusion                | `{ algorithms: ['HS256'] }` pinned on every verify                                                        | `account/session/jwt.ts`                                               |
| Log injection / log forging (§1), CRLF injection | `x-request-id` is validated against a UUID shape before it's ever reflected back or written to a log line | `app/request-context.ts`                                               |
| Large request bodies (§11)                       | an explicit `limit` on `express.json()`/`express.urlencoded()`, rather than trusting the library default  | `app/security.ts`                                                      |
| Vulnerable dependencies (§14)                    | `npm audit fix` for the production-facing advisories (mongoose, body-parser)                              | `package.json`                                                         |

## Step-up authentication

| Catalog row (§3)                     | Control                                                                                                                                                                                         | Where                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Email-change without re-verification | the whole reason this wave exists: changing the email, deleting the account, session management, checkout and payment confirmation all demand proof of a RECENT session, not merely a valid one | `kernel/middlewares/authorizations.ts#requireFreshAuth`, mounted per-route in `account/routes.ts`, `cart/routes.ts`, `payments/routes.ts` |
| JWT — no revocation (freshness half) | `auth_time`/`amr` are carried claims, never derived from the clock — a token minted before step-up existed reads as infinitely old and is asked to re-prove itself                              | `account/session/jwt.ts`'s `TokenData` doc                                                                                                |
| Remember-me token flaws              | the "remember me" tiers set the refresh cookie's own lifetime, but do not exempt a sensitive action from the freshness check above — a long-lived session still has to step up                  | `account/session/config.ts#RefreshTokenExpiryTime`                                                                                        |

## Two-factor authentication

| Catalog row (§3)                                                | Control                                                                                                                                                                                                                                       | Where                                                                                           |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| OTP / 2FA bypass — attempt cap                                  | a dedicated rate limiter bounds guesses against ONE still-live login challenge, independent of the account/address budgets                                                                                                                    | `infrastructure/http/middlewares/rate-limit.ts#mfaChallengeLimiter`                             |
| OTP / 2FA bypass — response tampering                           | the challenge is server-verified end to end; there is no client-visible intermediate `{ok:false}` a caller could rewrite                                                                                                                      | `account/services/two-factor.ts#verifyLoginChallenge`                                           |
| OTP / 2FA bypass — replay                                       | the RFC 6238 time step of the last accepted code is tracked per account; the identical code cannot verify twice                                                                                                                               | `account/two-factor/totp.ts#verifyTotpCode`; a delivered code is deleted the moment it is spent |
| JWT — no revocation / token confusion                           | the login challenge is a distinct, single-purpose token (`purpose: 'mfa'`); the one place every access/refresh token is resolved explicitly rejects any token carrying that claim, so a challenge can never authenticate a request on its own | `account/module.ts#resolve`, proven by `tests/integration/two-factor.test.ts`'s bypass test     |
| Secrets at rest in plaintext (§9)                               | a device secret is AES-256-GCM encrypted with a versioned key, never plaintext; a delivered code is an HMAC under the same key, since six digits fall to a bare digest; backup codes are hashed the way refresh tokens are                    | `account/two-factor/`                                                                           |
| Brute force / Credential stuffing / Password spraying (partial) | a second factor is a real second control past the password, on top of the rate limiting that already bounded these rows                                                                                                                       | `account/two-factor/`, `account/routes.ts`                                                      |

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

## The perimeter reviewed clean

Not touched by this plan, and reviewed while working through it — mapped here because "clean" is
only a useful verdict against a named row.

| Catalog row                                       | Control                                                                                                             | Where                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Missing security headers (§13)                    | `helmet()`, applied globally                                                                                        | `app/security.ts`                                                   |
| Permissive CORS (§13/§2)                          | an explicit origin allowlist, not `*`                                                                               | `app/security.ts`                                                   |
| No WAF / rate limiting at the edge (§13)          | a global per-address burst brake, plus the credential-specific budgets identity/address pair below it               | `infrastructure/http/middlewares/rate-limit.ts`                     |
| Brute force / Credential stuffing (§3)            | `credentialLimiters` — two independent budgets, per account and per address, spent only by failures                 | `infrastructure/http/middlewares/rate-limit.ts#credentialLimiters`  |
| Large request bodies via uploads (§11)            | a dedicated, tighter budget for routes that accept an image, separate from the general burst brake                  | `infrastructure/http/middlewares/rate-limit.ts#uploadLimiter`       |
| NoSQL injection (§1)                              | search input reaching a `$regex` filter is escaped before it gets there                                             | `infrastructure/persistence/search.ts#escapeRegex`                  |
| Excessive data exposure / IDOR (§10 / §4)         | a caller's own resource is looked up scoped to their id, not fetched by id and checked after                        | `orders/repository.ts#findByIdScoped` and the equivalent per module |
| Sensitive data in logs / Credential leakage (§10) | password hashes, live tokens and (configurably) personal fields are redacted or hashed before a log line is written | `infrastructure/adapters/logger.ts#SENSITIVE_FIELDS`                |

## Not mitigated, and why that is a decision

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
- **§3 SSO / OAuth rows** — not applicable; this build has no external identity provider.

## Keeping this page true

Nothing enforces it structurally, the same caveat the catalog itself carries. A file named in the
table above that moves or is renamed should update its row in the same commit; a control removed
without removing its row here is worse than never having written the row.
