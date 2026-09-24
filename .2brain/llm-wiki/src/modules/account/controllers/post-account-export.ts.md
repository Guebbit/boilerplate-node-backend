---
source: src/modules/account/controllers/post-account-export.ts
sha256: cdb6dbdc8b2f9ac9e26962809c83be727f406f3dbf755e8bb7d624bb1d930aa4
generated_at: 2026-09-23T18:01:43.131088+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-account-export.ts

## Purpose

Thin HTTP adapter for `POST /account/export`. It extracts the authenticated caller's identity from the request, delegates the actual data assembly to `exportOwnData`, and returns the result through the standard response helpers. All business logic lives in the service; this file only bridges Express I/O.

## Key elements

- **`postAccountExport(request, response)`** — the sole export. Reads `id` and `email` from `request.authContext!`, calls `exportOwnData(id, email, callerContextOf(request))`, then either sends the payload via `successResponse` or short-circuits with `refused`. Unhandled rejections are funneled through `catchAs(response, 'postAccountExport')`.

## Relationships

- **`src/modules/account/routes.ts`** — mounts this handler on the `POST /account/export` route behind the `requireFreshAuth` middleware, which is the sole auth gate.
- **`src/modules/account/services/export.ts`** — provides `exportOwnData`, the function this controller wraps. Imported directly (not via the `accountService` barrel) by design.
- **`src/infrastructure/http/controller.ts`** — supplies `catchAs` (error-to-HTTP mapping) and `refused` (short-circuit on rejected result envelopes).
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`, extracted from the incoming request and forwarded to the service.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse`, the standard 200 envelope writer.

## Notes

- **No local auth check.** Identity is guaranteed upstream by the `requireFreshAuth` middleware on the route; the controller trusts `request.authContext!` unconditionally.
- **Un-typed response envelope.** The return is _not_ annotated `successResponse<AccountExportResponse>` because each `PersonalDataSection`'s `collect` returns raw Mongoose documents whose contract-shaped fields (ISO timestamps, computed totals, `Shipment.id`, audit `timestamp` strings) only appear after each document's own `toJSON` fires. The controller cannot statically know every contributor's shape; the outbound envelope validation is what actually enforces the wire contract.
- **Direct service import.** Deliberately bypasses the `accountService` barrel — see that barrel's docblock for the rationale (data-export function is intentionally excluded from it).
