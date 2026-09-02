# src/modules/payments/index.ts

## Purpose

Barrel (public entry) for the Payments module. It re-exports a single curated surface—`paymentService`—so that sibling modules import from this one path instead of reaching into internal files. This enforces a stable API boundary and keeps the payments module's internals private to itself.

## Key elements

- **`paymentService`** (re-export from `./service`) — the sole public export of the module. Callers use this single object rather than importing individual functions, which prevents callers from drifting onto unexported internals.

## Relationships

- **`src/modules/payments/service.ts`** — the source of the re-export. This index file has no logic of its own; it simply forwards `paymentService` defined there.
- **`src/modules/account/services/export.ts`** — a downstream consumer that imports `paymentService` through this barrel rather than from `service.ts` directly.

## Notes

- The module docstring points to `docs/modules/payments.md` for full API documentation and to `modules/products/index.ts` for the general barrel rule that applies across the codebase.
- There is intentionally **one** export. If a new public function is needed, the convention is to add it to `paymentService` in `service.ts` rather than adding a second line here.
