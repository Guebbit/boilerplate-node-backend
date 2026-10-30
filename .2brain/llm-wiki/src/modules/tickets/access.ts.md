---
source: src/modules/tickets/access.ts
sha256: e92cc8c53c3460e64b730f7826b07a1f4762e8fc55036ae03a66f95456177e5b
generated_at: 2026-10-29T06:00:31.017528+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/access.ts

## Purpose

Defines the jurisdiction rules that determine which tickets a caller may see and work on. Visitor-sourced tickets are open to any caller who passes the route's `Ticket` permission; system-sourced tickets are further restricted to callers who hold the ticket's route set. The file separates *row-level* scoping (which documents a query returns) from *action-level* checks (whether a specific mutation is allowed), so that route guards and data queries cannot disagree.

## Key elements

- **`Jurisdiction`** (interface) — the two facts that gate access: `source` (visitor | system) and `routeSet` (name string).
- **`heldRouteSets(caller)`** — returns the list of route-set names the caller currently holds (filters `ROUTED_SETS` through `holdsSet`).
- **`jurisdictionScope(caller)`** — builds a Mongo `$or` filter: all visitor tickets, plus system tickets whose `routeSet` is in the caller's held sets. Returns `{}` (no filter) for unrestricted callers.
- **`inJurisdiction(caller, ticket)`** — boolean: true if the ticket is visitor-sourced or the caller holds its route set.
- **`mayWork(caller, ticket)`** — boolean: `update:Ticket` permission **and** jurisdiction.
- **`mayDelete(caller, ticket)`** — boolean: `delete:Ticket` permission **and** jurisdiction.
- **`roleHoldsRouteSet(roleName, routeSet)`** — boolean: evaluates whether a *named role* (not a live caller) expands to include the route set. Used when checking an assignee's eligibility rather than the acting caller's.

## Relationships

- **`@kernel/ability`** — provides `holds` and `holdsSet`, the low-level "does this caller hold this rule/set?" primitives used by every check in this file.
- **`@kernel/permissions`** — provides `PERMISSION_SETS`, `permissionsOfRole`, and `isUnrestrictedRole`; `roleHoldsRouteSet` resolves a role's rule list against the named set's rules.
- **`./domain`** (`src/modules/tickets/domain/index.ts`) — exports `ROUTED_SETS`, the canonical list of route-set names that `heldRouteSets` filters over.
- **`@types`** (`src/types/index.ts`, `src/types/auth-context.ts`) — supplies the `Caller` and `TicketSource` types used throughout.
- **`src/modules/tickets/service.ts`**, **`src/modules/tickets/views.ts`** — consume `jurisdictionScope` to limit query results to the caller's rows.
- **`src/modules/tickets/services/workflow.ts`** — consumes `mayWork` / `mayDelete` to gate mutation transitions.
- **`src/modules/tickets/domain/routing.ts`** — defines the route sets whose names appear in `ROUTED_SETS` and that route guards reference.

## Notes

- Visitor tickets bypass the route-set check entirely; only system tickets are jurisdiction-gated.
- Unrestricted callers (typically administrators) short-circuit to an empty scope, meaning **no** row filtering is applied.
- `roleHoldsRouteSet` is intentionally decoupled from the caller-based functions: it answers "could this *role* work the ticket?" for assignee validation, whereas `inJurisdiction` answers "can *this caller* work it?" at request time.
- The design contract stated in the module docblock: route guards enforce *rules*, this file enforces *rows*. Keeping them separate prevents a situation where a caller passes a guard but the underlying query still returns out-of-jurisdiction documents (or vice-versa).
