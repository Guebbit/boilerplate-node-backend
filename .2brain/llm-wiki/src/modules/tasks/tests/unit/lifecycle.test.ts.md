---
source: src/modules/tasks/tests/unit/lifecycle.test.ts
sha256: 7bd0409686fcb66e904d3bc56602e7e6f52fba2079d93e8a8109ed4d5b3dca6f
generated_at: 2026-11-08T08:41:29.098234+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/unit/lifecycle.test.ts

## Purpose

Unit tests for the task-lifecycle domain functions (status transitions, stamping rules, and the dedup key). The module is pure—no mocks, no database—so this file exercises the state-machine logic directly to verify which transitions are legal, what fields each move sets or unsets, and when a transition is refused.

## Key elements

- **`facts(overrides)`** — local helper that builds a minimal `TaskFacts` object (defaults: `status: new`, `assigned: false`, `kind: 'contact'`) spread with caller overrides.
- **`describe('initialTaskStatus')`** — table-driven check that a suspected-spam flag maps to `TaskStatus.spam` and otherwise to `TaskStatus.new`.
- **`describe('isOpen')`** — verifies `isOpen` returns `true` for `new`/`in_progress` and `false` for `resolved`/`spam`.
- **`describe('resolve')`** — asserts the patch sets `status→resolved`, `resolution:'staff'`, `closedAt`, `respondedAt`, and unsets `openKey`; confirms it preserves an *earlier* `closedAt`/`respondedAt`; refuses when already resolved (`'already_resolved'`).
- **`describe('markSpam')`** — asserts the patch sets `status→spam`, `resolution:'spam'`, `closedAt` (no `respondedAt`), unsets `openKey`; refuses when already spam (`'already_spam'`).
- **`describe('reopen')`** — checks target status depends on `assigned` (`new` vs `in_progress`); confirms `closedAt`/`resolution` are unset; verifies `openKey` is restored only when a `link` exists (via `openKeyOf`); refuses an already-open task (`'already_open'`).
- **`describe('openKeyOf')`** — single assertion that the dedup key is the colon-joined string `kind:link.type:link.id`.

## Relationships

- **`src/modules/tasks/domain/index.ts`** — barrel that re-exports the functions under test (`initialTaskStatus`, `isOpen`, `markSpam`, `openKeyOf`, `reopen`, `resolve`, `TaskFacts`). The test imports from this barrel (`../../domain`).
- **`src/modules/tasks/domain/lifecycle.ts`** — the actual implementation of every function the test exercises. This file is the sole unit under test.
- **`src/types/index.ts`** — provides the `TaskStatus` enum (`new`, `in_progress`, `resolved`, `spam`) used throughout the assertions.

## Notes

- Fixed sentinel dates (`NOW`, `EARLIER`) are used instead of `Date.now()` so assertions are deterministic and the "preserve earlier stamp" case is testable.
- Refusal outcomes are a discriminant union (`{ refusal: '…' }`) rather than thrown errors; the tests assert on the literal string codes (`'already_resolved'`, `'already_spam'`, `'already_open'`).
- The test file is explicitly pure: no Jest mocks, no DI, no DB. If a future refactor introduces dependencies, this file will need updating.
- `openKey` restoration on `reopen` is conditional on a `link` being present—tasks without a link do **not** get an `openKey` set back.
