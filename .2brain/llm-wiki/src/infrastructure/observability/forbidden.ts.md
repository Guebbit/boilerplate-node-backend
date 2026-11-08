---
source: src/infrastructure/observability/forbidden.ts
sha256: b3682569fcf394e872425a64d24ad846334c59da8a4287808dc7ba32567ad92d
generated_at: 2026-11-08T03:39:30.370874+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/forbidden.ts

## Purpose

Records a `security.forbidden` audit row for refusals a service makes on its own authority—situations where the caller passed the route-level guard but lacks a field-level, step-level, or target-specific rule. It exists as a separate module so that tests which mock the audit port (`recordAudit`) intercept these rows through the same seam as every other audit write.

## Key elements

- **`auditForbidden(context, refusal)`** — The sole export. Calls `recordAudit` with `action: coreAuditActions.SECURITY_FORBIDDEN`, `outcome: 'failure'`, the caller's `targetType`, an optional `targetId`, and a free-form `metadata` object describing the reason. `context` may be `undefined` on non-request paths. `targetId` is omitted from the row when not provided.

## Relationships

- **`./audit`** — Source of `recordAudit` and `coreAuditActions`. This file is a thin adapter that funnels its single action through that port.
- **`@types` (→ `src/types/auth-context.ts`)** — Imports the `CallerContext` type used to identify the actor in the audit row.
- **Module callers** (`protection.ts`, `ship-gate.ts`, `for-caller.ts`, `refunds.ts`, `outcome.ts`) — Each calls `auditForbidden` at its own refusal point before returning its domain-specific 403 response. The shared contract is only the audit row; the HTTP response shape stays local to each caller.
- **`tests/unit/infrastructure/infrastructure/observability/forbidden.test.ts`** — Unit tests that replace the `recordAudit` port and assert the row shape produced by `auditForbidden`.

## Notes

- This file deliberately does **not** throw or return a response. Each caller keeps its own `reject`/`403` construction; the only shared artifact is the audit row.
- `targetId` is conditionally spread into the audit payload, so rows without a known target carry no empty key.
- The module is intentionally tiny and side-effect-free beyond the single `recordAudit` call, which is what makes port-mocking in tests straightforward.
