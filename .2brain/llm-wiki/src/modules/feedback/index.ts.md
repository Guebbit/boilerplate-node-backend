---
source: src/modules/feedback/index.ts
sha256: 056feb808ffb915241517a98d57454b5d3b393f95c54837bd21434eb3d83afad
generated_at: 2026-09-23T18:39:53.797539+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/index.ts

## Purpose

Public barrel for the `feedback` module. It is the **only** entry point sibling modules may import from (enforced by the strategic DDD import rule, `docs/theory/strategic-ddd.md §5`). It re-exports the module's public API so consumers never reach into internal files directly.

## Key elements

- **`export * from './service'`** — re-exports all values and types from `service.ts`.
- **`export * from './emails'`** — re-exports all values and types from `emails.ts`.
- **`export type * from './model'`** — re-exports **type-only** declarations from `model.ts` (no runtime values are pulled in).

## Relationships

| Neighbor                          | Interaction                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/modules/feedback/service.ts` | Re-exported in full (values + types). This is the primary functional surface of the module.              |
| `src/modules/feedback/emails.ts`  | Re-exported in full (values + types). Provides email-related exports.                                    |
| `src/modules/feedback/model.ts`   | Re-exported as **types only** (`export type *`), keeping its runtime footprint out of the public barrel. |

## Notes

- Sibling modules must import from this file (or the module name `src/modules/feedback`), **not** from `service.ts`, `emails.ts`, or `model.ts` directly.
- The `export type *` for `model` is deliberate: it keeps type declarations available to consumers without importing any runtime code from that file. Do not "upgrade" it to a plain `export *` unless `model.ts` actually gains runtime exports that should be public.
- Full module documentation lives at `docs/modules/feedback.md`.
