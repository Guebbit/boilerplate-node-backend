# src/modules/feedback/index.ts

## Purpose

Public barrel for the feedback module. It exposes the module's sole cross-module API (`findOwnTickets`) so that sibling modules can import from this single file, while all other internal logic (triage, staff search, status transitions) remains encapsulated in `./service`.

## Key elements

- **`findOwnTickets`** (re-exported from `./service`) — the only symbol this module publishes; consumed by the account data export to retrieve a user's own tickets.

## Relationships

- **`src/modules/feedback/service.ts`** — source of the `findOwnTickets` re-export. All actual implementation lives there; this file adds no logic.
- **`src/modules/account/services/export.ts`** — the known consumer that imports `findOwnTickets` through this barrel (per the JSDoc note referencing the account data export).

## Notes

- The module enforces a barrel-only import rule: sibling modules must import from `src/modules/feedback/index.ts`, never directly from `./service` or other internal files (pattern mirrored in `modules/products/index.ts`).
- The intentional single-export surface is a deliberate design choice to keep the rest of the feedback module invisible to the rest of the codebase.
