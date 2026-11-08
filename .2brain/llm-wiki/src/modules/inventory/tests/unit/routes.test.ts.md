---
source: src/modules/inventory/tests/unit/routes.test.ts
sha256: 9cbd4531a16a190cbb20af8e488080a1a080ad767d0500a5f2f052663d9a3aa8
generated_at: 2026-11-08T06:08:30.199970+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/routes.test.ts

## Purpose

Guards the inventory router against accidental exposure of staff-only endpoints. It asserts the exact route table, confirms every route sits behind both `getAuth` and `requirePermissionGuard`, and verifies no unguarded (public) route exists at all.

## Key elements

- **`describe('inventory routes')`** — top-level suite; three test cases inside.
- **`it('mounts exactly the documented endpoints…')`** — snapshots the ordered list of route signatures (8 routes: levels, preorders, movements, receive, adjust, sweep) via `routeSignatures(router)`.
- **`it.each(…)('%s is reachable only by an authenticated admin')`** — parameterized over all 8 signatures; uses `guardsOn` to collect the middleware chain and asserts `getAuth` is present, the identity guard appears before `requirePermissionGuard`, and that ordering is strict.
- **`it('has no public endpoint at all')`** — filters the signature list for any route whose guard chain lacks `requirePermissionGuard`; expects an empty array.

## Relationships

- **`src/modules/inventory/routes.ts`** — the system under test. This file imports its exported `router` instance; every assertion inspects that router's mount order and middleware stacks.
- **`tests/support/routes.ts`** — provides the three helper utilities (`routeSignatures`, `guardsOn`, `identityGuardIndex`) that flatten the Express router into inspectable strings and ordered guard arrays. Without these, the tests would need to walk the internal Express route table manually.

## Notes

- The file deliberately does **not** test request-level behavior (status codes, payloads). Its scope is purely structural: mount order, guard presence, and guard ordering.
- The "no public endpoint" test is intentionally positional — it will pass even if a public route is added *below* the guard, so the real safety net is the `it.each` ordering check.
- Route signatures are hard-coded in two places (the snapshot test and the `it.each` array). Adding a new route requires updating **both** lists, or one test will fail.
