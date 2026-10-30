---
source: src/modules/tickets/tests/unit/lifecycle.test.ts
sha256: faffd2bbce323c0a3c6770c12cf026b8cb55332102d75a49661c4dfe34f1aadc
generated_at: 2026-10-29T06:08:57.351535+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/unit/lifecycle.test.ts

## Purpose

Unit tests for the pure ticket-lifecycle domain functions (status transitions, timestamp stamps, and the dedup key). No mocks, no database — only deterministic assertions against the decision objects the domain layer returns.

## Key elements

- **`facts(overrides?)`** — local helper that builds a `TicketFacts` object with sane defaults (`new`, unassigned, `contact` kind) and spreads caller overrides.
- **`describe('initialTicketStatus', …)`** — verifies a suspected-spam ticket starts as `spam`; otherwise `new`.
- **`describe('isOpen', …)`** — table-driven check that `new` and `in_progress` are open; `resolved` and `spam` are not.
- **`describe('resolve', …)`** — asserts allowed source statuses, the exact `patch.set` (status, resolution, closedAt, respondedAt) and `patch.unset` (openKey); that pre-existing `closedAt`/`respondedAt` are preserved; and refusal via `{ refusal: 'already_resolved' }`.
- **`describe('markSpam', …)`** — same shape checks minus `respondedAt`; refusal via `{ refusal: 'already_spam' }`.
- **`describe('reopen', …)`** — target status depends on `assigned` (→ `in_progress`) or not (→ `new`); clears `closedAt`/`resolution`; restores `openKey` only for linked tickets (e.g. `manual_refund_owed:refund:r1`); refusal via `{ refusal: 'already_open' }`.
- **`describe('openKeyOf', …)`** — pins the dedup-key format `kind:linkType:linkId`.

## Relationships

- **`src/modules/tickets/domain/lifecycle.ts`** — the module under test; all exported functions (`initialTicketStatus`, `isOpen`, `markSpam`, `openKeyOf`, `reopen`, `resolve`) and the `TicketFacts` type are exercised here.
- **`src/modules/tickets/domain/index.ts`** — barrel re-export; the test imports from `'../../domain'` rather than the lifecycle file directly, so the barrel's public surface is implicitly validated.
- **`src/types/index.ts`** — provides the `TicketStatus` enum (imported via the `@types` alias) used throughout for expected values.

## Notes

- Fixed sentinel dates (`NOW` = 2030-05-01, `EARLIER` = 2030-04-01) make every assertion deterministic; no `Date.now()` calls appear.
- Assertions target the **decision object shape** (`{ patch: { set, unset } }` or `{ refusal }`), not side-effects — the test never mutates state.
- The `openKey` restoration in `reopen` is conditional on `kind` + `link` being present; a plain visitor-message ticket produces no `openKey` in the patch.
