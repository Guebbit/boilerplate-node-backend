---
source: src/modules/feedback/tests/integration/export.test.ts
sha256: 6455d7c93529c7bee4084ea48537be486032e25497e258635f79a24c356966ce
generated_at: 2026-10-14T15:52:01.594213+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/integration/export.test.ts

## Purpose

Integration tests for the feedback section of a personal-data export. They verify the GDPR Art. 12(6) guard: tickets are matched to an export by email address, so they must only be included when the requesting account has actually verified that address. They also confirm that staff-only fields never leak into the export payload.

## Key elements

- **`collect`** — destructured from `feedbackModule.personalData[0]`; the same entry-point the account module uses to pull the feedback section. All tests invoke it with a `subject` object.
- **`subject(emailVerified: boolean)`** — helper that builds a minimal subject record (fixed `userId`, `email: 'victim@example.com'`) with a toggleable `emailVerified` flag.
- **`fileTicket()`** — calls `create` from the feedback service to seed one ticket under the victim's address.
- **`describe('the feedback section of an export', …)`** — four test cases:
  1. Verified email → tickets included.
  2. `status` and `respondedAt` exported; `adminNotes` never present.
  3. Unverified email → section is `undefined`.
  4. `NODE_EXPORT_INCLUDE_FEEDBACK=0` → section is `undefined` even with a verified email.

## Relationships

- **`src/modules/feedback/module.ts`** — imported as `feedbackModule`; the test calls `collect` from `feedbackModule.personalData[0]`, mirroring how the account export reaches the feedback section.
- **`src/modules/feedback/service.ts`** — provides `create` (to seed tickets) and `updateStatus` (to set `status`, `adminNotes`, `respondedAt` before asserting export shape).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs once at module load to prepare a clean database for the integration run.
- **`tests/support/environment.ts`** — `setEnvironment` toggles `NODE_EXPORT_INCLUDE_FEEDBACK` per test to exercise the feature-flag branch.

## Notes

- `setupTestDb()` is called at the **top of the module**, not inside a `beforeAll` hook — it must run before any `describe` body evaluates.
- The `NODE_EXPORT_INCLUDE_FEEDBACK` flag is set to `'1'` in a `beforeEach`, then overridden to `'0'` in the last test; ordering matters if tests are re-arranged.
- The file deliberately does **not** test the full export pipeline (manifest → sections → serialization); it tests only the `collect` function in isolation, treating the surrounding export orchestration as a separate concern.
