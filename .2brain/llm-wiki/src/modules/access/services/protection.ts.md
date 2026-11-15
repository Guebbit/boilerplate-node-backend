---
source: src/modules/access/services/protection.ts
sha256: 3acd588e792556384c5a92ed86cf8bebdfed8109601214793c725002644a3bc6
generated_at: 2026-11-14T18:28:24.340889+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/services/protection.ts

## Purpose

Implements the "protecting people" rule: an account that holds a staff role may only be modified by a caller holding `assign:Role`. Provides the gate check, the standardised 403 refusal envelope, and the audit-trail side-effect in one composable unit.

## Key elements

- **`ROLE_PROTECTED_REASON`** — `'role_protected'`, the `metadata.reason` written on a `security.forbidden` row when a refusal is due to a staff role.
- **`SHOP_REFUSAL_REASONS`** — readonly array of shop-level refusal reasons (currently only `ROLE_PROTECTED_REASON`); distinguishes shop business from the platform operator's incident view.
- **`holdsStaffRole(userId)`** — fresh DB lookup (via `membershipsOf`) to determine whether a user holds any staff role. Reads the target's rows, not the caller's session.
- **`staffHoldersAmong(userIds)`** — batched sibling; two queries (tenant + platform) return a `Set<string>` of staff-holding ids. Used by the inactivity reaper and list pages.
- **`canChangeAccount(context, accountId)`** — core predicate. Returns `true` immediately for system actors or `assign:Role` holders; otherwise fetches the target's staff status and delegates to the domain function `mayChangeAccount`.
- **`roleManagementRequired()`** — builds the `403 ROLE_MANAGEMENT_REQUIRED` response envelope (i18n-localised message).
- **`roleProtectedRefusal(context, accountId)`** — service-facing composite: calls `canChangeAccount`; on denial, writes an `auditForbidden` row and returns the 403 envelope. On allow, returns `undefined` so the caller proceeds.

## Relationships

- **`@kernel/ability`** (`holds`) — checks the caller's `assign:Role` ability synchronously.
- **`@kernel/access/tenant`** (`DEPLOYMENT_TENANT_ID`) — supplies the tenant scope for the platform-level role query in `staffHoldersAmong`.
- **`@infrastructure/i18n`** (`t`) — localises the refusal message in `roleManagementRequired`.
- **`@infrastructure/observability/forbidden`** (`auditForbidden`) — records the denial before the response is sent.
- **`@infrastructure/http/response`** (`generateReject`, `ResponseReject`) — constructs and types the 403 envelope.
- **`../domain`** (`mayChangeAccount`) — pure domain predicate that takes the caller's `assign:Role` flag and the target's staff flag; this file supplies both inputs.
- **`./memberships`** (`membershipsOf`, `rolesOfMany`) — data-access layer for membership and role lookups.
- **`@types`** (`CallerContext`) — shape of the authenticated request context passed in.

## Notes

- `holdsStaffRole` intentionally reads the **target's** membership rows, not the caller's session, because the question is "does the *owner* hold a staff role?", not "is the caller a staff member?"
- `canChangeAccount` requires `context` (not optional). A missing caller would force a fail-open "yes" answer, which is treated as a protection failure by convention.
- The caller's own account receives no self-exception: a staff member without `assign:Role` cannot edit their own account.
- `roleProtectedRefusal` audits **before** returning the refusal, ensuring a `security.forbidden` row exists even if the client disconnects immediately.
- System actors (sweeps, reaper) bypass the check entirely — they act on behalf of nobody.
