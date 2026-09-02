# src/modules/account/services/export.ts

## Purpose

Handler for `POST /account/export` — the GDPR Art. 15 / 20 "give me all my data" endpoint. It assembles a single JSON payload by reading the caller's records from every module that stores user-owned data, strips fields that don't belong in an export (or that expose staff-only data), and returns the result. It does not authenticate (that's `requireFreshAuth` on the route) and does not mutate anything.

## Key elements

- **`AccountExportPayload`** — the response shape: profile, addresses, orders, payments, shipments, cart, wishlist, sessions, audit log, and optionally feedback.
- **`exportOwnData(userId, context)`** — the sole export. Fans out reads via `Promise.all`, then sequentially fetches shipments (needs order IDs) and feedback (gated by env flag). Emits an audit event on success. Returns `ResponseSuccess` or a 404 `ResponseReject`.
- **`ExportSession`** / **`ownSessions(tokens)`** — projects live refresh tokens to metadata-only objects; the token value itself is never included.
- **`ExportFeedbackTicket`** / **`toExportFeedback(ticket)`** — maps a feedback ticket while dropping `adminNotes` (staff-internal, not the submitter's data).
- **`ExportPayment`** / **`toExportPayment(payment)`** — maps a payment while dropping `userId` (redundant given scoping).
- **`EVERYTHING`** (100 000) — page-size constant passed to `.search()` calls so the export returns "all of it" rather than a default page.

## Relationships

- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types shape the return value.
- **`@infrastructure/http/request`** — `CallerContext` is the second parameter to `exportOwnData`, used to build the audit event.
- **`@infrastructure/i18n`** (`index.ts`) — `t` provides the i18n string for the 404 "user not found" reject.
- **`@infrastructure/observability/audit`** — `emitAuditEvent` + `buildAuditEvent` record the export action.
- **`@infrastructure/runtime/environment`** — `environmentFlag('NODE_EXPORT_INCLUDE_FEEDBACK', false)` gates whether feedback tickets are included.
- **`src/modules/account/audit.ts`** — `accountAuditActions.AUTH_DATA_EXPORTED` supplies the audit action constant.
- **`src/modules/account/services/addresses.ts`** — `addressesGet(userId)` reads the caller's address book.
- **`src/modules/account/services/index.ts`** — barrel that re-exports this module alongside `profile.ts` and `authentication.ts`.
- **`src/modules/audit-logs`** (`index.ts` / `service.ts`) — `auditLogService.search` returns the caller's own audit entries.
- **`src/modules/cart`** (`index.ts` / `services/index.ts`) — `cartService.cartGet(userId)` returns the caller's cart lines.
- **`src/modules/delivery`** (`index.ts` / `service.ts`) — `findShipmentsForOrders(orderIds)` fetches shipments for the caller's orders (second-phase read after order IDs are extracted).

## Notes

- **Type inference over direct type imports.** Every cross-module type is derived via `Awaited<ReturnType<typeof …>>` rather than importing a sibling's `Document` type. This guarantees the file can only describe shapes its own reads actually produce.
- **`_id` vs `id` trap.** `orderRepository.search` goes through `.normalize()`, which renames `_id` → `id` on output. The code casts to read `order.id` with an `_id` fallback — copying the workaround already documented in `get-order-invoice.ts`.
- **Cart is intentionally stripped** to `{ productId, quantity }` only; the joined product's name/price is catalogue data, and the `CartItem` contract is `additionalProperties: false`.
- **Feedback is optional and off by default.** The `feedback` key is only present when `NODE_EXPORT_INCLUDE_FEEDBACK=true`; the interface marks it as `feedback?`.
- **`toExportFeedback` / `toExportPayment` are real object projections**, not `Omit<…>` type-level tricks. The Mongoose `toJSON` transforms on those models do *not* strip the sensitive fields, so returning the document directly would still serialize them regardless of any narrower TS type.
