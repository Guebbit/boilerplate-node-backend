---
source: src/modules/access/domain/index.ts
source_sha256: 00a64b7f73f3736b632eb6069bad5674c608b2b47fe1ccf12ea9faa5e0f674d5
context_sha256: af659e445d49e136ab9b998cd56abc75f9c42b689c119340bced135a519f371d
generated_at: 2026-11-22T03:15:45.802017+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/domain/index.ts

## Purpose
Barrel file for the Access module's domain layer. It re-exports the pure protection rules so that other modules (`users` and the money modules) can ask them without a lookup. Per its doc comment, the domain layer holds pure rules only and is lint-guaranteed to be free of Express, Mongoose and every tier.

## Key elements
- `isOwnThing`: re-exported from `./protection`.
- `mayChangeAccount`: re-exported from `./protection`.
- `ownOrderFlag`: re-exported from `./protection`.

The file defines no logic of its own.

## Relationships
- `src/modules/access/domain/protection.ts`: the source of all three re-exported rules.
- `src/modules/access/index.ts`: a neighbor in the module graph, presumably the module's public entry point. The domain barrel's content does not show how the two connect.
- `src/modules/access/services/protection.ts` and `src/modules/access/tests/unit/protection.test.ts`: related through the dependency graph, likely as consumers of these rules. The barrel itself shows no direct interaction.

## Notes
- Add new protection rules to `./protection` and re-export them here, so consumers have a single domain entry point.
- The doc comment points to a "the rule enforced by lint" section of a domain-layer document for the lint rule behind the domain-layer restriction.
