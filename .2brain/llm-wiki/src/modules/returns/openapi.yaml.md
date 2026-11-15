---
source: src/modules/returns/openapi.yaml
sha256: 7f4d7df55fa28d87563365b1a5a0479c38883dc5bdbc8257c6b40f755308ea32
generated_at: 2026-11-14T21:35:24.381818+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract for the **returns** module: it defines the REST API surface for opening, listing, and managing product returns, EU contract withdrawals, and cancellations, along with the module's error-code vocabulary and its slice of the account data export. It is the single source of truth for the HTTP interface other code (clients, tests, documentation generators) consumes.

## Key elements

- **`x-error-codes`** — Module-level error-code registry (17 codes, e.g. `RETURN_DEDUCTION_INVALID`, `RETURN_NOT_RECEIVABLE`, `RETURN_WINDOW_CLOSED`). Each maps a code to an HTTP status and a human-readable description, several citing EU directives (2019/771, 2011/83/EU).
- **`x-personal-data`** — Declares the `returns` array that the account-export bundler injects into `POST /account/export` (`AccountExportResponse`). Items use `#/components/schemas/ExportReturn`.
- **`paths./returns.get`** (`listReturns`) — Paginated listing. Staff see all returns; buyers see their own. Supports `orderId`, `status`, `reason`, and JSON:API-style `sort` filters. References shared `PageParam`/`PageSizeParam` from the root spec.
- **`paths./returns.post`** (`createReturn`) — Single endpoint covering three flows: buyer withdrawal (`reason: withdrawal`), staff-opened return (`kind: return`), and pre-dispatch cancellation (`kind: cancellation`). Handles the EU "withdraw from contract" button (Art. 11a), staff `policyExceptions`, `statedVia` re-authentication, and idempotency via `Idempotency-Key`.
- **`tags`** — Single tag `Returns` with `x-family: After the sale`, used for client-side grouping.
- **Shared `$ref`s** — Parameters, headers, and common responses are pulled from `../../../shared/contracts/openapi.root.yaml`; local schemas (`Return`, `CreateReturnRequest`, `ReturnStatus`, `ReturnReason`, `ReturnSort`, `ReturnsResponse`, `ExportReturn`) are defined in this file's `components` section (truncated in the excerpt).

## Relationships

- **`src/modules/returns/module.yaml`** — Module manifest; the bundler reads it to register this OpenAPI spec, the `x-personal-data` section, and the `x-error-codes` into the assembled API.
- **`src/modules/returns/module.ts`** — Runtime module registration (routes, middleware wiring) that the spec documents; the `operationId` values here (`listReturns`, `createReturn`) correspond to handler exports in that file.
- **`src/modules/returns/authorization.yaml`** — Defines the permission keys referenced in this spec's descriptions (`read:Return`, `create:Refund`, `update:Return`, `update:Order`, `stepUp: critical`).
- **`src/modules/returns/asyncapi.webhooks.yaml`** — Complementary event contract (webhooks fired on return state transitions); this file is the synchronous request/response side of the same domain.

## Notes

- A withdrawal is **not** a separate endpoint — it is `POST /returns` with `reason: withdrawal`. The client is expected to check `Order.actions.withdraw` to decide whether to render the button; the server never exposes a day-counter.
- `kind: cancellation` vs. `kind: return` is determined by the request body, not by a different path. Both are born `closed` or `approved` depending on whether goods have shipped.
- Any request carrying `statedVia` (staff recording an out-of-band buyer statement) triggers a fresh-session re-auth (`REAUTH_REQUIRED`); this is a legal-act safeguard and is not optional.
- The `x-error-codes` block is a **documentation/contract** artifact; the actual enforcement lives in the service layer. Status codes are split 422 (invalid input/semantics) vs. 409 (conflicting state).
- `Idempotency-Key` is supported on `POST /returns` via the shared header parameter; retry-safe behavior is guaranteed only when the key is present.
