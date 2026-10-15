---
source: src/modules/payments/domain/index.ts
sha256: 118f0e2187b6fa8fc48097249909383df7998076350efdd42beea5fdb18a8118
generated_at: 2026-10-15T11:25:04.750569+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/index.ts

## Purpose
Barrel file for the payments domain layer. It re-exports the pure status vocabulary and display-status helpers so that consumers (presenter, services, repository) import from a single entry point rather than reaching into individual domain files. The domain layer is lint-guaranteed free of Express, Mongoose, and every other tier.

## Key elements
- **`CONFIRMABLE_PAYMENT_STATUSES`, `SETTLEABLE_PAYMENT_STATUSES`, `SUCCESS_SETTLEABLE_PAYMENT_STATUSES`, `REAPABLE_PAYMENT_STATUSES`, `REFUNDABLE_PAYMENT_STATUS`, `OPEN_REFUND_STATUSES`** — Re-exported from `./lifecycle`. These are the six status constants that define which payment states permit confirm, settle, success-settle, reap, refund, and open-refund transitions respectively.
- **`displayStatusOf`, `displayStatusFilter`** — Re-exported from `./display-status`. `displayStatusOf` maps a payment record to its display label; `displayStatusFilter` returns the query that selects payments by that label.
- **`DisplayStatusInput`** — Re-exported type from `./display-status`; the input shape accepted by the display-status functions.

## Relationships
- **`src/modules/payments/domain/lifecycle.ts`** — Source of all six status-constant exports; this file is the public surface for them.
- **`src/modules/payments/domain/display-status.ts`** — Source of `displayStatusOf`, `displayStatusFilter`, and `DisplayStatusInput`.
- **`src/modules/payments/index.ts`** — Upstream barrel that re-exports this domain index alongside presenter, repository, and service exports, giving external consumers a single `payments` import.
- **`src/modules/payments/presenter.ts`, `repository.ts`, `services/*.ts`** — Consumers that import status constants or display-status helpers through this file (or through `payments/index.ts`).
- **`src/modules/payments/tests/unit/display-status.test.ts`** — Unit test that exercises `displayStatusOf` / `displayStatusFilter` via this barrel.

## Notes
- The file contains no logic of its own — it is purely a re-export surface. All behavior lives in `./lifecycle` and `./display-status`.
- The domain folder exists because the status vocabulary is six entries wide, exceeding the project's threshold for a scattered constant (see `docs/theory/domain-layer.md` for the rule).
- Lint enforces that nothing in this directory imports Express, Mongoose, or other-tier modules; adding such an import here would break that guarantee.
