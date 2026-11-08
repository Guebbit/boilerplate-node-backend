---
source: src/modules/tasks/domain/system.ts
sha256: 4522d0de77a066de0561e07917a790a12a3c5baf7f3890fd25a17043d3a9a2e5
generated_at: 2026-11-08T08:33:44.797178+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/domain/system.ts

## Purpose

Pure-data factory module that turns a producer's event into the first facts of a system task — the `SystemOpening` interface and its two concrete factories. It deliberately contains no side effects: no dedup, no writes, no persistence. Those concerns belong to the service layer.

## Key elements

- **`SystemOpening`** (interface) — the shape every system-task opener must produce: `kind`, `routeSet` (permission set that receives it), `link` (record type + id), optional `work` (staff-frontend path), optional `subjectId`, `subject`/`message` (inbox text), `dueAt`, and optional `noDueSoon` flag.
- **`REVIEW_WINDOW_MS`** (constant, not exported) — 72 hours; the deadline window shared by both system openings.
- **`accountReviewOpening(userId, now)`** — builds a `SystemOpening` for `TaskKind.account_review`, routed to the `UserBanning` set, due in 72 h.
- **`exportFailedOpening(failure, now)`** — builds a `SystemOpening` for `TaskKind.export_failed`, routed to the `UserErasure` set, due in 72 h.

## Relationships

- **`src/types/index.ts`** — imports `TaskKind` and `TaskLinkType` enums used in the interface and factories.
- **`src/domain-primitives/time.ts`** — imports `HOUR_MS` to compute the 72-hour review window.
- **`src/modules/tasks/domain/index.ts`** — barrel file that re-exports this module's public API.
- **`src/modules/tasks/services/system.ts`** — the consumer: takes the produced `SystemOpening`, applies dedup, and performs the write. This file is upstream of it.
- **`src/modules/tasks/tests/unit/system-openings.test.ts`** — unit tests for the two factory functions.
- **`src/modules/tasks/tests/unit/routing.test.ts`** — exercises `routeSet` values produced here.
- **`src/modules/shop-tasks/tests/unit/openings.test.ts`** — analogous tests in the shop-tasks module, which hands its own `SystemOpening` values to the same service (per the module doc: "a module that adds kinds hands its own `SystemOpening` to `taskService`").

## Notes

- `work` is an opaque staff-frontend path (e.g. `orders/<id>`); only the opener knows the correct screen. Do not parse or validate it here.
- Text (`subject`, `message`) references ids, never names or addresses — the linked record carries the human-readable details.
- `noDueSoon` is an optional boolean-literal (`true` only), not a `boolean`; its presence suppresses the "due soon" reminder for long-waiting tasks.
- New task kinds are added by other modules (e.g. `shop-tasks`) that construct their own `SystemOpening` and pass it to the service; this file is not a closed registry.
