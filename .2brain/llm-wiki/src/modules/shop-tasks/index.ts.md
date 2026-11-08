---
source: src/modules/shop-tasks/index.ts
sha256: 7017abae1b5262120192ae4821f87f3af4f85a881fc5e85c3b5fe8180b98df73
generated_at: 2026-11-08T08:14:50.099565+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/index.ts

## Purpose

Public barrel for the shop-tasks module. It is the **only** import surface available to sibling modules (per the rule in `docs/theory/strategic-ddd.md` §5). Because the module owns no domain event of its own, the barrel simply re-exports the openings rules, the service, and the digest e-mail.

## Key elements

- `export * from './domain'` — re-exports the openings rules (domain layer).
- `export * from './services'` — re-exports the shop-tasks service.
- `export * from './emails'` — re-exports the digest e-mail.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/shop-tasks/domain/index.ts` | Re-exported wholesale; provides the openings rules. |
| `src/modules/shop-tasks/services/index.ts` | Re-exported wholesale; provides the service layer. |
| `src/modules/shop-tasks/emails.ts` | Re-exported wholesale; provides the digest e-mail. |

This file introduces no logic of its own; it is purely a re-export façade.

## Notes

- Sibling modules **must** import through this barrel, not directly from the sub-files. Direct imports of `./domain`, `./services`, or `./emails` from outside the module violate the strategic-Ddd boundary rule.
- The module explicitly owns **no event**; any future addition of an event would change what this barrel is expected to publish.
- Reference doc: `docs/modules/shop-tasks.md`.
