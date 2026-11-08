---
source: shared/rules/cookies.yaml
sha256: f59594058df97f2df3f2543a6adef68ce185d1da24d586fb73fac49e1c1a23ff
generated_at: 2026-11-08T03:08:55.156596+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/cookies.yaml

## Purpose

Single source of truth for every cookie the backend sets. It is consumed by the cookie-setting code (names, lifetimes), the log scrubber (the `secret: true` set), and the GDPR cookie table in `docs/theory/data-protection.md`. The frontend mirrors this format in its own `browser-storage.yaml` for client-side storage.

## Key elements

- **`cookies` map** — keyed by camelCase id (also the frontend's translation key for the purpose text). Each row carries: `name` (wire name), `setter`, `kind`, `purpose`, `necessity`, `secret` (drives log redaction), and either `lifetime` (named tier) or `maxAgeMs` (fixed duration).
- **`session`** (`__Host-session`) — the credential cookie; holds the refresh token in `jwt` mode or the session id in `cookie` mode. Its `name` must equal the contract's `cookieAuth.name` (enforced by a cross-cutting test).
- **`isAuth`** — non-secret signed-in flag; frontend reads and clears it at sign-out.
- **`device`** (`__Host-device`) — up to five HMAC tokens (one per account), 180 days, renewed on every login; bounds brute-force attempts.
- **`oauthState` / `oauthVerifier` / `oauthContinue` / `oauthLocale` / `oauthLink`** — the five cookies that share a 5-minute (`maxAgeMs: 300000`) lifetime during a provider sign-in attempt.
- **`oauthMfaChallenge` / `oauthDeletionChallenge`** — carry login / claim-check challenges across redirects; lifetime is `challenge` (read from the challenge itself, not this file).
- **`secret: true` set** — the union of these names with `log-redaction.yaml` is what the scrubber redacts. The frontend twin must apply the same rule.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — the OpenAPI contract declares `cookieAuth.name`; a cross-cutting test asserts it equals the `name` field of the `session` entry here. Changing one without the other breaks the test.

## Notes

- `lifetime` is a named tier (`sessionTier`, `challenge`); `maxAgeMs` is a fixed millisecond value. Both are valid; the field that appears determines how the setter resolves the expiry.
- The map key (e.g. `oauthState`) is *not* the wire cookie name (`__Host-oauth_state`); don't confuse the two.
- All cookies use the `__Host-` prefix (host-bound, no `Domain` attribute) except `isAuth`, which is intentionally plain.
- Log redaction is the **union** of `log-redaction.yaml` entries and every `secret: true` name here; the frontend twin must mirror this.
