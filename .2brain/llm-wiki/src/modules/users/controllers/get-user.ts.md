---
source: src/modules/users/controllers/get-user.ts
sha256: a164954c29e1617778169f1d46f4d50359b5da8459a43d3cfbe5e8ae73a4d28a
generated_at: 2026-11-14T22:19:29.605977+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/get-user.ts

## Purpose

Controller for `GET /users/:id`. Resolves a single user by path id for admin callers, shapes the response via the user service's contract mapper, and records the read in the staff-audit log.

## Key elements

- **`getUserItem`** (exported) — the route handler, produced by `createItemController`. Declares entity `'user'`, not-found key `'users.not-found'`, and a `fetch` callback that:
  1. Loads the user by id via the user service.
  2. If absent, returns `undefined` (the factory emits the standard 404).
  3. Calls `recordStaffRead` with the audit action for admin user-view, targeting the viewed user id as both `targetId` and `subjectId`.
  4. Returns the user service's contract mapping of the user, passing the caller identity extracted from the request.

## Relationships

- **`src/infrastructure/surfaces/create-item-controller.ts`** — provides the `createItemController` factory that supplies standard not-found handling and the item-controller shape.
- **`src/infrastructure/http/request.ts`** — provides the helper to extract the authenticated caller's identity from the request object.
- **`src/kernel/staff-read.ts`** — provides the generic staff-read audit-logging helper invoked once per successful read.
- **`src/modules/users/audit.ts`** — provides the audit action identifiers used to tag this read in audit trails.
- **`src/modules/users/services/index.ts`** — provides the user service used for the id-based lookup and the response contract mapping.
- **`src/modules/users/routes.ts`** — mounts `getUserItem` as the handler for the `GET /users/:id` route.

## Notes

- The contract mapping re-reads the caller's **current** role from the membership store on every request; the user document itself carries no role. This is an intentional extra indexed lookup (same cost class as the other auth checks on the endpoint) to guarantee the response reflects the caller's live permissions rather than a stale snapshot.
- The audit record sets both `targetId` and `subjectId` to the viewed user's id — the admin is the implicit actor, not a separate field here.
