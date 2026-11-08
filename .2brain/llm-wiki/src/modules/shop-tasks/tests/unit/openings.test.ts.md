---
source: src/modules/shop-tasks/tests/unit/openings.test.ts
sha256: 0367f4ec1eac38a77ccde46bd8fc45a6d42393c829555c6b8faf3d0595ac4a36
generated_at: 2026-11-08T08:19:46.553458+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/unit/openings.test.ts

## Purpose

Unit tests for the pure opening functions in `domain/openings.ts`. Verifies which shop situations create a task (consent reminders, refunds, disputes, payment anomalies), their kind/route/link metadata, due-date arithmetic, and FTC jurisdiction gating. No mocks, no database — every assertion is against a returned `SystemOpening` object.

## Key elements

- **`delay(overrides?)`** — local factory that returns a default delay-notice fixture (US ship, agreed date 2030-06-01); overridden per-test to vary `promisedAt`, `expectedAt`, `shipCountry`, etc.
- **`consentDueOpening` describe block** — the largest block. Covers: opening at agreed+30 days, grace-period exclusion, re-baselining against a new `promisedAt`, suppression when no date is held, and jurisdiction gating (opens for any FTC jurisdiction as shop-country *or* destination; never outside).
- **"the other openings" describe block** — table-driven test over `refundOwedOpening`, `amountMismatchOpening`, `paidWithoutHoldOpening`, `refundRefusedOpening`, `disputeOpening`. Validates `kind`, `routeSet` membership in `PERMISSION_SETS`, `openKeyOf` composite-key format, PII-free messages, and absence of `subjectId`. Also asserts `amountMismatchOpening` routes to `AuditDisplay` (admin-only) and `disputeOpening` uses `evidenceDueBy` as due-date when present.
- **`disputeAwaitingBankOpening` describe block** — asserts 75-day due offset and `noDueSoon: true`.
- **"refund openings" describe block** — checks that refusal wording does not offer cancellation, and that reversal is framed as money owed again.

## Relationships

- **`src/modules/shop-tasks/domain/openings.ts`** — the module under test; all opening functions and `FTC_JURISDICTIONS` are imported from here.
- **`src/kernel/permissions.ts`** — `PERMISSION_SETS` is imported to validate that every opening's `routeSet` is a known permission-set name.
- **`src/types/index.ts`** — provides `TaskKind` and `TaskLinkType` enums used in assertions.
- **`src/modules/tasks/index.ts`** — provides `openKeyOf` (used to verify the composite key convention) and the `SystemOpening` type.

## Notes

- All dates are pinned to 2030 (`NOW`, `AGREED`) so tests are deterministic; no `Date.now()` calls.
- `openKeyOf` is called with `(kind, link)` — the test asserts the key equals `` `${kind}:${link.type}:${link.id}` ``, encoding the composite-key contract.
- Jurisdiction logic is asymmetric: the shop's country *or* the destination country being in `FTC_JURISDICTIONS` is sufficient; both being outside is required to suppress the opening.
- The PII guard (`message` must not match `/@/`) is a project-wide convention tested here for every opening.
