---
source: src/modules/example/services/owner.ts
sha256: c5b5a1a82654eb8c11ea78254b261eaa13d888e8abbf11475eeabbe8844e3b7f
generated_at: 2026-10-14T15:46:00.821968+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/owner.ts

## Purpose

The single point where the `example` module reads another module's data (the owner's display name) and applies the outranked-refusal rank rule. It exists so that every path that needs "whose example is this" resolves the name and enforces the rank check in one place, keeping the contract's `Example` shape free of a stored denormalized name.

## Key elements

- **`ownerNameOf(userId: string): Promise<string>`** — Resolves one user's display name via `userService.getById`; falls back to a translated placeholder (`example.owner-unknown`) when the account no longer exists.
- **`ownerNamesOf(userIds: string[]): Promise<Map<string, string>>`** — Batch version for a page of rows. Deduplicates with a `Set` so a page of one person's examples costs a single read rather than one per row.
- **`presentWithOwner(document: ExampleDocument): Promise<Example>`** — Enriches a stored document with the owner's name and delegates to `presentExample` to produce the contract shape.
- **`outrankedRefusalFor(example, context): Promise<ResponseReject | undefined>`** — Rank rule: returns a `403 OUTRANKED` rejection when the example's owner ranks at or above the caller; returns `undefined` otherwise. Intended to be called *after* the scoped read (the owner is on the row) and never for the caller's own row.

## Relationships

- **`@modules/users` (barrel) → `userService.getById`** — The only cross-module read in this file; always goes through the barrel, never the users repository or model directly.
- **`../model`** — Imports the `ExampleDocument` type used as input to `presentWithOwner` and `outrankedRefusalFor`.
- **`../presenter`** — Calls `presentExample(document, name)` to build the final `Example` contract object.
- **`@modules/access`** — Imports `outrankedRefusal` and wraps it in `outrankedRefusalFor` with the `'example'` resource key.
- **`@infrastructure/i18n`** — Uses `t()` for the unknown-owner placeholder string.
- **`@infrastructure/http/response`** — Imports the `ResponseReject` type as the return type of `outrankedRefusalFor`.
- **`@types`** — Imports `Example` (contract shape) and `CallerContext` (caller identity for rank checks).

## Notes

- The owner name is **not** stored in the collection; it is always resolved at read time. The contract carries it, the document does not.
- `outrankedRefusalFor` is explicitly documented as copy-pasteable into other modules whose rows have an owner. Conventions when reusing it: call it after the scoped read (owner is on the row), and never invoke it for the caller's own row (the rule exempts that case). See `docs/theory/authorization.md#acting-on-someone-else-s-things`.
- The module-level doc comment codifies the cross-module read convention: always through the barrel (`@modules/users`), never through that module's repository or model.
