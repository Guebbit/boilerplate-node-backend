---
source: src/modules/example/index.ts
source_sha256: 7d8a1a117bfae846e3f8b7af11b054b7682e3ab53de72d02b542915b09ad916a
context_sha256: 3cc0d5ac501e6f26bbf30eaba9bb3c41a46c6d4ee6ac0e6519ed860b0ebaab1d
generated_at: 2026-11-22T05:09:03.975022+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/index.ts

## Purpose
The public barrel of the `example` module. It is the only surface sibling modules may import, re-exporting the module's services, domain rules, events, emails and model types (the example service, its domain rules and the publish event).

## Key elements
- `export * from './services'` — the example service(s).
- `export * from './domain'` — domain rules.
- `export * from './events'` — events, including the publish event.
- `export * from './emails'` — email definitions.
- `export type * from './model'` — model **types only**, no runtime value.

## Relationships
- Re-exports `src/modules/example/domain/index.ts`, `src/modules/example/emails.ts`, `src/modules/example/events.ts` and `src/modules/example/services/index.ts` in full.
- Re-exports only the types of `src/modules/example/model.ts`, so the model's runtime value stays private.
- `tests/cross-cutting/webhook-event-producers.test.ts` and `tests/unit/infrastructure/adapters/mailer-templates.test.ts` are linked to this file in the dependency graph. Their specific interactions are not visible in this file.

## Notes
- Never export a repository, the model's runtime value, a wiring file or `factories.ts` from this barrel. The module doc comment states this rule.
- It contains no logic. Changing what the module exposes means editing these re-exports.
- The file's doc comment points to a "published language — the barrel" section of the project's strategic DDD documentation.
