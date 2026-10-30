---
source: src/modules/orders/jobs.generated.ts
sha256: 2b092d56e62a5b57805726716b9bc685a72b75492e875937e4333a2d2bec5b85
generated_at: 2026-10-29T04:42:39.280112+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/jobs.generated.ts

## Purpose

Auto-generated data file that declares the scheduled jobs for the orders module (names, cron schedules, summaries) as a typed constant. It exists so that `jobs.ts` can iterate over job metadata without hard-coding it, and so the single source of truth (`module.yaml`) can be regenerated cleanly.

## Key elements

- **`ordersJobData`** — `as const` exported object mapping job keys to `{ name, schedule, summary }`. Currently defines one entry:
  - `reapOrders` → cron `10 2 * * *` (daily 02:10), cron-named `reap:orders`. Anonymizes PII past its retention window and clears staff text on expired timeline rows.

## Relationships

- **`src/modules/orders/jobs.ts`** — Imports `ordersJobData` to pair each declared job with its handler implementation. This file provides the "what/schedule"; `jobs.ts` provides the "what runs."

## Notes

- **Do not edit.** Changes must go to `src/modules/orders/module.yaml` followed by `npm run regenerate`.
- The `as const` assertion means `schedule` and `name` are literal types; consumers can compare them at compile time without a string union.
- The `summary` field is documentation-only (likely surfaced in admin UI or help text); it does not affect scheduling.
