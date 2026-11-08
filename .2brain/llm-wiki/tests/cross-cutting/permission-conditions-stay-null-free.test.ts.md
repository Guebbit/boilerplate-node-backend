---
source: tests/cross-cutting/permission-conditions-stay-null-free.test.ts
sha256: 43bec64c5d41711c0b6132e95cfc07c3337366201af585382c1d389a7b954962
generated_at: 2026-11-08T09:29:24.527626+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/permission-conditions-stay-null-free.test.ts

## Purpose

Guards against permission rule conditions that would serialize `null` (other than the sanctioned `deletedAt: null`) or use an `$exists`-style operator onto the wire in session-answer responses. Because the never-null response check exempts exactly one null slot, any rule that introduces another null or an existence-operator would break the contract; this test catches that at rule-definition time rather than at runtime.

## Key elements

- **`entriesDeep`** – Recursively flattens an arbitrary (possibly nested) object into a flat list of `[path, value]` pairs using dotted-notation keys (e.g. `deletedAt`, `foo.bar.$eq`).
- **`conditions`** – Precomputed array of `{ id, path, value }` tuples covering every leaf value across all `PERMISSION_RULES` conditions.
- **"has conditions to judge" (canary)** – Asserts `conditions.length > 0` so the two invariant tests below cannot pass vacuously if rules lose their conditions.
- **"holds a null only as the top-level deletedAt"** – Filters for any entry where `value === null` and `path !== 'deletedAt'`; expects zero strays.
- **"uses no $exists-style operator"** – Filters entries whose path's last segment matches `$exists` (via `/(^|\.)\$exists$/`); expects zero strays.

## Relationships

- **`src/kernel/permissions.ts`** – Source of the `PERMISSION_RULES` constant that this test flattens and inspects. The test is a pure consumer; it mutates nothing and adds no runtime behavior.

## Notes

- The null exemption is path-anchored: only the exact top-level key `deletedAt` is allowed to be null. A nested `deletedAt` (e.g. `sub.deletedAt`) would still be flagged.
- The `$exists` regex intentionally matches the *last* path segment only, so a hypothetical field literally named `$exists` at the root or after a dot is caught, while keys merely containing the substring elsewhere (e.g. `is$existsCheck`) are not.
- The canary test is deliberate: without it, deleting all conditions from `PERMISSION_RULES` would make both invariant tests trivially pass.
