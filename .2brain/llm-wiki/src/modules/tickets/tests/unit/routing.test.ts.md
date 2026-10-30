---
source: src/modules/tickets/tests/unit/routing.test.ts
sha256: 7a247c025abaa348db9b88d6cdb4393659d42351cca2f2e10dc7c5c5f1d27b75
generated_at: 2026-10-29T06:09:27.721069+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/unit/routing.test.ts

## Purpose

Unit tests that verify two routing invariants: (1) every ticket kind resolves to a permission set that actually exists in the system, and (2) the administrator role holds every permission rule in every set a ticket can be routed to, guaranteeing no ticket is unreachable by the all-seeing role.

## Key elements

- **`describe('routing')`** — the sole test suite in this file.
- **`it.each(TICKET_KINDS)(…)`** — parameterized test; for every ticket kind, asserts that `routeSetOf(kind)` appears in the `name` field of some entry in `PERMISSION_SETS`.
- **`it('routes a contact message …')`** — spot-checks that the `'contact'` kind maps specifically to the `'TicketDisplay'` set.
- **`it('gives an administrator every routed set …')`** — collects all permissions held by the `'admin'` role via `permissionsOfRole`, then asserts that every `rule` in every set listed in `ROUTED_SETS` is contained in that held set.

## Relationships

- **`src/kernel/permissions.ts`** — source of `PERMISSION_SETS` (the canonical list of named permission sets with their rules) and `permissionsOfRole` (resolves a role name to its full permission list).
- **`src/modules/tickets/domain/index.ts`** — barrel re-export that this file imports from (`'../../domain'`); provides `TICKET_KINDS`, `routeSetOf`, and `ROUTED_SETS`.
- **`src/modules/tickets/domain/routing.ts`** — the module that actually defines `TICKET_KINDS`, `routeSetOf`, and `ROUTED_SETS`; `domain/index.ts` simply re-exports them.

## Notes

- The test file's leading docblock states the invariant in prose; the tests are the executable form of that statement.
- The admin test uses a non-null assertion (`!`) on `PERMISSION_SETS.find(…)`, relying on `ROUTED_SETS` containing only names that exist in `PERMISSION_SETS`. If a new set name is added to `ROUTED_SETS` without a matching entry in `PERMISSION_SETS`, this line will throw before the assertion runs.
- The `'contact' → 'TicketDisplay'` test is a regression guard for a specific mapping that could change silently if `routeSetOf` is refactored.
