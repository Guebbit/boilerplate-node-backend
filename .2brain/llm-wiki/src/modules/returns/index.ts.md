---
source: src/modules/returns/index.ts
source_sha256: 6af531a72a1d99f749a7ca5e654a1d1b8794d76e435052746dcba93f2eee818d
context_sha256: bc966eff0f4f543d00bf4721e564ea97a4f954bcd74f6dde373e1fa13f053ed1
generated_at: 2026-11-22T07:25:16.992615+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/index.ts

## Purpose
Public barrel for the Returns module. It defines the only surface sibling modules may import. Internal pieces stay hidden: `returnRepository` and the model's runtime are not exported. Return operations must go through the service, so a return is only opened, decided or received through rules that make each step exactly-once.

## Key elements
- `export * from './services'` — the service layer, the sanctioned entry point for acting on returns.
- `export * from './domain'` — domain exports.
- `export * from './events'` — return-related events.
- `export * from './emails'` — return-related emails.
- `export type * from './model'` — the model's **types only**; no runtime values leak.

## Relationships
- Re-exports from `src/modules/returns/services/index.ts`, `src/modules/returns/domain/index.ts`, `src/modules/returns/events.ts`, `src/modules/returns/emails.ts` and `src/modules/returns/model.ts` (types only).
- Its listed neighbors outside the module are `shop-tasks` (`src/modules/shop-tasks/module.ts`, `src/modules/shop-tasks/services/digest.ts`, `src/modules/shop-tasks/services/work-summary.ts`, and the `src/modules/shop-tasks/tests/integration/staff-notices.test.ts` integration test) and `stats` (`src/modules/stats/services/breakdowns.ts`, `src/modules/stats/services/sales.ts`). These are consistent with consuming the module through this barrel, as the header requires of siblings. The file itself does not show what each one uses.
- `tests/cross-cutting/webhook-event-producers.test.ts` and `tests/unit/infrastructure/adapters/mailer-templates.test.ts` are also neighbors. They plausibly touch the events and emails exports, but the barrel does not show this.

## Notes
- Sibling modules should import from this barrel, not from internal paths.
- `returnRepository` is intentionally not re-exported. Persistence access is only available through the services.
- Model exports use `export type *`, so they can be used as types but not as runtime values.
- The file's header points to a "published language — the barrel" section of the project's strategic DDD documentation for the design rationale.
