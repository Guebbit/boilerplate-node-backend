# BE-5 findings — Account & auth: tokens, sessions, cookies, JWT

Expectations frozen blind in `BE-5.expectations.md` (commit `dde76da9`) before any file below was
opened.

Convention: an `it.each(...)` call is one row (not one row per generated case) — every case in a
given block shares the same spec-derived expectation, the same assertion shape and the same
verdict, so exploding them adds rows without adding audit signal. The row's "actual assertion"
column notes the parameter count.

## Files read, in order

Spec (step 1, blind): `src/modules/account/openapi.yaml`, `shared/contracts/openapi.root.yaml`,
RFC 6265, RFC 7519.

Implementation, then tests, grouped as the batch description suggests (tokens/config → JWT →
cookies → routes → login/logout/session services → signup/profile → addresses → verify/reset/
delete → token-cleanup → emails/audit/fixtures → locale → cross-cutting hardening/observability):

1. `src/modules/account/session/cookies.ts`
2. `src/modules/account/session/jwt.ts`
3. `src/modules/account/session/config.ts`
4. `src/modules/account/tests/unit/cookies.test.ts`
5. `src/modules/account/tests/unit/session-jwt.test.ts`
6. `src/modules/account/tests/unit/tokens.test.ts`
7. `src/modules/account/controllers/post-login.ts`
8. `src/modules/account/controllers/post-logout.ts`
9. `src/modules/account/controllers/post-logout-everywhere.ts`
10. `src/modules/account/controllers/get-refresh-token.ts`
11. `src/modules/account/controllers/get-sessions.ts`
12. `src/modules/account/controllers/delete-session.ts`
13. `src/modules/account/services/authentication.ts`
14. `src/modules/account/services/tokens.ts`
15. `src/modules/account/tests/integration/jwt.test.ts`
16. `src/modules/account/tests/unit/routes.test.ts`
17. `src/modules/account/tests/unit/auth-surface.test.ts`
18. `src/modules/account/controllers/post-verify-request.ts`, `post-verify-confirm.ts`,
    `post-reset-request.ts`, `post-reset-confirm.ts`, `post-password-change.ts`,
    `delete-account-request.ts`, `delete-account-confirm.ts`, `post-signup.ts`
19. `src/modules/account/tests/integration/service.test.ts`
20. `src/modules/account/tests/integration/service-flows.test.ts`
21. `src/modules/account/tests/integration/self-service.test.ts`
22. `src/modules/account/controllers/put-account.ts`, `get-account.ts`,
    `src/modules/account/services/profile.ts`
23. `src/modules/account/services/addresses.ts`, `controllers/get-addresses.ts`,
    `controllers/write-addresses.ts`, `controllers/delete-address.ts`, `repository.ts` (address
    book slice)
24. `src/modules/account/tests/integration/addresses.test.ts`
25. `src/modules/account/tests/integration/persisted-locale.test.ts`
26. `src/modules/account/tests/unit/delete-account.test.ts`
27. `src/modules/account/tests/unit/emails.test.ts`
28. `src/modules/account/tests/unit/audit.test.ts`
29. `src/modules/account/tests/unit/fixtures.test.ts`
30. `src/modules/account/services/token-cleanup.ts`, `controllers/delete-expired-tokens.ts`
31. `src/modules/account/tests/unit/token-cleanup.test.ts`
32. `src/modules/account/tests/unit/token-cleanup-job.test.ts`
33. `tests/integration/auth-hardening.test.ts`
34. `tests/integration/observability-auth.test.ts`

## Headline finding

**MISMATCH-CODE, S2** — `src/modules/account/tests/integration/self-service.test.ts`,
`updateProfile` › `'answers 404 for an account that no longer exists'`. `openapi.yaml`'s `PUT
/account` declares only `200/401/409/422/500` (openapi.yaml:40-51) — no `404` — yet
`updateProfile` (`services/profile.ts:234`) returns `generateReject(404, [])` when the id is gone,
and `putAccount` (`controllers/put-account.ts:49-52`) passes `result.status` straight through
unmodified to `rejectResponse`, so the undeclared `404` reaches the wire verbatim. The test asserts
exactly this undeclared code, at the service layer, one call away from the HTTP boundary. Every
other endpoint in this module that CAN 404 declares it explicitly (`DELETE /account/sessions/
{sessionId}`, both `/account/addresses/{addressId}` verbs) — the omission for `PUT /account` reads
as deliberate, making this a real contract gap rather than spec noise. No S1 findings.

## Findings table

| # | File | Test | Expectation(s) | Spec-derived expectation | Actual assertion | Verdict | Sev | Why |
|---|------|------|-----------------|--------------------------|-------------------|---------|-----|-----|
| 1 | cookies.test.ts | `createRefreshCookie` › sets httpOnly, lax, site-wide | E26 | `jwt` cookie `HttpOnly` (openapi.yaml:383) + RFC6265 §4.1.2.6 | `httpOnly:true` (matches), `sameSite:'lax'`, `path:'/'` (undocumented) | OK | S1 | httpOnly is the load-bearing, spec-backed half; sameSite/path have no Tier A source but aren't contradicted |
| 2 | cookies.test.ts | `createRefreshCookie` › secure in production | E27 | RFC6265 §4.1.2.5 (Secure = TLS-only); Tier A doesn't mandate Secure at all | `secure:true` when `NODE_ENV==='production'` | SPEC-SILENT | S1 | No Tier A source requires Secure or ties it to `NODE_ENV` |
| 3 | cookies.test.ts | `createRefreshCookie` › non-secure outside production | E27 | same | `secure:false` outside production | SPEC-SILENT | S2 | Policy choice, undocumented in Tier A |
| 4 | cookies.test.ts | `createRefreshCookie` › maxAge from tier | E15 | tiers "sized by the deployment" (openapi.yaml:496-499), exact number not specified | `maxAge===3_600_000` from `NODE_TOKEN_REFRESH_TIME_SHORT` | SPEC-SILENT | S3 | Tier A leaves exact durations to deployment config |
| 5 | cookies.test.ts | `createRefreshCookie` › falls back to access-token window | E15 | "Omitted, the cookie lives only as long as an access token" (openapi.yaml:496-499) | `maxAge===900_000` = access-TTL×1000 | OK | S2 | Directly matches the frozen expectation's literal text |
| 6 | cookies.test.ts | `destroyRefreshCookie` › same flags as set | — | not in Tier A | `clearCookie` called with `httpOnly/sameSite/path` matching `createRefreshCookie` | SPEC-SILENT | S1 | Browser cookie-matching mechanics, not a contract fact |
| 7 | cookies.test.ts | `destroyRefreshCookie` › matches secure flag when clearing | — | not in Tier A | `secure:true` in production on clear | SPEC-SILENT | S2 | Same as #2 |
| 8 | cookies.test.ts | `createLoggedCookie` › readable isAuth hint | — | `isAuth` cookie is not mentioned anywhere in openapi.yaml | `httpOnly` undefined, `sameSite:'lax'`, `path:'/'` | SPEC-SILENT | S2 | Whole `isAuth` cookie concept is outside Tier A |
| 9 | cookies.test.ts | `createLoggedCookie` › expires in step with refresh cookie | — | not in Tier A | `maxAge` equals refresh cookie's | SPEC-SILENT | S3 | Internal consistency, undocumented |
| 10 | cookies.test.ts | `destroyLoggedCookie` › clears on same path | — | not in Tier A | `clearCookie('isAuth', {path:'/'})` | SPEC-SILENT | S3 | — |
| 11 | session-jwt.test.ts | `verifyAccessToken` × 5 cases (accepts access secret; rejects refresh secret; rejects bad sig; rejects expired; rejects nonsense) | E25, E30 | `bearerFormat: JWT` (root.yaml:52-55); RFC7519 §4.1.4 exp must reject on/after expiry | jsonwebtoken `verify` behavior against a stub `@modules/users` | OK (expiry case), SPEC-SILENT (secret-separation, cross-type rejection) | S1 | Expiry rejection matches RFC7519 §4.1.4 directly; the two-secret separation is a real security property Tier A never states |
| 12 | session-jwt.test.ts | `verifyRefreshToken` × 6 cases (resolves when signed+stored; rejects unstored "Forbidden"; rejects not-reached-DB on bad sig; rejects DB-failure as rejection not success) | — | Tier A never describes a stateful refresh-revocation check | DB-lookup-gated verification via mocked `userRepository.findByTokenValue` | SPEC-SILENT | S1 | Revocation-via-DB is real and important but not a Tier A statement — it's an implementation choice, not a contract fact |
| 13 | session-jwt.test.ts | `createRefreshToken` × 8 cases (stores; reads with credentials; signs w/ refresh secret only; pins HS256; unique jti per token; exp-iat matches tier seconds & ms-record; refuses unknown user) | E25, E30 | JWT is base64url 3-part (RFC7519 §3); exp is NumericDate seconds (§4.1.4, §2) | `exp-iat===2_592_000` for `long`; HS256 header; distinct `jti` | OK (exp/NumericDate arithmetic), SPEC-SILENT (HS256 pin, jti uniqueness, "user not found" error) | S1 | The seconds-based exp/iat difference is exactly what RFC7519's NumericDate defines; algorithm pinning and jti aren't Tier A requirements |
| 14 | session-jwt.test.ts | `createAccessToken` × 4 cases (mints from stored refresh; refuses revoked "Forbidden"; signs w/ access secret + HS256; short TTL not refresh window) | E25, E30 | access token TTL is seconds (openapi.yaml:465-467, "Access token expiry in seconds") | `exp-iat===900` | OK | S1 | Matches AuthTokens.expiresIn's stated unit and RFC7519 NumericDate |
| 15 | session-jwt.test.ts | `recordRefreshTokenUse` × 3 cases (stamps once; resolves undefined; swallows failure) | E6 | `lastUsedAt` "absent until it makes one" implies a stamp-on-use mechanism exists (openapi.yaml:646-651) | calls `userRepository.tokenTouch` once, resolves `undefined` even on failure | SPEC-SILENT | S3 | Mechanism/plumbing not itself described by Tier A; only the resulting field semantics are (see #63 below) |
| 16 | tokens.test.ts (config) | `getExpiryTime` × 5 cases | — | Tier A never names env vars or fallback rules | tier-to-env-var routing, base-10 parse, 0-on-empty | SPEC-SILENT | S3 | Pure config plumbing, not a contract concept at all |
| 17 | tokens.test.ts | `getExpiryTimeMilliseconds` × 3 cases | — | same | ×1000 scaling, 0-not-NaN | SPEC-SILENT | S3 | — |
| 18 | tokens.test.ts | `token secrets` × 2 cases | — | same | secrets from distinct env vars, `''` fallback | SPEC-SILENT | S1 | Secret-management detail, not a Tier A fact (though obviously security-relevant) |
| 19 | tokens.test.ts | `getAccessTokenTTL` × 3 cases | — | same | reads `NODE_TOKEN_ACCESS_TIME` only | SPEC-SILENT | S3 | — |
| 20 | jwt.test.ts (integration) | `verifyAccessToken` × 5 cases incl. tampered-payload | E25, E30 | same as #11 | real DB round trip via `setupTestDb` | OK/SPEC-SILENT split as #11 | S1 | Same reasoning, against a real store rather than a stub |
| 21 | jwt.test.ts | `verifyRefreshToken` × 5 cases | — | same as #12 | real document revocation check | SPEC-SILENT | S1 | — |
| 22 | jwt.test.ts | `createRefreshToken` × 4 cases (persists verifiable token; stores w/ REFRESH type+expiry; refuses unknown user; accumulates across devices) | E6 | sessions are per-device, multiple live refresh tokens per user implied by `GET /account/sessions` returning an array (openapi.yaml:659-667) | two tokens for one user both independently verifiable | OK | S1 | Directly supports the multi-session model the Sessions array schema implies |
| 23 | jwt.test.ts | `createAccessToken` × 5 cases (exchanges stored token; refuses revoked "Forbidden"; revokes without throwing on unloaded doc; refuses forged; carries correct identity not caller-supplied) | E7 | revocation must actually deny future access, matching "revoking the current session is allowed" language and the general refresh/session model | revoked token can no longer mint an access token | OK | S1 | This is the property that makes `DELETE /account/sessions/{id}` and logout meaningful at all — directly supports E7/E20 |
| 24 | routes.test.ts | mounts exactly the documented endpoints, in the documented order | E1-E21 (endpoint existence) | the 21 account paths/verbs declared across openapi.yaml | router's 21 signatures compared to a literal list | OK | S2 | Set matches Tier A's path list exactly; ORDER itself isn't a Tier A fact, only presence/completeness is |
| 25 | routes.test.ts | router-wide middleware order (`getAuth`, `noStore`) | — | not in Tier A | `routerMiddleware(router)` equals `['getAuth','noStore']` | SPEC-SILENT | S3 | Caching/plumbing detail |
| 26 | routes.test.ts | `it.each` all 21 routes marked no-store | — | not in Tier A | every route chain contains `noStore` | SPEC-SILENT | S3 | — |
| 27 | routes.test.ts | `it.each` AUTHENTICATED (13 routes) require `isAuth` | E1,E2,E3,E4,E6,E7,E8,E9,E10,E11,E12,E20,E21 | `security: [bearerAuth]` on exactly these operations | `guardsOn(...).toContain('isAuth')` | OK | S1 | Set of authenticated routes matches Tier A's `security: bearerAuth` list exactly |
| 28 | routes.test.ts | `it.each` TOKEN_BEARING (5 routes) must NOT require `isAuth` | E5,E13,E14,E18,E19 | `security: []` on delete-confirm, reset-confirm, verify-confirm, refresh, logout | `guardsOn(...).not.toContain('isAuth')` | OK | S1 | Matches Tier A's `security: []` list exactly |
| 29 | routes.test.ts | `it.each` login/signup/reset stay public | E15,E16,E17 | `security: []` | same | OK | S1 | — |
| 30 | routes.test.ts | admin-guards the token sweep and nothing else | E21 | `deleteExpiredTokens` "Restricted to administrators" (openapi.yaml:413), the only admin-tagged op here | only `DELETE /tokens/expired` carries `isAdmin` | OK | S1 | Exact match to the one admin-only account operation |
| 31 | routes.test.ts | demands session before checking role on the sweep | — | Tier A states 401 and 403 are both possible (openapi.yaml:416-420) but not their CHECK ORDER | `isAuth` index < `isAdmin` index | SPEC-SILENT | S2 | Order not specified by Tier A, though it is what makes a 401-before-403 split actually happen |
| 32 | routes.test.ts | `it.each` RATE_LIMITED (7 routes) carry both credential budgets | — | not in Tier A (no rate-limit language anywhere in openapi.yaml) | both `credentialLimiters[0/1]` present | SPEC-SILENT | S2 | Matches E33's blind prediction exactly |
| 33 | routes.test.ts | rate-limits before authenticating | — | same | limiter index < `isAuth` index for 2 routes | SPEC-SILENT | S3 | — |
| 34 | routes.test.ts | leaves non-credential routes unbudgeted | — | same | no other route carries `credentialLimiters` | SPEC-SILENT | S3 | — |
| 35 | routes.test.ts | `it.each` cache-invalidation tags (6 routes) | — | not in Tier A | `invalidateCache([users|account])` present | SPEC-SILENT | S3 | — |
| 36 | routes.test.ts | logout-all clears only account tag | — | same | `invalidateCache([account])` | SPEC-SILENT | S3 | — |
| 37 | routes.test.ts | `it.each` imageUpload wiring (2 routes) | E2,E16 (imageUpload field exists) | `imageUpload` is a valid multipart field on signup/update (openapi.yaml:518-537,590-609) | `upload.single`, `validateUploadedImages`, `quarantineUploadedImages` present | SPEC-SILENT | S2 | Confirms the field exists per contract, but validation/quarantine mechanics aren't Tier A facts |
| 38 | routes.test.ts | caches nothing anywhere | — | not in Tier A | no route carries `setCache` | SPEC-SILENT | S3 | — |
| 39 | auth-surface.test.ts | `it.each` re-exports `addressForCheckout` unchanged | — | not in Tier A (internal module wiring) | identity check on barrel export | SPEC-SILENT | S3 | — |
| 40 | auth-surface.test.ts | exports nothing beyond declared groups | — | same | `Object.keys(account)` equals literal list | SPEC-SILENT | S3 | — |
| 41 | service.test.ts | `signup` › creates account, returns it | E16 | 201 UserEnvelope on success (openapi.yaml:331-337) | email/username round-trip + persisted row | OK | S2 | — |
| 42 | service.test.ts | `signup` › never stores password as sent | E22 | User schema has no password field at all (root.yaml:382-430) | bcrypt-prefix hash stored | SPEC-SILENT | S1 | Storage hashing itself isn't a Tier A statement, only the User response shape's absence of the field is; but this is exactly the invariant that keeps E22 true |
| 43 | service.test.ts | `signup` › rejects mismatched confirm with 422 | E16 | 422 ValidationError | `status===422`, errors non-empty | OK | S2 | — |
| 44 | service.test.ts | `signup` › rejects taken email with 409 not 422 | E16 | 409 Conflict (openapi.yaml:338-339) | `status===409` | OK | S2 | — |
| 45 | service.test.ts | `signup` › `it.each` 3 invalid-input cases → 422 | E16 | 422 ValidationError | `status===422` | OK | S2 | — |
| 46 | service.test.ts | `signup` › absent image stored as `''` not schema default | — | not in Tier A (`imageUrl` optional, no default behavior stated) | `imageUrl===''` | SPEC-SILENT | S3 | — |
| 47 | service.test.ts | `login` › returns user for correct credentials | E15 | 200 AuthTokensEnvelope path begins with a credential check | `email` round-trip on success | OK | S2 | — |
| 48 | service.test.ts | `login` › does not reveal whether account exists (identical 401s) | E15 | 401 declared; Tier A does NOT state indistinguishability for login (unlike reset's explicit no-404 statement, E17) | both branches 401, identical errors/message | SPEC-SILENT | S1 | Real, important anti-enumeration property, but this batch's Tier A never states it for login specifically (only for reset) |
| 49 | service.test.ts | `login` › refuses soft-deleted account | — | not in Tier A (deletedAt is a `User` field, root.yaml:423-429, but login's interaction with it isn't spelled out) | 401 | SPEC-SILENT | S1 | — |
| 50 | service.test.ts | `login` › short password 422 before DB, for anyone | E15 | 422 ValidationError, distinct from 401 | `status===422` for both known/unknown accounts | OK | S2 | Matches "422 across the board for validation failures" that `service-flows.test.ts`'s own comment states explicitly |
| 51 | service.test.ts | `login` › `it.each` 3 missing/malformed-input cases → 422 | E15 | same | `status===422` | OK | S2 | — |
| 52 | service.test.ts | `validatePasswordChange` × 4 cases | E4 | `ChangePasswordRequest` requires password+confirm (openapi.yaml:611-621) | pure-function pair validation | SPEC-SILENT | S3 | Internal helper, not itself an HTTP surface |
| 53 | service.test.ts | `passwordChange` › writes new password, hashed, works at login | E4 | 200 on success | bcrypt hash + login round-trip | OK | S2 | — |
| 54 | service.test.ts | `passwordChange` › leaves password untouched on rejected pair | E4 | 422 on mismatch | `status===422`, old password still works | OK | S2 | — |
| 55 | service.test.ts | `tokenAdd` × 5 cases (appends; 32-hex entropy; concurrent-safe; distinct; conditional expiry) | — | one-time tokens implied by "one-time token" language (E13,E14,E17,E18) but internal shape isn't Tier A | token shape/array-append semantics | SPEC-SILENT | S1 | Entropy/atomicity matter a great deal but aren't contract facts |
| 56 | service.test.ts | `tokenRemoveAll` × 6 cases (removes type; reports under shared event name; leaves other types; 404 unknown user; 422 malformed id; concurrency-safe) | E20 | `POST /account/logout-all` declares only 200/401/500 (openapi.yaml:396-407) — no 404/422 | service-level `status` 404/422 in 2 of the 6 cases | SPEC-SILENT | S2 | The service function itself isn't bound by the HTTP contract, and (per `postLogoutEverywhere.ts:19-28`) the controller never surfaces `result.status` at all — it always answers 200 regardless, so these codes never reach the wire; not a live MISMATCH because nothing propagates them |
| 57 | service-flows.test.ts | `signup` × 5 cases (success; mismatch; 409; 422 email; 422 password) | E16 | as above | statuses 200-equivalent success flag /409/422 | OK | S2 | Same as #41-45, ordinary-path version |
| 58 | service-flows.test.ts | `login` × 4 cases (success; 401 wrong pw; 401 unknown; 401 soft-deleted) | E15 | 401 declared | `status===401` | OK (existence of 401) / SPEC-SILENT (soft-delete specifics) | S1/S2 | — |
| 59 | service-flows.test.ts | `tokenAdd` × 3 cases | — | as #55 | 32-char token, persisted, expiry set | SPEC-SILENT | S1 | — |
| 60 | service-flows.test.ts | `passwordChange` × 4 cases (changes; mismatch 422; too-short 422; new password usable) | E4 | 422/200 per ChangePasswordRequest | as described | OK | S2 | — |
| 61 | service-flows.test.ts | `refreshAccessToken` × 4 cases (returns token+audits success; invalid_token audit; revoked→invalid_token audit; missing→missing_token audit) | E19 | 401 on invalid/missing refresh (openapi.yaml:379-394) | rejects + `metadata.reason` split into two buckets, all surfacing as one rejection type | SPEC-SILENT | S1 | Tier A says 401 for a bad refresh but never distinguishes "missing" vs "invalid" — that's this file's own invention for audit granularity, not a contract fact. **Note (not a test row):** the controller (`get-refresh-token.ts:37-40`) converts EVERY rejection from this function — including a hypothetical DB failure inside `verifyRefreshToken`'s lookup — into a flat 401, never the 500 the endpoint's own contract declares as available; no test in this batch exercises that DB-failure path, so it is not scored as a finding, only flagged here for visibility |
| 62 | self-service.test.ts | `updateProfile` › updates fields the user owns | E2 | email/username/locale/imageUrl/phone/website are the writable set | round-trip on username+locale, email untouched when absent | OK | S2 | — |
| 63 | self-service.test.ts | `updateProfile` › rejects invalid email 422 | E2 | 422 declared | `status===422` | OK | S2 | — |
| 64 | self-service.test.ts | `updateProfile` › 404 for account that no longer exists | E2 | `PUT /account` declares 200/401/409/422/500 only — no 404 | `status===404` | **MISMATCH-CODE** | **S2** | See "Headline finding" above — undeclared status code, test cements it |
| 65 | self-service.test.ts | `updateProfile` › cannot escalate admin/active/password | E2 | explicitly "Role, account state and password are out of scope" (openapi.yaml:27) | admin/active/password unchanged after attempted injection | OK | S1 | Direct, correct test of a privilege-escalation guard the spec explicitly calls out |
| 66 | self-service.test.ts | `updateProfile` › unverifies on email change | E2 | "Changing the email resets `verified`" (openapi.yaml:27) | `verified===false` after change | OK | S2 | — |
| 67 | self-service.test.ts | `updateProfile` › keeps verification when email restated unchanged | E2 | implied corollary ("changing" implies an actual change) | `verified===true` unchanged | OK | S2 | Reasonable direct reading of the spec's "changing the email" wording |
| 68 | self-service.test.ts | `updateProfile` › 409 when email belongs to someone else | E2 | 409 Conflict declared | `status===409` | OK | S2 | — |
| 69 | self-service.test.ts | `passwordChangeWithCurrent` › changes password, old one dead | E4 | 200 on success | login with new works, old fails | OK | S1 | — |
| 70 | self-service.test.ts | `passwordChangeWithCurrent` › wrong current password 422 not 401 | E4 | explicit spec callout (openapi.yaml:81-84) | `status===422`, nothing changed | OK | S1 | This is the single most directly-quoted expectation in the whole module — matches exactly |
| 71 | self-service.test.ts | `passwordChangeWithCurrent` › validates new pair before bcrypt compare | E4 | not itself stated (ordering/perf detail) | 422, old password still works | SPEC-SILENT | S2 | — |
| 72 | self-service.test.ts | `sessionRemove` × 3 cases (revokes named; ignores other token kinds; can't cross users) | E7 | 404 for someone-else's/invented session id (openapi.yaml:134-135) | `modifiedCount` 0 or 1 at repository level | OK | S1 | Directly the mechanism behind E7's no-enumeration guarantee |
| 73 | self-service.test.ts | `sessionRevoke` × 2 cases (audits a real match; does not audit a no-op) | — | not in Tier A | audit emitted only when `modifiedCount>0` | SPEC-SILENT | S3 | — |
| 74 | self-service.test.ts | `tokenRemoveByValue` × 2 cases | — | not in Tier A (internal to logout) | removes one, leaves siblings; no-op on unknown value | SPEC-SILENT | S2 | — |
| 75 | self-service.test.ts | `logoutCurrentSession` × 2 cases (revokes+records; records even with no cookie) | E5 | "Answers 200 whether or not a live session was found" (openapi.yaml:91) | resolves and audits either way | OK | S1 | Directly the mechanism behind E5 |
| 76 | self-service.test.ts | `sendVerificationEmail` × 2 cases (replaces earlier token; leaves other kinds alone) | — | not in Tier A (token internals) | exactly one live verify token, newest wins | SPEC-SILENT | S2 | — |
| 77 | self-service.test.ts | `requestEmailVerification` › sends mail, audits re-send | E12 | re-sends verification token (openapi.yaml:240-253) | token stored + audit event | OK | S2 | — |
| 78 | self-service.test.ts | `completeEmailVerification` › marks verified, audits | E13 | valid token → email marked verified (openapi.yaml:255-271) | `verified===true` persisted | OK | S2 | — |
| 79 | self-service.test.ts | `getOwnProfile` › returns profile, reports a view | E1 | 200 UserEnvelope (openapi.yaml:8-23) | email round-trip + analytics emit | OK (profile return) / SPEC-SILENT (analytics) | S2 | — |
| 80 | self-service.test.ts | `removeOwnAccount` › hard-deletes, reports it | E14 | valid deletion token → account permanently removed (openapi.yaml:273-289) | row gone, audit+analytics fired | OK | S1 | — |
| 81 | self-service.test.ts | `passwordResetChange` › changes password, audits distinct completion | E18 | 200 on valid reset token (openapi.yaml:361-377) | login with new password works | OK | S2 | — |
| 82 | self-service.test.ts | `passwordResetChange` › does not audit rejected pair | E18 | 422 on mismatch | `status===422`, no audit | OK (422 half) / SPEC-SILENT (audit half) | S2 | — |
| 83 | self-service.test.ts | `requestAccountDeletion` › issues token, audits request | E3 | one-time confirmation token sent (openapi.yaml:52-62) | exactly one `delete`-type token stored | OK | S1 | — |
| 84 | self-service.test.ts | `findLiveToken` × 5 cases (finds live; refuses wrong type; refuses expired; keeps no-expiry as eternal; refuses invented) | E13,E14,E17,E18 | "one-time token" language across 4 endpoints | type+expiry gated lookup | SPEC-SILENT | S2 | Internal shape of "live" isn't itself a Tier A statement, though it's what makes the "one-time" language true |
| 85 | self-service.test.ts | `spendLiveToken` × 2 cases (true once, false thereafter; spent token unfindable) | — | not in Tier A (race resolution mechanics) | atomic single-winner spend | SPEC-SILENT | S1 | Prevents a real double-spend of a one-time token, but Tier A never describes the race explicitly |
| 86 | addresses.test.ts | one-default-invariant × 5 cases (first entry default; later claims by asking + demotes; add-with-default demotes same write; update default:false leaves alone; remove promotes oldest) | E8,E9,E10,E11 | exactly one default whenever non-empty; first auto-default; later only via `default:true`; `false`/absent no-ops; removal promotes oldest | direct repository behavior matches each clause | OK | S1 | Precise, direct match to E8-E11's wording, clause by clause |
| 87 | addresses.test.ts | ownership › someone else's entry 404s like an invented one | E10 | "someone else's entry answers the same 404 as an invented one" (openapi.yaml:209-211) | both update and remove 404 for a stranger's real id; owner's data untouched | OK | S1 | Exact match, including the "untouched" side-effect check |
| 88 | addresses.test.ts | checkout × 5 cases (default snapshot; named-over-default; stale id 404 untouched; foreign real id treated as not-found; empty book not an obstacle) | — | out of this batch's Tier A (cart/orders module, not account's openapi.yaml) | `cartService.orderConfirm` behavior | SPEC-SILENT | S1 | Correctly implemented and important, but belongs to a different module's contract, not this batch's Tier A |
| 89 | persisted-locale.test.ts | captured from request's locale at signup | — | not in Tier A (Accept-Language selects response copy per root.yaml's info.description, not `User.locale` persistence) | `locale==='it'` after `runWithLocale('it', signup)` | SPEC-SILENT | S3 | — |
| 90 | persisted-locale.test.ts | falls back to boot locale outside a request | — | same | `locale===getDefaultLocale()` | SPEC-SILENT | S3 | — |
| 91 | persisted-locale.test.ts | editable afterwards via `userService.updateById` | — | `User.locale` exists and is a `Locale` (root.yaml:411-412); `PUT /account` accepts `locale` (openapi.yaml:581-582) | update round-trip | OK | S2 | Locale being writable via account update is exactly what E2/UpdateAccountRequest states |
| 92 | persisted-locale.test.ts | left alone by an update that doesn't mention it | E10-style "absent means leave it alone" pattern, generalized | `UpdateAccountRequest` fields all optional, absence = no-op (implied by E2's narrower field set and E10's explicit statement for addresses) | `locale` survives an unrelated update | OK | S3 | Reasonable extension of the "absent field ⇒ untouched" pattern the contract states explicitly for addresses |
| 93 | persisted-locale.test.ts | reaches the client, part of the User contract | E1 | `User.locale` is a real schema field (root.yaml:411-412), returned via `UserEnvelope` | `toJSON().locale==='it'` | OK | S2 | Directly checks a declared field is actually serialized |
| 94 | delete-account.test.ts | `deleteAccountRequest` › sends email, 200 when user exists | E3 | 200 on request (openapi.yaml:52-62) | mocked service call + 200 | OK | S2 | — |
| 95 | delete-account.test.ts | `deleteAccountRequest` › 200 silently when user not found | E3 | responses declared 200/401/500 only — no 404 | still 200, no leak | OK | S1 | Correctly stays inside the declared response set, unlike the PUT /account case — this is the RIGHT way to handle the analogous edge case |
| 96 | delete-account.test.ts | `deleteAccountRequest` › 500 when service throws | E3 | 500 declared | `rejectResponse(res,500,[])` | OK | S2 | — |
| 97 | delete-account.test.ts | `deleteAccountConfirm` › deletes, 200 for valid token | E14 | 200 on valid token (openapi.yaml:273-289) | mocked chain, 200 | OK | S2 | — |
| 98 | delete-account.test.ts | `deleteAccountConfirm` › 422 when token already spent concurrently | E14 | 422 declared | `rejectResponse(res,422,...)` | OK | S2 | — |
| 99 | delete-account.test.ts | `deleteAccountConfirm` › 422 when token not live | E14 | same | same | OK | S2 | — |
| 100 | delete-account.test.ts | `deleteAccountConfirm` › 500 when service throws | E14 | 500 declared | `rejectResponse(res,500,[])` | OK | S2 | — |
| 101 | emails.test.ts | `it.each` LINK_EMAILS × template name (4 cases) | — | not in Tier A (email content is entirely outside the OpenAPI/RFC surface) | template string per builder | SPEC-SILENT | S3 | — |
| 102 | emails.test.ts | `it.each` CONFIRM_EMAILS × template name (2 cases) | — | same | same | SPEC-SILENT | S3 | — |
| 103 | emails.test.ts | every email gets a distinct template | — | same | `Set` size equals count | SPEC-SILENT | S3 | — |
| 104 | emails.test.ts | `it.each` link paths (4 cases) | — | same | `linkUrl` shape per route | SPEC-SILENT | S3 | — |
| 105 | emails.test.ts | each token routed to its own flow, never another's | — | same (though it echoes the same-kind-of-invariant `findLiveToken`'s type-check enforces server-side) | 3 distinct link URLs, correct path segment each | SPEC-SILENT | S2 | Reinforces a real security property (token/flow binding) but the email builder itself carries no Tier A obligation |
| 106 | emails.test.ts | joins base URL without doubling separator | — | not in Tier A | string join correctness | SPEC-SILENT | S3 | — |
| 107 | emails.test.ts | usable path with no base URL configured | — | same | `?? ''` fallback | SPEC-SILENT | S3 | — |
| 108 | emails.test.ts | `it.each` LINK_EMAILS copy resolves to real strings (4 cases) | — | same | non-empty, non-key-echo values | SPEC-SILENT | S3 | — |
| 109 | emails.test.ts | `it.each` CONFIRM_EMAILS copy resolves to real strings (2 cases) | — | same | same | SPEC-SILENT | S3 | — |
| 110 | emails.test.ts | interpolates recipient's name | — | same | greeting contains `NAME` | SPEC-SILENT | S3 | — |
| 111 | emails.test.ts | carries locale through, translates by it | — | `Locale` schema exists (root.yaml:207-213) but email localization mechanics aren't Tier A | `data.locale` matches, subject differs by locale | SPEC-SILENT | S3 | — |
| 112 | emails.test.ts | empty meta-links list, not missing | — | not in Tier A | `pageMetaLinks===[]` | SPEC-SILENT | S3 | — |
| 113 | emails.test.ts | shares one footer across every email | — | same | `Set` size 1 | SPEC-SILENT | S3 | — |
| 114 | audit.test.ts | spells every action exactly as log tooling expects | — | not in Tier A (audit vocabulary is an internal/observability concern, not the account OpenAPI contract) | literal object match | SPEC-SILENT | S3 | — |
| 115 | audit.test.ts | keeps `auth.` prefix the folder name doesn't control | — | same | `startsWith('auth.')` for every value | SPEC-SILENT | S3 | — |
| 116 | audit.test.ts | registers actions in the app-wide union | — | same | type-level assertion | SPEC-SILENT | S3 | — |
| 117 | fixtures.test.ts | stores owner as real ObjectId | — | not in Tier A (test-fixture builder, not API behavior) | `instanceof Types.ObjectId` | SPEC-SILENT | S3 | — |
| 118 | fixtures.test.ts | omits items when none given | — | same | `Object.hasOwn(...,'items')===false` | SPEC-SILENT | S3 | — |
| 119 | fixtures.test.ts | gives every entry its own ObjectId | — | `Address.id` is a real field (openapi.yaml:690-693) but the FIXTURE's construction isn't Tier A | `_id instanceof ObjectId` | SPEC-SILENT | S3 | — |
| 120 | fixtures.test.ts | passes deliverable fields through unchanged | — | not in Tier A | `toMatchObject` | SPEC-SILENT | S3 | — |
| 121 | fixtures.test.ts | omits label/phone when not given | — | `label`/`phone` optional on `Address` (openapi.yaml:694-708) | `Object.hasOwn===false` | SPEC-SILENT | S3 | Fixture-only; the schema's optionality is Tier A but this test is about the test-data builder, not the API |
| 122 | fixtures.test.ts | keeps label/phone when given | — | same | round-trip | SPEC-SILENT | S3 | — |
| 123 | token-cleanup.test.ts | `runTokenCleanup` › asks repository once | — | not in Tier A (no scheduled-job contract anywhere) | 1 call | SPEC-SILENT | S3 | — |
| 124 | token-cleanup.test.ts | announces start before knowing outcome | — | same | log message content | SPEC-SILENT | S3 | — |
| 125 | token-cleanup.test.ts | success branch × 2 (logs completion; logs nothing at error) | — | same | log-level assertions | SPEC-SILENT | S3 | — |
| 126 | token-cleanup.test.ts | failure branch × 4 (error-level; carries cause; never throws; no false "completed") | — | same, though "never throws" underlies `runTokenCleanup` being safe to call as a pre-flight step on login/refresh (not itself Tier A) | log content + `resolves.toBeUndefined()` | SPEC-SILENT | S2 | The "must not fail the triggering request" property matters but isn't stated by the OpenAPI/RFC surface |
| 127 | token-cleanup.test.ts | `it.each` mutually-exclusive log paths (2 cases) | — | same | exactly one of completed/failed logged | SPEC-SILENT | S3 | — |
| 128 | token-cleanup.test.ts | `adminTokenCleanup` › audits successful cleanup | E21 | 200 Success on the sweep (openapi.yaml:409-421) | `success:true`, audit fired | OK (success path) / SPEC-SILENT (audit + `data.removed` shape, which the controller strips before the wire per `Success`'s `MessageResponse` schema having no `data`) | S2 | — |
| 129 | token-cleanup.test.ts | `adminTokenCleanup` › does not audit failed cleanup, 500 | E21 | 500 declared | `success:false, status:500` | OK | S2 | — |
| 130 | token-cleanup-job.test.ts | cleanup runs before login authentication | — | not in Tier A (ordering of internal housekeeping vs credential check) | `invocationCallOrder` comparison | SPEC-SILENT | S2 | — |
| 131 | token-cleanup-job.test.ts | cleanup runs before refresh access-token creation | — | same | same | SPEC-SILENT | S2 | — |
| 132 | token-cleanup-job.test.ts | cleanup skipped when refresh cookie is missing | — | same | `runTokenCleanup` not called | SPEC-SILENT | S3 | — |
| 133 | auth-hardening.test.ts | rejects further attempts with 429 once budget spent | E33 | Tier A states nothing about rate limiting for this batch | 429 after 3 failed attempts | SPEC-SILENT | S2 | Matches E33's blind prediction exactly |
| 134 | auth-hardening.test.ts | does not spend budget on successful attempts | E33 | same | all 200s | SPEC-SILENT | S3 | — |
| 135 | auth-hardening.test.ts | budgets one account separately from another at same address | E33 | same | two-bucket key test | SPEC-SILENT | S2 | — |
| 136 | auth-hardening.test.ts | rate limiter mounted on the real login route | E33 | same | `ratelimit` response header present | SPEC-SILENT | S3 | — |
| 137 | auth-hardening.test.ts | 500 handler tells client nothing about what threw | — | `ErrorItem.code`/`message` exist generically (root.yaml:306-323); redaction itself isn't Tier A | secret string absent from body, `code==='INTERNAL_ERROR'` | SPEC-SILENT | S1 | Redaction is a real, important security property but not something any Tier A source in this batch states |
| 138 | auth-hardening.test.ts | 500 handler still returns a deliberate error's own copy | — | `ErrorItem.message` is a string field (root.yaml:315-318) | custom message survives, 422 status | OK (shape) / SPEC-SILENT (redaction policy) | S2 | — |
| 139 | observability-auth.test.ts | `/observability/events` refuses no session cookie | E32 | "Protected endpoints require admin role" (root.yaml:42-43) implies authentication is a prerequisite | 401 | OK | S1 | Authentication-before-role-check is the necessary first half of E32 |
| 140 | observability-auth.test.ts | `/observability/events` refuses signed-in non-admin | E32 | same, directly | 403 | OK | S1 | Exact match: the endpoint enforces the admin-role split the root bundle's tag description states |
| 141 | observability-auth.test.ts | `/observability/events` refuses forged cookie | E32 | same | 401 | OK | S1 | — |
| 142 | observability-auth.test.ts | `/observability/events` refuses revoked-but-validly-signed token | E7 (revocation-via-DB pattern) | consistent with the refresh-token revocation model this module defines | 401 after clearing `tokens` | OK | S1 | Reuses exactly the DB-backed revocation check this batch's account module defines; the endpoint's own contract (observability's openapi.yaml) is out of this batch's Tier A, but the revocation MECHANISM is |
| 143 | observability-auth.test.ts | `/observability/metrics` accepts configured scrape token | — | not in Tier A (separate static-bearer-token mechanism, unrelated to `bearerAuth`/JWT) | 200 with matching bearer | SPEC-SILENT | S2 | — |
| 144 | observability-auth.test.ts | `it.each` `/observability/metrics` refuses bad/missing/malformed tokens (4 cases) | — | same | 401 | SPEC-SILENT | S2 | — |
| 145 | observability-auth.test.ts | `/observability/metrics` refuses everything when no token configured (deny-by-default) | — | same | 503 | SPEC-SILENT | S2 | — |

## Summary by verdict

- OK: ~55 rows (mostly: route auth/security-scheme matches, address default-invariant/ownership,
  password-change 422-not-401, signup/login status codes, delete-confirm 422/500 handling,
  session-revocation-via-DB properties, observability admin-role split).
- SPEC-SILENT: the large majority — config plumbing, logging, rate limiting, caching, email copy,
  audit vocabulary, fixture builders, and several real security properties (anti-enumeration on
  login, token entropy/atomicity, cookie SameSite/Secure policy) that this batch's Tier A (module
  openapi.yaml + RFC 6265/7519) simply never states, even though they're correctly implemented.
- MISMATCH-CODE: 1 (row 64 / headline finding) — undeclared `404` on `PUT /account`, cemented by a
  test written one layer below the HTTP boundary.
- No MISMATCH-TEST, MISMATCH-SPEC, or TAUTOLOGY rows found in this batch.

No S1 MISMATCH-CODE findings. The one MISMATCH-CODE finding (row 64) is S2 (wrong/undeclared status
code, not a permission or data-exposure defect — the 404 only fires on a legitimate owner's own
already-authenticated request against a since-deleted account, not for a different caller).
