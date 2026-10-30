---
source: src/modules/invoicing/services/for-caller.ts
sha256: 1456534f94ed020b7ae118b235d40068d33f55b35c12499e989d77d05f95e62c
generated_at: 2026-10-29T04:14:03.953189+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/for-caller.ts

## Purpose

Provides the three read operations behind the invoice and credit-note HTTP routes, each resolving a document through the caller's own scope rather than by raw ID. Reading the order first through `orderService.getForCaller` means an unauthorized caller receives the order's natural 404, and the credit-note visibility rule (who may actually see refund amounts) is enforced here, next to the lookup it guards. The controller retains only what a request layer uniquely does: the staff-read audit and PDF byte generation.

## Key elements

- **`ReadFor<TDocument>`** (exported interface) — Wraps a document together with its parent `OrderDocument`, used as the success payload for single-document reads.
- **`creditNoteNotIssued()`** (internal) — Builds the canonical 404 response (`ORDER_CREDIT_NOTE_NOT_ISSUED`) returned when a credit note is denied, unknown, or not yet issued.
- **`mayReadCreditNotes()`** (internal) — Permission gate: allows the buyer or any staff holder of `display:Payment`; logs an `auditForbidden` entry and returns `false` otherwise.
- **`invoiceForCaller()`** (exported) — Reads the order for the caller, then delegates to `findInvoiceForOrder`; returns `ReadFor<InvoiceDocument>` or a 404.
- **`creditNotesForCaller()`** (exported) — Reads the order for the caller, applies `mayReadCreditNotes`, and returns the full list via `findCreditNotesForOrder`; returns an empty `200` (not a 403) when visibility is denied.
- **`creditNoteForCaller()`** (exported) — Reads the order, validates `creditNoteId` with `isValidObjectId`, applies `mayReadCreditNotes`, then fetches a single note via `findCreditNoteForOrderById`; all failure paths (bad ID, denied, not found) return the same `creditNoteNotIssued` 404.

## Relationships

- **`@modules/orders`** (`src/modules/orders/index.ts`, `src/modules/orders/model.ts`, `src/modules/orders/domain/rules.ts`, `src/modules/orders/services/index.ts`) — Imports `orderService.getForCaller` (the scoped order read), `isBuyer` (ownership check), and the `OrderDocument` type.
- **`./issue-invoice.ts`** — Imports `findInvoiceForOrder` to resolve the invoice once the order is in scope.
- **`./issue-credit-note.ts`** — Imports `findCreditNotesForOrder` and `findCreditNoteForOrderById` to resolve credit notes.
- **`@kernel/ability.ts`** — Imports `holds` to evaluate the `display:Payment` ability.
- **`@kernel/permissions.ts`** — Imports `callerForSubject` to build the subject key used in the ability check.
- **`@infrastructure/http/response.ts`** — Imports `generateSuccess`, `generateReject`, and the `ResponseSuccess` / `ResponseReject` types for all return values.
- **`@infrastructure/http/ids.ts`** — Imports `isValidObjectId` to guard the `creditNoteId` parameter.
- **`@infrastructure/i18n/index.ts`** — Imports `t` for translated error messages.
- **`@infrastructure/observability/forbidden.ts`** — Imports `auditForbidden` to log denied credit-note reads.
- **`src/modules/invoicing/model.ts`** — Imports `CreditNoteDocument` and `InvoiceDocument` types.
- **`src/modules/invoicing/services/index.ts`** — Barrel that re-exports this module's public API.

## Notes

- A denied credit-note list read returns **`200 []`** (success with an empty array), not a 403 or 404. The caller is deliberately not told that credit notes exist for the order.
- `creditNoteForCaller` runs `isValidObjectId` *and* `mayReadCreditNotes` in the same `if`; a malformed ID and a permission denial both produce the identical `creditNoteNotIssued` 404, preventing an information-leakage oracle.
- `auditForbidden` fires only inside `mayReadCreditNotes`. No route-level guard sees this denial because the route serves buyers and staff through the same handler.
- The file intentionally omits the staff-read audit (for the order itself) and PDF generation; those responsibilities stay in the calling controller.
- `authContext` is typed `AuthContext | undefined` throughout. A `null`/`undefined` context causes `mayReadCreditNotes` to return `false` (and the order read to 404), so there is no anonymous-access path.
