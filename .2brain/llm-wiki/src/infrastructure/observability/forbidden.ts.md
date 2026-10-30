---
source: src/infrastructure/observability/forbidden.ts
sha256: b3682569fcf394e872425a64d24ad846334c59da8a4287808dc7ba32567ad92d
generated_at: 2026-10-29T02:09:36.388456+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/forbidden.ts

## Purpose

Provides a single shared function, `auditForbidden`, for recording the `security.forbidden` audit row when a service refuses a request on its own authority (a field, step, or target requirement the guard cannot see). It lives in its own file—importing `recordAudit` from `./audit`—so that a test which replaces the audit port observes these rows through the same mock as every other audit write, preventing silent, un-audited 403s.

## Key elements

- **`auditForbidden(context, refusal)`** — The sole export. Accepts a `CallerContext | undefined` and a refusal descriptor (`targetType`, optional `targetId`, `metadata`). Calls `recordAudit` with action `coreAuditActions.SECURITY_FORBIDDEN`, outcome `'failure'`, and the caller-supplied target/metadata. The `targetId` key is omitted entirely (via conditional spread) when the value is `undefined`.

## Relationships

- **`./audit`** (`src/infrastructure/observability/audit.ts`) — Source of both `recordAudit` and `coreAuditActions`; this file is a thin consumer of that port.
- **`audit-actions.generated.ts`** (`src/infrastructure/observability/audit-actions.generated.ts`) — Defines the `SECURITY_FORBIDDEN` action constant re-exported through `coreAuditActions`.
- **`@types` / `auth-context.ts`** — Supplies the `CallerContext` type used in the function signature.
- **Service callers** (`protection.ts`, `ship-gate.ts`, `for-caller.ts`, `refunds.ts`, `outcome.ts`) — Each invokes `auditForbidden` at the point where its own domain rule rejects a request, keeping the audit write consistent across modules while each service still owns its distinct HTTP response.
- **`forbidden.test.ts`** (`tests/unit/infrastructure/observability/forbidden.test.ts`) — Unit tests verifying the audit row shape, the `targetId` omission path, and interaction with the mocked audit port.

## Notes

- The file is intentionally minimal so that *any* test that stubs `recordAudit` (imported via `./audit`) will also capture calls made through `auditForbidden`. Merging this logic into `audit.ts` or inlining it in each service would break that guarantee.
- `targetId` is optional; when absent the key is excluded from the audit row rather than set to `undefined`, keeping downstream consumers from having to null-check.
- The function returns `void`—it is a fire-and-forget side effect, not a result the caller branches on.
