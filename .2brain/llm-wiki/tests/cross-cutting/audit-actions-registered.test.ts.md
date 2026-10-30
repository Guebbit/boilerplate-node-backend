---
source: tests/cross-cutting/audit-actions-registered.test.ts
sha256: 03d3c71c0e8e58ae7547feb0de6fbbb671b64572f4ee5371f07f0c6b74765709
generated_at: 2026-10-29T06:43:15.400591+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/audit-actions-registered.test.ts

## Purpose

Verifies that every auditing module's actions are registered in the app-wide `AuditAction` union via their `declare module` augmentation. The check is enforced at **type-check time** (the static imports must resolve against the union) and at **runtime** (each action's string value matches its expected wire format). It exists to catch a missing `declare module` augmentation that would otherwise let the owning module compile in isolation while silently breaking every `emitAuditEvent` call site.

## Key elements

- **`REGISTERED`** — Tuple array (`[module: string, action: AuditAction, expected: string][]`) holding one representative action per module alongside its expected dotted wire value (e.g. `'auth.login'`). Serves as the single source of test cases.
- **Static imports of `*AuditActions` constants** — One per module (`accountAuditActions`, `cartAuditActions`, `ticketsAuditActions`, `localeAuditActions`, `ordersAuditActions`, `productsAuditActions`, `usersAuditActions`). These are required (not dynamically discovered) so TypeScript can narrow each literal against the `AuditAction` union at compile time.
- **`import type { AuditAction }`** — Pulls the app-wide union from `@infrastructure/observability/audit`; the type annotation on `REGISTERED` is what makes a non-member action a compile error.
- **`it.each(REGISTERED)`** — Runtime assertion that each action's string value equals the expected wire format; the type-level membership check is orthogonal and handled by `tsc`.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — Provides the `AuditAction` union type that all module actions must extend.
- **`src/modules/{account,cart,tickets,locales,orders,products,users}/audit.ts`** — Each exports its module's action constants (e.g. `accountAuditActions`) *and* a `declare module` augmentation that contributes those keys to the shared union. This test is the integration point that ties all seven back to the infrastructure type.

## Notes

- **Jest does not type-check.** The primary guarantee (that the action is a valid `AuditAction` member) is enforced only by `tsc`/IDE tooling. The `expect(action).toBe(expected)` assertion merely confirms the runtime string value. A CI step that runs `tsc --noEmit` is essential for this test to be meaningful.
- **One action per module is sufficient for the membership proof**, but it does not verify that *every* action a module owns is registered. Exhaustive coverage lives in the structural sweep (`audit-actions.test.ts`), which this file's doc comment explicitly contrasts with.
- **Static imports are intentional.** Replacing them with a dynamic `import()` or a filesystem scan would lose the compile-time narrowing that makes a missing augmentation a hard error rather than a silent runtime failure.
