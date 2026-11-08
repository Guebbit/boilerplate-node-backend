---
source: src/modules/tasks/tests/unit/system-openings.test.ts
sha256: ac8716669cb05428657ae0f74455d4deab482502dc8d183b028f68a42bcc1b1b
generated_at: 2026-11-08T08:42:28.303668+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/unit/system-openings.test.ts

## Purpose

Unit tests for the "system openings" that the `tasks` module owns — the functions defined in `domain/system.ts` and re-exported via `domain/index.ts`. The tests are pure (no mocks, no database) and live beside the module they verify. They assert that each opening correctly names its task kind, links to the right record, declares a valid permission route set, and that the `clear` operation produces the expected resolution shape.

## Key elements

- **`describe('the openings')`** — parameterised table test over `accountReviewOpening` and `exportFailedOpening`:
  - Validates that each opening's `kind` is a member of `TaskKind` and its `routeSet` name exists in `PERMISSION_SETS`.
  - Checks `openKeyOf(kind, link)` serialises to the canonical `kind:link.type:link.id` string.
  - Asserts route-set mapping: account review → `'UserBanning'`, failed export → `'UserErasure'`, each with the correct `TaskLinkType` and id.
  - Asserts `subjectId` is the user id for both openings.
  - Asserts `opening.message` never contains an `@` (no email/name leakage).

- **`describe('clear — the system closes what the situation no longer owes')`** — verifies `clear(NOW)` returns exactly `{ set: { status: 'resolved', resolution: 'cleared', closedAt: NOW }, unset: ['openKey'] }`, i.e. a field-update patch plus a list of keys to delete.

- **`NOW`** — a fixed `Date('2030-05-01T10:00:00Z')` used as the deterministic timestamp throughout.

## Relationships

- **`src/modules/tasks/domain/index.ts`** — the test imports `accountReviewOpening`, `clear`, `exportFailedOpening`, `openKeyOf`, and the `SystemOpening` type from this barrel; these are the SUTs.
- **`src/modules/tasks/domain/system.ts`** — the actual implementation file that the docstring identifies as the source of the tested functions (re-exported through the domain index).
- **`src/kernel/permissions.ts`** — provides `PERMISSION_SETS`; the test uses it to assert every declared `routeSet` is a real, registered permission set.
- **`src/types/index.ts`** — provides `TaskKind` and `TaskLinkType`; the test uses them to validate that an opening's `kind` and `link.type` are members of the closed enums.

## Notes

- The test is deliberately free of mocks and database calls (stated in the module docstring). If you add I/O to `system.ts`, this test will no longer be sufficient.
- The `clear` return shape (`{ set, unset }`) is a patch-style contract: `set` holds field values to write, `unset` lists key names to remove. Downstream code consuming this must handle both parts.
- The privacy assertion (no `@` in `message`) is a policy check, not a structural one — a message that embeds a user's full name without an `@` would still pass.
