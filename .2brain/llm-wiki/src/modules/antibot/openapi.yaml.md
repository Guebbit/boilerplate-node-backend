---
source: src/modules/antibot/openapi.yaml
sha256: 1089d120c7ca215852315de48adc91d012ad185600d3eeeb5de51856dea66660
generated_at: 2026-11-14T19:20:23.705210+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the antibot module. It defines the single self-hosted challenge endpoint (`GET /antibot/challenge`), the `AntibotConfig` schema that `GET /config` publishes so clients know what anti-bot posture is active, and the ALTCHA-specific challenge shapes. It exists so the API surface of the module is declarative, versioned, and consumable by codegen or documentation tooling.

## Key elements

- **`GET /antibot/challenge`** (`operationId: getAntibotChallenge`) — Returns an ALTCHA challenge object. Only fires when the active provider is the self-hosted `altcha`; `none` or vendor-hosted providers yield 404 by design. `security: []` — no auth required.
- **`x-error-codes`** — Module-level error vocabulary: `ANTIBOT_NO_CHALLENGE` (404) and `ANTIBOT_VERIFICATION_FAILED` (403, referenced by downstream verifiers, not a path in this file).
- **`AntibotConfig`** — The deployment-level config shape (provider name, public widget parameters, rung summary). Published via `GET /config`.
- **`AntibotRungs`** — Flat summary of all anti-bot rungs: `identityBudgets` (rung 1, always `true`) and `emailPolicy` (rung 2: `off` | `disposable` | `mx`).
- **`AntibotChallenge`** / **`AntibotChallengeParameters`** — The ALTCHA-specific schema (KDF parameters + HMAC signature). Deliberately typed so swapping providers would require a schema change rather than silently passing through unknown shapes.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — The 404 response on `/antibot/challenge` `$ref`s the shared `NotFound` response from that root spec.
- **`src/modules/antibot/module.ts`** — The runtime implementation that fulfils this contract; the module reads this file (or a generated artifact) as its source of truth for request/response shapes and the `AntibotConfig` it exposes.

## Notes

- **404 is not an error.** Returning 404 from `/antibot/challenge` is the correct, truthful response when the deployment uses `none` or a vendor-hosted provider. Clients should treat it as "no self-hosted challenge available" rather than a failure.
- **`AntibotConfig.parameters` is public by contract.** The schema comment explicitly states everything in that map reaches the browser; do not place secrets there.
- **`identityBudgets` has no off switch.** It is typed as a bare `boolean` with a description that it is always `true`; the field exists for shape-completeness, not configurability.
- **`ANTIBOT_VERIFICATION_FAILED` (403) is declared here but not consumed by any path in this file.** It is intended for the form-submission verifier (likely in another module) to reference, keeping error-code names centralised in the antibot namespace.
