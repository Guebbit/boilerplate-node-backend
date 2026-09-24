---
source: src/modules/antibot/openapi.yaml
sha256: 76c34bb40d23f9c9fa1b95e44ebd2c1338cd3037eedade9a27ba0cbbef1ec7ee
generated_at: 2026-09-23T18:22:52.243261+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the antibot module's two public endpoints: reading the active human-challenge configuration and fetching a self-hosted challenge. It is the machine-readable source of truth for what the client must render and submit, and it deliberately exposes no auth on either route so pre-signup flows can still reach the widget.

## Key elements

- **`GET /antibot/config`** (`getAntibotConfig`) — Returns the active provider name, its public render parameters, and a `rungs` summary of every anti-automation rung's current status. Always 200; `none` provider yields an empty parameter map.
- **`GET /antibot/challenge`** (`getAntibotChallenge`) — Returns an ALTCHA work-challenge (parameters + HMAC signature) only when the deployment self-hosts a provider. Returns 404 for `none` or vendor-hosted providers by design.
- **`AntibotConfig`** — `provider`, `parameters` (open string map for widget rendering), `rungs`.
- **`AntibotRungs`** — `identityBudgets` (always `true`, no off-switch) and `emailPolicy` (`off` / `disposable` / `mx`, driven by `NODE_ANTIBOT_EMAIL_POLICY`).
- **`AntibotChallenge`** — ALTCHA-specific: `parameters` (algorithm, nonce, salt, cost, keyLength, keyPrefix, optional keySignature/memoryCost/parallelism/expiresAt) plus a server-side `signature` (HMAC).
- **`AntibotConfigEnvelope` / `AntibotChallengeEnvelope`** — Standard four-field envelopes (`success`, `status`, `message`, `data`) wrapping the payloads above.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Every schema in this file that represents an envelope field (`EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`) or a standard error response (`InternalError`, `NotFound`) is `$ref`'d back to the root contract. This file contributes no shared types; it only *consumes* them.

## Notes

- Both operations declare `security: []` explicitly — this is intentional (the config endpoint must be reachable before a user has any credential).
- The 404 on `/antibot/challenge` is documented as a truthful deployment statement, not a bug; clients should treat it as "no widget to render."
- `AntibotChallenge` is ALTCHA-shaped and the comment notes that a different self-hosted provider would change this schema — it is declared rather than left free-form precisely to surface that coupling.
- `AntibotChallengeParameters` has required fields (`algorithm`, `nonce`, `salt`, `cost`, `keyLength`, `keyPrefix`) and optional ones (`keySignature`, `memoryCost`, `parallelism`, `expiresAt`); the optionality is per-ALTCHA-profile, not a server choice.
