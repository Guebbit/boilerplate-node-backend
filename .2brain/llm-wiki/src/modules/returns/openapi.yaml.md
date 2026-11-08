---
source: src/modules/returns/openapi.yaml
sha256: 58e41119f442f8804465d523fc5f57b484f81e5548f9147f83cb0688dfdccb79
generated_at: 2026-11-08T08:00:36.752410+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **returns** module. It defines the REST surface for opening, listing, and managing returns (including EU withdrawal-of-contract as a special return), plus the module's contribution to the account data export. It exists so that the API is documented, validated, and discoverable independently of the runtime code.

## Key elements

- **`x-error-codes`** — Module-level error catalogue (e.g. `RETURN_DEDUCTION_INVALID`, `RETURN_WINDOW_CLOSED`, `RETURN_NOT_RECEIVABLE`). Each entry carries an HTTP status and a legal/business description; individual operations reference a subset via their own `x-error-codes`.
- **`x-personal-data.returns`** — The module's section of `POST /account/export`. Exposes every return on the account's own orders (keyed by `orderId`), typed as `ExportReturn[]`. Removing the module removes this section from the export.
- **`tags[0]` (Returns)** — Self-describing tag with `x-family: After the sale`; scopes all operations and documents the withdrawal-button semantics.
- **`GET /returns`** (`listReturns`) — Paginated listing; staff see all, buyers see their own. Filterable by `orderId`, `status`, `reason`, and JSON:API-style `sort`.
- **`POST /returns`** (`createReturn`) — Single entry point for three flows: buyer withdrawal (before or after dispatch), staff cancellation of an unfulfilled remainder, and a standard goods return. Handles idempotency, re-auth for staff/statement cases, and returns `201` with `Location`.
- **`GET /returns/options`** *(truncated in file)* — Pre-flight metadata telling the client what each return door would accept, refund, and whether the caller is permitted to use it.
- **Shared references** — Parameters, headers, and common responses are `$ref`-ed from `../../../shared/contracts/openapi.root.yaml` (pagination, `Idempotency-Key`, `Location`, standard error responses).

## Relationships

- **`module.yaml`** — Declares the module's metadata (name, version, tag family). This file is the API-contract half of that declaration; `module.yaml` points here.
- **`authorization.yaml`** — Defines the permission keys (`read:Return`, `create:Refund`, `update:Order`, `update:Return`) referenced in this file's `security` and `403` responses.
- **`module.ts`** — TypeScript loader that registers this module with the platform; reads `module.yaml` and serves the OpenAPI document, so schema changes here affect the generated client types and runtime validation.
- **`asyncapi.webhooks.yaml`** — Defines the outbound webhooks (e.g. return approved, goods received, refund issued) that complement the synchronous REST operations defined here.

## Notes

- A **withdrawal is not a separate endpoint**; it is `POST /returns` with `reason: withdrawal`. The legal distinction (Consumer Rights Directive Art. 11a) lives in the description, not in the URL.
- The file is **truncated** in the content sample — additional paths (e.g. individual return detail, receive, decide, restock, cancel) and the full `components/schemas` block are present in the real file but not shown here.
- `statedVia` / `requestedAt` on `CreateReturnRequest` are **staff-only fields**; a buyer sending them gets a `422`. Any request carrying `statedVia` triggers a fresh-session (re-auth) check that fails closed.
- Error descriptions cite **EU directives** (2019/771, Consumer Rights Directive Art. 11a, Art. 16 exclusions) as the authority for validation rules — treat them as normative, not decorative.
- `x-error-codes` entries are **module-scoped**: they are available to any operation in this file without being re-listed per operation; individual operations then narrow the set.
