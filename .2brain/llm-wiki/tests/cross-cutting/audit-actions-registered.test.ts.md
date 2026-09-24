---
source: tests/cross-cutting/audit-actions-registered.test.ts
sha256: 7fd81fc6247fb2bc068837000438a84f1ae5be8119b605d51eb8f6d5d4b6cda2
generated_at: 2026-09-23T19:53:11.568421+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/audit-actions-registered.test.ts

## Purpose

Verifies at compile time that every auditing module's `declare module` augmentation actually contributes its actions to the app-wide `AuditAction` union. It imports one representative action per module and asserts each equals its expected wire-value string, so a missing or broken augmentation is caught as a type error rather than surfacing later at `emitAuditEvent` call sites.

## Key elements

- **`REGISTERED`** – A `[module, action, expectedWireValue]` tuple array holding exactly one action per auditing module (7 entries). Serves as the data for `it.each`.
- **`describe('audit actions register in the app-wide union')`** – Single test block; `it.each(REGISTERED)` iterates the tuples and asserts `action === expected`.
- **Static imports of `*AuditActions` constants** – One per module (`accountAuditActions`, `cartAuditActions`, etc.). These are the mechanism that forces TypeScript to resolve the `declare module` augmentation against `AuditAction`.
- **`import type { AuditAction }`** – Pulls the union type from the observability layer, establishing the type context for the narrowing check.

## Relationships

- **`src/infrastructure/observability/audit.ts`** – Source of the `AuditAction` union type and the `emitAuditEvent` API that ultimately depends on these augmentations.
- **`src/modules/{account,cart,feedback,locales,orders,products,users}/audit.ts`** – Each exports its module-specific action constants and contains the `declare module` augmentation that adds those constants to `AuditAction`. This test is the only cross-cutting file that statically imports all seven.

## Notes

- **Compile-time only.** Jest does not type-check; the real guard is `tsc`/IDE. At runtime this test simply compares strings, which would pass even if the augmentation were removed.
- **Static imports are intentional.** Unlike the sibling `audit-actions.test.ts` (a structural/disk sweep), this file names every module explicitly because TypeScript can only narrow a literal against the union when the import is statically typed. Dynamic or glob-based imports would defeat the check.
- **One action per module is sufficient.** Proving a single constant belongs to the union is enough to confirm the augmentation is in effect; the remaining actions in that module rely on the same augmentation block.
