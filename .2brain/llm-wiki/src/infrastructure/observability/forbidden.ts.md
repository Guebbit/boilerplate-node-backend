---
source: src/infrastructure/observability/forbidden.ts
source_sha256: b3682569fcf394e872425a64d24ad846334c59da8a4287808dc7ba32567ad92d
context_sha256: 77d542f1f39b606f5db2dbb9e488aa3dd8478dcc8b170c7fae4abb70725762d9
generated_at: 2026-11-22T02:58:34.177878+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/forbidden.ts

## Purpose
Provides a single helper that writes a `security.forbidden` audit row when a service refuses an action on its own authority. This covers the case where the caller passed the route's rule but lacked the rule a specific field, step or target required. The route guard already audits a missing route rule, so this helper ensures these other refusals are not silent 403s.

## Key elements
- `auditForbidden(context, refusal)`: returns `void`. Calls `recordAudit` with:
  - `action`: `coreAuditActions.SECURITY_FORBIDDEN`
  - `outcome`: `'failure'`
  - `targetType`: taken from `refusal.targetType`
  - `targetId`: included only when `refusal.targetId` is not `undefined`
  - `metadata`: taken from `refusal.metadata`
- Parameters:
  - `context`: a `CallerContext`, or `undefined` on a path with no request behind it.
  - `refusal`: `{ targetType: string; targetId?: string; metadata: Record<string, unknown> }`. The metadata holds the reason and anything that explains it, such as the missing rule.

## Relationships
- `src/infrastructure/observability/audit.ts`: imports `recordAudit` and `coreAuditActions` from it. This file only builds the row. Writing it is left to `recordAudit`.
- `src/types/index.ts` and `src/types/auth-context.ts`: the `CallerContext` type is imported from `@types`.
- Service callers in `src/modules/access/services/protection.ts`, `src/modules/delivery/services/ship-gate.ts`, `src/modules/invoicing/services/for-caller.ts`, `src/modules/payments/services/return-refunds.ts` and `src/modules/returns/services/outcome.ts` are graph neighbors. They are the services that use this helper to audit their own refusals.
- `tests/unit/infrastructure/observability/forbidden.test.ts`: unit tests for this helper.

## Notes
- It is a separate file from `audit.ts` on purpose. Importing `recordAudit` from `./audit` means a test that replaces the audit port also captures these rows, the same as every other audit row.
- It only shares the audit row. Each call site keeps its own reject, because the response differs between sites.
