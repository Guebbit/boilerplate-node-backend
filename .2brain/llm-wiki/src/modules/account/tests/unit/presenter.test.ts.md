---
source: src/modules/account/tests/unit/presenter.test.ts
source_sha256: 875ac0cf97a4ab7dee82b411113c97aaf87b4c7dc9e0b07c1fc698a8346aa973
context_sha256: eff64750cdd494d2e3e3015a6e8ff03318a99623e66b58e986e909b1e1f02f70
generated_at: 2026-11-22T04:07:27.300344+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/presenter.test.ts

## Purpose
Unit tests for the account presenter, treated as a pure mapping from a stored session row or export request to its wire shape. The tests also assert that the session credential (`tokenHash`) never appears in the output.

## Key elements
- `row`: a `SessionRow` stub (built with `asStub`) with a fixed `familyId`, dates, device and a `tokenHash` of `'a-credential-digest'`. It is used to prove the credential does not leak.
- `describe('presentSession')`:
  - Maps `familyId` to `id`, `startedAt` to `createdAt`, and the passed-in date to `expiration`. It also maps `lastUsedAt` and `device`, and sets `current` from the third argument.
  - When `lastUsedAt` and `device` are undefined, the keys are omitted. The serialized output never contains the credential string.
- `describe('presentExportSession')`:
  - Uses the row's own `expiresAt` as `expiration`.
  - Has no `current` property.
- `describe('presentExport')`, using an `exportRow` with `_id`, `createdAt` and `expiresAt`:
  - Returns `id`, `status`, `createdAt` and `actions`.
  - Includes `expiresAt` only when the status is `ready`. It is absent for `failed`.
  - `actions.download` is true only when `ready`.
  - `actions.request` is false for `building` and true for `ready` and `failed`.

## Relationships
- Tests `presentSession`, `presentExportSession` and `presentExport` from `src/modules/account/presenter.ts`.
- Imports the `SessionRow` type from `src/modules/account/repository.ts`, used only for typing the stub rows.
- Uses `asStub` from `tests/support/stub.ts` (imported as `@tests/stub`) to build partial rows as typed stubs.

## Notes
- The tests are pure: there is no database or mocking, and `Types.ObjectId` is used only to produce fixed ids.
- `presentSession` takes the expiration date as a separate argument, whereas `presentExportSession` reads it from the row.
