---
source: tests/unit/infrastructure/observability/forbidden.test.ts
sha256: cfaee75aad9b559601b548ce8a4581b2d6f875c9a5c68a70247caa0369bb2108
generated_at: 2026-11-08T10:20:51.059746+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/forbidden.test.ts

## Purpose

Unit tests for `auditForbidden`, verifying that security-refusal events are emitted correctly through the audit pipeline (sink registration, entry shape, and edge cases like missing target IDs and absent caller context).

## Key elements

- **`describe('auditForbidden')`** — top-level suite; registers a fresh audit sink in `beforeEach` and resets the `received` array per test.
- **`received: AuditEntry[]`** — mutable array capturing entries pushed by the registered sink, used as the assertion target.
- **`jest.spyOn(auditLogger, 'log')`** — mocks the logger so tests never perform real disk I/O; the spy is set up once at module scope.
- **Test 1 – "records a failed security.forbidden row…"** — asserts a single entry with `action: coreAuditActions.SECURITY_FORBIDDEN`, `outcome: 'failure'`, `level: 'warn'`, actor/target fields, and the supplied metadata (`reason`, `permission`).
- **Test 2 – "leaves the target id out…"** — calls `auditForbidden` without `targetId` and asserts the captured entry has no `targetId` property.
- **Test 3 – "is a no-op on a path with no request behind it"** — passes `undefined` as the caller context and asserts the sink received zero entries.

## Relationships

- **`src/infrastructure/observability/forbidden.ts`** — under test; provides `auditForbidden`.
- **`src/infrastructure/observability/audit.ts`** — supplies `registerAuditSink`, `coreAuditActions`, and the `AuditEntry` type used for assertions.
- **`src/infrastructure/adapters/logger.ts`** — provides `auditLogger`; the test spies on its `log` method to isolate side effects.
- **`tests/support/callers.ts`** — provides `callerContextAs(role, id)`, a helper that fabricates a realistic caller context for tests.

## Notes

- The `auditLogger` spy is set at module scope (outside `beforeEach`), so it persists across all tests in the file. If a future test needs the *real* logger behavior, it must restore the mock explicitly.
- The sink is re-registered on every `beforeEach`; `registerAuditSink` presumably replaces (not appends) the previous sink, otherwise `received` would accumulate duplicates.
- `callerContextAs` is imported via a relative path (`../../../support/callers.ts`) rather than the `@` alias used elsewhere — keep it relative if you move the file, or the alias may not resolve in the test tsconfig.
