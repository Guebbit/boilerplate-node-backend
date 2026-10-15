---
source: src/modules/feedback/domain/index.ts
sha256: 0f502be80ccba7c4404e2d58d63bc33907416ce84287e307027639c65ba25159
generated_at: 2026-10-15T10:31:46.032591+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/domain/index.ts

## Purpose

Barrel file for the Feedback domain layer. It re-exports the pure business rules (status vocabulary and lifecycle helpers) so consumers can import from a single `domain/` path without reaching into sub-files. The dedicated folder exists because the status vocabulary is 4-wide—past the project's threshold that makes inlining into `service.ts` insufficient.

## Key elements

- **`initialFeedbackStatus`** — re-exported from `./lifecycle`; provides the default status for a new feedback item.
- **`shouldStampRespondedAt`** — re-exported from `./lifecycle`; pure decision function for whether a `respondedAt` timestamp should be set.

## Relationships

- **`src/modules/feedback/domain/lifecycle.ts`** — sole source of both re-exports; this file adds no logic of its own.
- **`src/modules/feedback/service.ts`** — the service tier imports the domain rules through this barrel (or through `src/modules/feedback/index.ts`); it never imports `lifecycle.ts` directly.
- **`src/modules/feedback/index.ts`** — parent module barrel that re-exports the domain layer outward, making `domain/index.ts` the intermediate hop.

## Notes

- Lint-enforced: this layer must remain free of Express, Mongoose, and any other tier import. Adding a framework dependency here is a hard violation.
- The 4-wide status vocabulary is the stated reason this folder exists; if the vocabulary shrinks below the project threshold, the folder may be collapsed back into `service.ts`. See `docs/theory/domain-layer.md` for the rule.
