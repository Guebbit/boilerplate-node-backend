---
source: src/modules/antibot/openapi.yaml
sha256: 5eee4b3349ba604a904b6a76be13608a27f326913ff3954b5a169c254e6f1754
generated_at: 2026-10-29T03:12:08.580191+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the antibot module (rung 3 of the anti-automation ladder). It declares the two public, unauthenticated endpoints that expose the active human-challenge provider's configuration and (for self-hosted providers) a challenge to solve, plus the schemas the API returns.

## Key elements

- **`GET /antibot/config`** (`operationId: getAntibotConfig`) — Always 200. Returns the active provider name, its public render parameters (site key, script URL, etc.), and a `rungs` summary of every other anti-automation rung's status. `security: []` (no auth); `none` provider yields an empty parameter map.
- **`GET /antibot/challenge`** (`operationId: getAntibotChallenge`) — Returns an ALTCHA challenge (parameters + HMAC signature) for self-hosted providers; returns 404 for `none` or vendor-hosted providers (truthful "not applicable" rather than an error).
- **`AntibotConfig`** — `{ provider, parameters, rungs }`. `parameters` is a free-form string map (provider-specific).
- **`AntibotRungs`** — `{ identityBudgets: boolean, emailPolicy: 'off'|'disposable'|'mx' }`. Status snapshot of rungs 1 and 2 alongside rung 3.
- **`AntibotChallenge`** — ALTCHA shape: `{ parameters, signature }`.
- **`AntibotChallengeParameters`** — Solver inputs (algorithm, nonce, salt, cost, keyLength, keyPrefix, optional keySignature, memoryCost, parallelism, expiresAt).
- **`x-error-codes`** — `ANTIBOT_NO_CHALLENGE` (404) and `ANTIBOT_VERIFICATION_FAILED` (403), documented for downstream verification calls (not exercised by the two paths defined here).
- **Tag `Antibot`** — Groups both operations.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — The 404 response on `GET /antibot/challenge` is a `$ref` to `#/components/responses/NotFound` in that shared contract. This is the only cross-file reference in the document.

## Notes

- The file is a **contract only**; it contains no implementation logic. The actual route handlers and provider selection live elsewhere in `src/modules/antibot/`.
- `security: []` on both paths is intentional: guarding `/antibot/config` behind a login would break signup (no credential exists yet).
- `AntibotRungs.identityBudgets` is documented as *always* `true` (no off-switch), but the schema still declares it as a boolean for forward compatibility.
- The `x-error-codes` block references errors (403 verification failure) that are **not** surfaced by either path defined in this file; they describe the server-side verification step that happens on form submission elsewhere.
- Adding a second self-hosted provider would require changing the `AntibotChallenge` schema — the spec intentionally pins the shape to ALTCHA rather than leaving it free-form.
