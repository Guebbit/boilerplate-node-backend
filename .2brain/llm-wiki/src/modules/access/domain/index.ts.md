---
source: src/modules/access/domain/index.ts
sha256: 53adce93c49cb92e8735c4899243d63a175dd260fc1afdf46e186bc79c8f13f7
generated_at: 2026-11-14T18:25:15.034864+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/domain/index.ts

## Purpose

Barrel file for the access **domain** layer. It re-exports the pure protection rules from `./protection` so that other modules (e.g. `users`, money) can consume access logic without a DB lookup or any framework dependency. A lint rule guarantees this file and its subtree remain free of Express, Mongoose, and every other tier.

## Key elements

- **Re-exports from `./protection`:**
  - `isOwnThing` — pure predicate checking ownership.
  - `mayChangeAccount` — pure rule for whether an account change is permitted.
  - `ownOrderFlag` — pure rule for order-ownership flagging.

No local logic is defined here; the file exists solely to provide a stable import surface for the domain layer.

## Relationships

- **`src/modules/access/domain/protection.ts`** — the sole source module; all three exports are re-exported verbatim from here.
- **`src/modules/access/index.ts`** — parent barrel that (presumably) re-exports this module so consumers can import from the module root.
- **`src/modules/access/services/protection.ts`** — the *service*-tier counterpart; handles lookup-dependent protection logic, in contrast to the pure rules exposed here.
- **`src/modules/access/tests/unit/protection.test.ts`** — unit tests targeting the protection rules re-exported by this file.

## Notes

- This file contains **no logic**—only `export { … } from` statements. Any behavioral change lives in `./protection`.
- The "lint-guaranteed" purity claim means adding a framework import here will fail a lint rule; keep the file a pure re-export barrel.
- Refer to `docs/theory/domain-layer.md` for the layering contract that justifies separating these pure rules from the service tier.
