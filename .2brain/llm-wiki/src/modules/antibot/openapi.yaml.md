---
source: src/modules/antibot/openapi.yaml
source_sha256: 1089d120c7ca215852315de48adc91d012ad185600d3eeeb5de51856dea66660
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T04:19:38.896272+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/antibot/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract (v0.1.0) for the `antibot` module. It declares the human-check challenge endpoint, the module's error codes, and the schemas the module owns, including `AntibotConfig`, which `GET /config` publishes.

## Key elements
- **Tag `Antibot`** (`x-family: Core`): the human-check challenge a protected form asks for before it submits.
- **`GET /antibot/challenge`** (`getAntibotChallenge`, no auth via `security: []`):
  - Returns a challenge from a self-hosted provider. Only `altcha` issues one.
  - The default `none` and vendor-hosted providers answer 404. The description treats this as a truthful statement about the deployment, not an error.
  - The challenge shape is the provider's own and is meant to be passed to its widget verbatim.
  - The 200 response is `AntibotChallenge`. The 404 refs a shared `NotFound` response.
- **`x-error-codes`**:
  - `ANTIBOT_NO_CHALLENGE` (404): no challenge is active for the session.
  - `ANTIBOT_VERIFICATION_FAILED` (403): the token is missing, expired, or rejected by the provider.
- **Schemas** (all `additionalProperties: false`):
  - `AntibotConfig`: `provider` (active name, default `none`, meaning send no token), `parameters` (string map the client needs to render the widget, such as a site key or script URL; public), and `rungs`.
  - `AntibotRungs`: a summary of which rungs are active.
    - `identityBudgets` is a boolean, always `true`.
    - `emailPolicy` is one of `off`, `disposable`, `mx`, set by `NODE_ANTIBOT_EMAIL_POLICY`. The default `off` never refuses an address.
  - `AntibotChallenge`: ALTCHA's shape, with `parameters` and an HMAC `signature` proving this server issued them.
  - `AntibotChallengeParameters`:
    - Required: `algorithm`, `nonce`, `salt`, `cost`, `keyLength`, `keyPrefix`.
    - Optional: `keySignature`, `memoryCost`, `parallelism`, `expiresAt` (Unix seconds).

## Relationships
- The graph lists no neighbors for this file, so no dependency-graph interactions are recorded.
- Its description says `GET /config` publishes `AntibotConfig`. That endpoint is not defined in this file.

## Notes
- `ANTIBOT_VERIFICATION_FAILED` is declared in `x-error-codes` but no operation here references it. It presumably applies to token checks on protected forms elsewhere.
- Only the 404 on `/antibot/challenge` is tied to an error code, through the operation-level `x-error-codes`.
- `AntibotChallenge` is deliberately declared and not free-form. Adding another self-hosted provider would change this schema.
- The `rungs` schema describes rung 1 (identity budgets), rung 2 (email policy), and rung 3 (the provider). It offers one answer to "what is active on this deployment".
