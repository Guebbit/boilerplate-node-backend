---
source: scripts/contracts/cookie-auth.ts
sha256: 484653f9fde4735e301ac42a051948f1a8c60f8d80e091ef6fc95638cb9ad1bb
generated_at: 2026-11-08T02:40:32.546043+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/cookie-auth.ts

## Purpose

Post-bundle step that augments every OpenAPI operation using `bearerAuth` with a `cookieAuth` security alternative and a `403` response (for unsafe methods). It exists so the cookie-based auth contract and its origin-refusal semantics are derived mechanically from the existing `bearerAuth` declaration rather than hand-written per operation.

## Key elements

- **`withCookieAuth`** (exported `Step`) — Iterates all operations via `operationsOf`. For each operation whose `security` list names `bearerAuth`:
  - Pushes `{ cookieAuth: [] }` onto the security alternatives if not already present.
  - Adds a `403` response (`$ref: '#/components/responses/Forbidden'`) if the method is not safe and no `403` is already declared.
- **`SAFE_METHODS`** (const `Set`) — `get`, `head`, `options`; these skip the `403` addition because a cookie on them requires no origin check.
- **`takesBearer`** (type guard) — Checks whether a security-requirements array contains an alternative with a `bearerAuth` key.

## Relationships

- **`scripts/contracts/openapi-document.ts`** — Source of the `operationsOf` iterator and the `Operation` / `Step` types used throughout this file.
- **`scripts/contracts/openapi-bundle.ts`** — The bundle orchestrator that invokes `withCookieAuth` as one of its post-bundle steps (per the module doc comment: "Runs on the bundled document, like the other post-bundle steps in `./openapi-bundle`").
- **`tests/unit/scripts/contracts/cookie-auth.test.ts`** — Unit tests covering the step's behavior.

## Notes

- **Never overwrites an existing `403`.** If an operation already declares its own `403` response, the step leaves it untouched; the operation-specific response is considered more specific than the generic origin-refusal.
- **Never overwrites an existing `cookieAuth`** entry in the security list.
- The step mutates the document in place (pushes onto arrays, assigns `operation.responses`); it does not return a new document.
- The `403` response is a `$ref` to a component that must already exist in the bundled document (`#/components/responses/Forbidden`); this step does not create it.
