---
source: src/modules/antibot/openapi.yaml
sha256: a35da89a55e9db92b3dc893377082147d822b64d5e157e7bdf3d95843bc9f379
generated_at: 2026-10-15T10:19:54.965623+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the antibot module — the "rung 3" human-challenge step in the anti-automation ladder. It declares the two public, unauthenticated endpoints clients call to discover the active challenge provider and (for self-hosted providers) fetch a work unit to solve.

## Key elements

- **`GET /antibot/config`** (`getAntibotConfig`) — Returns the active provider name, its public render parameters, and a `rungs` snapshot of every anti-automation tier. Always 200; the `none` provider is a valid state (empty parameters, no widget).
- **`GET /antibot/challenge`** (`getAntibotChallenge`) — Returns an ALTCHA challenge (parameters + HMAC signature) only when the deployment is self-hosted. 404 is a truthful "not applicable" for `none` or vendor-hosted providers.
- **`x-error-codes`** extension — Declares `ANTIBOT_NO_CHALLENGE` (404) and `ANTIBOT_VERIFICATION_FAILED` (401) as module-level error identifiers.
- **`AntibotConfig` / `AntibotRungs`** schemas — Describe the provider name, public parameter map, and the status of rung 1 (identity budgets, always `true`) and rung 2 (email policy: `off` / `disposable` / `mx`).
- **`AntibotChallenge` / `AntibotChallengeParameters`** schemas — The ALTCHA-specific work unit (algorithm, nonce, salt, cost, keyLength, keyPrefix, etc.) plus an `expiresAt` unix timestamp.
- **Envelope schemas** (`AntibotConfigEnvelope`, `AntibotChallengeEnvelope`) — Wrap payload in the shared `{ success, status, message, data }` shape.

## Relationships

All shared types are imported from **`shared/contracts/openapi.root.yaml`**:

- `#/components/responses/InternalError` — referenced by both paths' 500 response.
- `#/components/responses/NotFound` — referenced by `/antibot/challenge`'s 404 response.
- `#/components/schemas/EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage` — referenced by both envelope schemas for the `success`, `status`, and `message` fields.

## Notes

- Both endpoints set `security: []` deliberately — config must be reachable before a user has any credential (signup has no session yet).
- The 404 on `/antibot/challenge` is **not** an error condition; it signals the active provider isn't self-hosted. Clients should branch on it, not surface it as a failure.
- `AntibotChallenge` is ALTCHA-shaped by design; swapping the self-hosted provider is expected to change this schema. The file's comment calls this "the point of declaring it."
- Every schema sets `additionalProperties: false` (closed objects), so unknown fields in responses are contract violations.
- `rungs.identityBudgets` is typed `boolean` but documented as always `true` — it exists for shape stability, not configurability.
