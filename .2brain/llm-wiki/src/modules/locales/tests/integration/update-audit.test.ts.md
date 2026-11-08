---
source: src/modules/locales/tests/integration/update-audit.test.ts
sha256: 57fa59d4577b57e675e5a2b7c4074f6365c4a409afc3aff65ea35a37a76876a7
generated_at: 2026-11-08T06:28:51.624674+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/update-audit.test.ts

## Purpose

Integration tests that verify the **metadata shape** of audit events emitted by the three locale-service write operations (`updateLanguage`, `deactivateLanguage`, `updateEntry`). The file exists to pin down the audit contract: which fields are recorded, how "from/to" deltas are shaped, and what is deliberately *excluded* (entry text is never copied into the audit trail).

## Key elements

- **`metadataOf(spy, action)`** — helper that pulls the `metadata` object from the first `emitAuditEvent` call matching a given `action` string.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the entire audit port with the shared `auditPortMock()` from `tests/support/ports.ts`; the port is *replaced*, not spied on.
- **`describe('localeService.updateLanguage — the audit row')`** — asserts that changed display fields (`name`, `direction`) appear as `{ from, to }` pairs under `metadata.changes`.
- **`describe('localeService.deactivateLanguage — the audit row')`** — asserts the `active` flag delta (`true → false`) is recorded.
- **`describe('localeService.updateEntry — the audit row')`** — asserts the audit records `locale`, `app`, `key`, and `changedFields: ['value']`, but **not** the actual text.

## Relationships

- **`src/modules/locales/services/index.ts`** — the SUT; all three service methods are exercised.
- **`src/modules/locales/audit.ts`** — provides the `localeAuditActions` constants used as expected `action` values.
- **`src/infrastructure/observability/audit.ts`** — the audit port module that is fully mocked at the module level.
- **`src/modules/locales/repository.ts`** — `localeRepository` / `localeEntryRepository` seed test data before each assertion.
- **`src/modules/locales/factories.ts`** — `makeLocale` / `makeLocaleEntry` build the fixture rows.
- **`src/modules/locales/tests/unit/apps.fixture.ts`** — supplies the `FRONTEND` app identifier.
- **`tests/support/ports.ts`** — provides `observePort` (spies a specific port function) and the `auditPortMock` used by the `jest.mock` factory.
- **`tests/support/callers.ts`** — `testCallerContext` supplies a standard caller identity for service calls.
- **`tests/support/setup-test-db.ts`** — in-memory DB setup called once before all tests.

## Notes

- The module docblock states the design intent explicitly: the audit trail records *which* fields moved and the entry key, but **never** the entry's text value. The `updateEntry` test enforces this by asserting `changedFields: ['value']` with no text payload.
- `metadataOf` finds the first matching call by `action`; if a service emitted the same action twice in one test, only the first would be inspected.
- `afterEach` calls `jest.restoreAllMocks()`, so any spy created by `observePort` is torn down between tests; the module-level `jest.mock` persists for the whole file.
