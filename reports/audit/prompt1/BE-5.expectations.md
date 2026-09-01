# BE-5 expectations — Account & auth: tokens, sessions, cookies, JWT

Frozen blind from Tier A only: `src/modules/account/openapi.yaml`,
`shared/contracts/openapi.root.yaml` (schemas/responses referenced by the module fragment),
RFC 6265 (cookies), RFC 7519 (JWT). No file under `src/` implementation or any test file was
opened before this file was written and committed.

## Endpoint-level expectations

E1. `GET /account` (openapi.yaml:8-23) requires `bearerAuth`; 200 returns `UserEnvelope`; 401 if
unauthenticated.

E2. `PUT /account` / `updateAccount` (openapi.yaml:24-51, 568-609) requires `bearerAuth`; body is
`UpdateAccountRequest`/`...Multipart` — only `email`, `username`, `locale`, `imageUrl`/`imageUpload`,
`phone`, `website`. Explicitly OUT of scope: role, account state (`active`), password
(openapi.yaml:27). Changing `email` resets `verified` to false and sends a fresh verification email
to the NEW address (openapi.yaml:27). 409 if the new email is already held by another account
(openapi.yaml:48-49). 422 on validation failure.

E3. `DELETE /account` / `requestAccountDelete` (openapi.yaml:52-62) requires `bearerAuth`; sends a
one-time confirmation token to the user's email; deletion completes only via
`DELETE /account/delete-confirm`. 200/401/500 only — no synchronous deletion here.

E4. `POST /account/password` / `changePassword` (openapi.yaml:64-85, 611-621) requires
`bearerAuth`; body `ChangePasswordRequest` requires `currentPassword`, `password`,
`passwordConfirm`. A WRONG current password is 422, explicitly NOT 401 (openapi.yaml:81-84 comment:
a 401 here would read as "your token expired" and log the user out of a valid session). Changing
the password does NOT revoke other live sessions (openapi.yaml:68) — only
`POST /account/logout-all` or `DELETE /account/sessions/{sessionId}` do that.

E5. `POST /account/logout` (openapi.yaml:87-96) has `security: []` — no auth required. Revokes the
refresh token carried by the `jwt` cookie and clears auth cookies (openapi.yaml:91). Answers 200
"whether or not a live session was found" (openapi.yaml:91) — i.e. calling it with no session /
invalid cookie is still 200, not 401/404. Response set is 200/500 only — no 401 is even declared.

E6. `GET /account/sessions` / `getSessions` (openapi.yaml:98-114, 632-667) requires `bearerAuth`.
Returns `SessionsEnvelope.data.sessions[]`, each a `Session{id, expiration?, lastUsedAt?, current}`.
- `id`/`expiration`/`lastUsedAt` never expose the token value itself (openapi.yaml:632-634 comment):
  only an opaque handle plus timestamps.
- `expiration` is ABSENT on a token issued without an expiry tier (openapi.yaml:642-645).
- `lastUsedAt` is ABSENT until that session has made a request (openapi.yaml:646-651).
- `current` is true only for the session matched via the caller's own refresh cookie; it is ALWAYS
  `false` for a caller authenticating by bearer token alone, because an access token does not
  identify a session (openapi.yaml:652-657).

E7. `DELETE /account/sessions/{sessionId}` / `revokeSession` (openapi.yaml:116-137) requires
`bearerAuth`; `sessionId` is a path param of schema `Id` (opaque string, root.yaml:194-196).
Revoking the CURRENT session is allowed and equivalent to `POST /account/logout`, except cookies of
OTHER clients cannot be cleared from here (openapi.yaml:120). 404 when `sessionId` is well-formed
but matches none of the CALLER's own live sessions — i.e. revoking someone else's session id must
answer the same 404 as revoking an invented one, not e.g. 403 or a different code that would leak
existence (openapi.yaml:134-135 comment).

E8. `GET /account/addresses` (openapi.yaml:139-155): whenever the address book is non-empty,
EXACTLY ONE entry carries `default: true` (openapi.yaml:143).

E9. `POST /account/addresses` / `addAddress` (openapi.yaml:156-178, 712-741): body `AddressInput`
requires `fullName`, `street`, `city`, `zip`, `country` (each `minLength: 1`); `label`, `phone`,
`default` optional. The FIRST entry becomes default automatically (no `default` field needed); a
LATER entry claims the default slot ONLY by sending `default: true`, which demotes the previous
holder (openapi.yaml:159). Success is 200 (not 201) returning the full `AddressesEnvelope`
(openapi.yaml:169-175) — contrast with signup's 201.

E10. `PUT /account/addresses/{addressId}` / `updateAddress` (openapi.yaml:180-213, 743-767): body
`UpdateAddressRequest` has NO `required` array — every field, including sending `{}`, is a valid
request. `default: true` claims the slot and demotes the previous holder; `default: false` AND an
absent `default` both leave the current assignment untouched (openapi.yaml:184) — demoting without
naming a successor is disallowed by omission, not by validation error. 404 when `addressId` is
well-formed but names an address that isn't the CALLER's own — someone else's real address id
answers the identical 404 as an invented one (openapi.yaml:209-211 comment) — no enumeration signal.

E11. `DELETE /account/addresses/{addressId}` / `removeAddress` (openapi.yaml:214-238): removing the
default entry PROMOTES THE OLDEST remaining entry, so a non-empty book always has exactly one
default afterward (openapi.yaml:217).

E12. `POST /account/verify-request` (openapi.yaml:240-253) requires `bearerAuth`; sends a one-time
token to the authenticated user's OWN email. 409 if the account is ALREADY verified (openapi.yaml:
251-252) — there is nothing to send.

E13. `POST /account/verify-confirm` (openapi.yaml:255-271, 623-630) has `security: []`; body
requires `token` (NOT a JWT, openapi.yaml:630); on a valid token marks the account's email verified.
200/422/500 only.

E14. `DELETE /account/delete-confirm` (openapi.yaml:273-289, 559-566) has `security: []`; body
requires `token` (NOT a JWT, openapi.yaml:566); on a valid token PERMANENTLY removes the account.
200/422/500 only.

E15. `POST /account/login` (openapi.yaml:291-313, 454-499): `security: []`. Body `LoginRequest`
requires `email`, `password`; optional `remember` enum `[short, medium, long]` sizes how long the
refresh cookie outlives the browser tab — each tier "sized by the deployment" (exact durations are
NOT specified in Tier A). Omitted `remember` ⇒ the refresh cookie lives only as long as an access
token, i.e. a session cookie, not a persistent one (openapi.yaml:496-499). Success 200 returns
`AuthTokensEnvelope.data` = `AuthTokens{token (required), refreshToken?, expiresIn?}`
(openapi.yaml:454-467) — `additionalProperties: false`, so NO embedded user/account object is
permitted in this response; a client must call `GET /account` separately for profile data. 401 on
bad credentials, 422 on validation failure.

E16. `POST /account/signup` (openapi.yaml:315-341, 501-537): `security: []`. Body `SignupRequest`
requires `email`, `username` (`minLength: 3`), `password`, `passwordConfirm`; optional `imageUrl`.
Success is 201 (Created), returning `UserEnvelope` (openapi.yaml:331-337) — contrast with login's
200. 409 if the email is already registered (openapi.yaml:338-339).

E17. `POST /account/reset` / `requestPasswordReset` (openapi.yaml:343-359, 538-544): `security: []`;
body requires only `email`. Declared responses are 200/422/500 ONLY — no 401 and no 404 are declared
for an email that doesn't exist; the contract does not authorize a status code that would reveal
whether the address is registered.

E18. `POST /account/reset-confirm` / `confirmPasswordReset` (openapi.yaml:361-377, 546-557):
`security: []`; body requires `token` (NOT a JWT, openapi.yaml:553), `password`, `passwordConfirm`.
On a valid token, updates the password to the supplied value. 200/422/500 only.

E19. `GET /account/refresh` / `refreshToken` (openapi.yaml:379-394, 469-482): `security: []`.
Creates a new short-lived access token FROM the refresh token carried in the `jwt` cookie. The
cookie is `HttpOnly`, so the token is "never readable by page scripts and never appears in a URL, a
proxy log or a Referer header" (openapi.yaml:383) — this is the contract's own restatement of RFC
6265 §4.1.2.6 (below). Success 200 returns `RefreshTokenEnvelope.data` =
`RefreshTokenResponse{token (required), refreshToken?, expiresIn?}`. 401 if the refresh token is
missing/invalid/expired.

E20. `POST /account/logout-all` (openapi.yaml:396-407) requires `bearerAuth`; removes ALL refresh
tokens for the user from the database and clears auth cookies — every device is logged out, not
just the caller's own current session.

E21. `DELETE /account/tokens/expired` / `deleteExpiredTokens` (openapi.yaml:409-421) requires
`bearerAuth` AND is "Restricted to administrators" (openapi.yaml:413); removes expired tokens
(refresh, password-reset, etc.) from EVERY user record, not just the caller's. Declares a 403
Forbidden response (openapi.yaml:420) distinct from 401 — i.e. an authenticated NON-admin caller
must get 403, not merely succeed or get 401.

## Schema-wide expectations

E22. `User` (root.yaml:382-430) is `additionalProperties: false` and declares no
`password`/`passwordHash`/similar field. No response wrapping `UserEnvelope` (getAccount,
updateAccount, signup) may include a password or password-hash value anywhere in the body.

E23. `AuthTokensEnvelope`/`RefreshTokenEnvelope` (root.yaml-referenced via account
openapi.yaml:426-482) are `additionalProperties: false`; their `data` is exactly
`{token, refreshToken?, expiresIn?}`. Login/refresh responses may not carry any other top-level
field (no embedded user object, no raw session list, etc.).

E24. `Address` (openapi.yaml:683-710) requires `[id, fullName, street, city, zip, country, default]`
— `default` MUST be present (true or false) on every address object returned, never omitted just
because it's false.

E25. `bearerAuth` security scheme declares `bearerFormat: JWT` (root.yaml:52-55). Per RFC 7519 §3,
a JWT is three base64url-encoded segments separated by `.` (header.payload.signature). The `token`
value returned by login/signup/refresh and used as the Bearer credential is expected to have this
shape. By contrast, the reset/verify/delete-confirm one-time tokens are explicitly documented as
NOT a JWT (openapi.yaml:553, 566, 630) and carry no such structural requirement.

## RFC 6265 (cookies) expectations

E26. RFC 6265 §4.1.2.6 (HttpOnly): "the attribute instructs the user agent to omit the cookie when
providing access to cookies via 'non-HTTP' APIs (such as a web browser API that exposes cookies to
scripts)." The `jwt` refresh cookie is documented as `HttpOnly` (openapi.yaml:383) — it must never
be readable via `document.cookie` or an equivalent script-facing API, and the access `token` (which
DOES need to be script-readable to be sent as a Bearer header) must therefore travel in the response
BODY, never solely in an HttpOnly cookie.

E27. RFC 6265 §4.1.2.5 (Secure): "the user agent will include the cookie in an HTTP request only if
the request is transmitted over a secure channel." Tier A (openapi.yaml) does not itself assert the
`jwt` cookie carries `Secure` — this is an RFC-level baseline only; a test asserting `Secure` is
present is not contradicted by Tier A, but nothing in Tier A specifically requires it either.

E28. RFC 6265 §4.1.1 (cookie-octet grammar): a cookie value excludes control characters, whitespace,
quotes, commas, semicolons and backslashes. Any cookie value the server sets (including a raw JWT)
must fit this grammar without percent-encoding surprises.

E29. RFC 6265 does not define `SameSite` at all (confirmed absent from the document). Any
expectation about a `SameSite` attribute on the `jwt` cookie has NO Tier A source in this batch —
neither the RFC nor `openapi.yaml` mentions it.

## RFC 7519 (JWT) expectations

E30. RFC 7519 §4.1.4 ("exp"): "the current date/time MUST be before the expiration date/time listed
in the 'exp' claim," and its value "MUST be a number containing a NumericDate value" (§2: seconds
since 1970-01-01T00:00:00Z UTC). If the access token is a JWT (per E25), server-side validation of
its expiry must reject a token on or after its `exp`, and `exp` must be seconds-based, not
milliseconds.

E31. RFC 7519 §4.1.1/§4.1.2/§4.1.7 (iss/sub/jti): `iss`/`sub` are case-sensitive `StringOrURI`
values; `jti` is a case-sensitive string unique per token. Tier A (openapi.yaml) does not itself
mandate which registered claims the access JWT carries — only `bearerFormat: JWT` is stated
(root.yaml:52-55). Any test asserting a specific claim name/shape beyond "JWT-shaped, has a working
exp" is SPEC-SILENT with respect to this batch's Tier A.

## Cross-cutting / other files in scope

E32. `openapi.root.yaml` Observability tag (root.yaml:42-43): "Protected endpoints require admin
role." Any protected `/observability/*` endpoint touched by `observability-auth.test.ts` must 401 an
unauthenticated caller and 403 (not merely succeed) an authenticated non-admin caller — mirroring
the 401-vs-403 split established explicitly for `deleteExpiredTokens` (E21).

E33. No Tier A source in this batch (module openapi.yaml, root.yaml, the two RFCs) specifies any
rate limiting, lockout, brute-force throttling, or timing-safe comparison behavior for
`/account/login` or any other endpoint. Any assertion in `auth-hardening.test.ts` about rate limits,
lockouts, or throttling is SPEC-SILENT by definition for this batch — there is no Tier A source to
compare it against, only Tier B (docs/CLAUDE.md) if any exists, which is out of scope for this
document per the audit's own tiering.
