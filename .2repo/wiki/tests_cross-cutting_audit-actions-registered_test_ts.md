# tests/cross-cutting/audit-actions-registered.test.ts

## Purpose

Compile-time (and minimal runtime) verification that every auditing module's `declare module` augmentation actually contributes its action constants to the app-wide `AuditAction` union. If a module's augmentation is removed, this file fails to type-check — catching the regression where `emitAuditEvent` would silently reject that module's actions at call sites rather than at the augmentation site.

## Key elements

- **Static imports of `*AuditActions`** (one per module: account, cart, feedback, locales, orders, products, users) — these are load-bearing for type-checking; they force TypeScript to resolve each module's augmentation against the `AuditAction` union.
- **`REGISTERED`** — a typed tuple array `[module: string, action: AuditAction, expected: string][]` holding one representative action per module paired with its expected wire-format string (e.g. `'auth.login'`, `'order.created'`).
- **`describe` / `it.each(REGISTERED)`** — runtime assertion that each action's string value equals the expected wire value. The runtime check is secondary; the primary guarantee is that the assignment `action: AuditAction` compiles.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — source of the `AuditAction` type alias (union of all module actions). This test is the contract that every module's augmentation actually extends this union.
- **`src/modules/{account,cart,feedback,locales,orders,products,users}/audit.ts`** — each exports a constant object (e.g. `accountAuditActions`) whose values must be assignable to `AuditAction`. This file statically imports every one; dropping any import removes the corresponding type-check coverage.

## Notes

- **Static imports are mandatory, not stylistic.** Dynamic imports or disk-scanning (as done in the sibling `audit-actions.test.ts`) would bypass TypeScript's literal-narrowing and make the union-membership check a no-op. The file names every module deliberately.
- **Jest does not type-check.** The `it.each` block will pass at runtime even if the augmentation is missing; the failure mode is a `tsc` error, not a test failure. Run through the type-checker (e.g. `tsc --noEmit`) to get the real signal.
- **One action per module is sufficient.** Proving a single literal is assignable to the union confirms the augmentation is present; there is no need to enumerate every action a module owns here.
- Adding a new auditing module requires adding both a static import and a `REGISTERED` row in this file, otherwise the new module's actions are unverified against the union.
