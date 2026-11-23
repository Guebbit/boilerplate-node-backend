---
source: src/modules/invoicing/index.ts
source_sha256: c58814bea2ac48dcadeae36f7b30a8bc9f15202015577e9a743507a6eaf72e14
context_sha256: 4e27c9364e12de28731f7e1178874092f8c2d5ceeb7ce83e7798960bcb7996f5
generated_at: 2026-11-22T05:31:35.585682+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/index.ts

## Purpose
Public barrel for the invoicing module. It is the only surface sibling modules may import. It re-exports the module's services, domain, emails and model types, and deliberately keeps the repository and the models' runtime code private. As a result, nothing outside the module can write an invoice or a credit note.

## Key elements
- `export * from './services'`: the module's service layer.
- `export * from './domain'`: the domain exports.
- `export * from './emails'`: the email-related exports.
- `export type * from './model'`: type-only re-export. The models' runtime stays internal.

## Relationships
- Re-exports `src/modules/invoicing/services/index.ts`, `src/modules/invoicing/domain/index.ts`, `src/modules/invoicing/emails.ts` and `src/modules/invoicing/model.ts`.
- Consumers elsewhere in the codebase import through this barrel. These are the stats services (`src/modules/stats/services/breakdowns.ts`, `src/modules/stats/services/sales.ts`) and several tests: the account shop contract test, the payments settlement-mismatch test, the returns integration tests, the stats integration test and the bought-returned-refunded journey test.

## Notes
- `invoicingRepository` is intentionally not exported. Per the file's header comment, invoices and credit notes are frozen only from this module's own event listeners.
- Model exports are type-only (`export type *`), so sibling modules cannot import the model classes or schemas at runtime.
- The header comment references external docs on the barrel and published-language rule.
