---
source: src/modules/antibot/openapi.yaml
sha256: 35722ef053bb37df46dd08c0be1566a0f0030dfab619cf51cdfcfc6196f64c46
generated_at: 2026-11-08T05:00:35.342419+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the antibot module. It declares the single `GET /antibot/challenge` endpoint, the module's custom error codes, and the JSON schemas that describe the challenge payload and the config published to the browser. It exists so clients, tests, and documentation all agree on the wire shape without importing TypeScript.

## Key elements

- **`GET /antibot/challenge`** (`getAntibotChallenge`) – Returns an ALTCHA challenge when the active provider is self-hosted; returns the shared `NotFound` response when the provider is `none` or vendor-hosted. No auth (`security: []`).
- **`x-error-codes`** – Two module-specific error codes: `ANTIBOT_NO_CHALLENGE` (404) and `ANTIBOT_VERIFICATION_FAILED` (403).
- **`AntibotConfig`** – The object `GET /config` exposes to the browser: active `provider`, render `parameters`, and `rungs` summary. All fields are public by design.
- **`AntibotRungs`** – Flat status for every anti-abuse rung: `identityBudgets` (rung 1, always `true`) and `emailPolicy` (rung 2: `off` / `disposable` / `mx`).
- **`AntibotChallenge`** – ALTCHA-specific shape: `parameters` + an HMAC `signature` proving server origin.
- **`AntibotChallengeParameters`** – KDF parameters the solver needs: `algorithm`, `nonce`, `salt`, `cost`, `keyLength`, `keyPrefix`, and optional `keySignature`, `memoryCost`, `parallelism`, `expiresAt`.
- **Tag `Antibot`** with `x-family: Core` – custom extension grouping this operation in the module's tag taxonomy.

## Relationships

- **`shared/contracts/openapi.root.yaml`** – The `404` response on `/antibot/challenge` is a `$ref` into the root contract's `NotFound` component, keeping the error envelope consistent across all modules.
- **`src/modules/antibot/module.ts`** – The implementation module whose HTTP surface this spec describes. The module reads the `provider` / `parameters` fields (defined in `AntibotConfig`) at runtime and populates `AntibotChallenge` when issuing a challenge.

## Notes

- A `404` from `/antibot/challenge` is **not** an error condition; it is the correct response when no self-hosted provider is configured. Clients should treat it as "no challenge required."
- `AntibotConfig` is published by the shared `GET /config` endpoint, not by this module's own route. The schema lives here only because the module owns the fields.
- `identityBudgets` is hard-coded `true` in the schema description — there is no deployment flag to disable rung 1.
- The challenge schema is intentionally narrow to ALTCHA. Adding a second self-hosted provider requires extending `AntibotChallenge` rather than leaving the response free-form.
- `expiresAt` is a Unix-seconds timestamp, not an ISO date, matching ALTCHA's own convention.
