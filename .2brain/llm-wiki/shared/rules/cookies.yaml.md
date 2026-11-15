---
source: shared/rules/cookies.yaml
sha256: 409779dfae82901fa9fb4b3fad7a79fa9a860c050b7ae39792e1f90ca13036d9
generated_at: 2026-11-14T17:45:40.134232+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/cookies.yaml

## Purpose

Single registry of every cookie the backend sets. It exists so that the code that writes each cookie, the log-scrubbing pipeline, and the documentation all agree on the same name, secrecy flag, and lifetime from one place. The paired frontend's `browser-storage.yaml` mirrors this format for client-side storage.

## Key elements

- **`cookies`** — the top-level map. Keys are camelCase identifiers that double as the frontend's i18n translation keys for the purpose text.
- **`session`** — the credential cookie (`__Host-session`). Carries the refresh token in `jwt` mode or the session id in `cookie` mode. `secret: true`, `lifetime: sessionTier`.
- **`isAuth`** — non-secret signed-in flag set beside `session`; frontend reads/clears it, no credential value.
- **`device`** — up to five HMAC tokens bound to account emails (`__Host-device`); 180-day `maxAgeMs`, renewed on each login.
- **`oauthState` / `oauthVerifier` / `oauthContinue` / `oauthLocale` / `oauthLink`** — the five cookies for a sign-in-with-provider attempt. `secret` ones are 5-minute `maxAgeMs`; `oauthContinue` and `oauthLocale` are intentionally non-secret.
- **`oauthMfaChallenge` / `oauthDeletionChallenge`** — carry the second-factor or restore-pending-deletion challenge across a redirect; `lifetime: challenge` (duration read from the challenge itself, not this file).
- **Per-entry fields** — `name`, `setter`, `kind`, `purpose`, `necessity`, `secret`, and either `lifetime` (named tier) or `maxAgeMs` (explicit milliseconds).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — the `session` entry's `name` value must match the `cookieAuth.name` field defined in that contract file; a cross-cutting test asserts the two are equal, so renaming one without the other will fail CI.

## Notes

- **Log redaction rule:** the effective redaction set is `log-redaction.yaml` **UNION** every cookie here marked `secret: true`. The twin (frontend `browser-storage.yaml`) must apply the same union to its own entries.
- **`__Host-` prefix:** all backend cookie names use the `__Host-` secure prefix (enforces `Secure` + `HostOnly` + no `Domain` attribute). The `isAuth` cookie is the one exception.
- **`lifetime` vs `maxAgeMs`:** `lifetime` is a named tier resolved elsewhere (e.g. `sessionTier`, `challenge`); `maxAgeMs` is a literal millisecond value. Don't confuse the two.
- **Key = i18n key:** the map key (e.g. `oauthState`) is what the frontend uses to look up a human-readable purpose string; renaming it is a breaking i18n change.
- Referenced by `docs/theory/data-protection.md` as the canonical cookie inventory.
