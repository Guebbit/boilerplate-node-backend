---
source: tests/unit/infrastructure/config/ops-rules-schemas.test.ts
sha256: 8c54400c5f078887f713f07a6e537aaf43ebb908c4b30d566dbb8702417dc326
generated_at: 2026-11-08T10:11:48.209930+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/config/ops-rules-schemas.test.ts

## Purpose

Validates that the six committed ops-rules YAML files (`jobs`, `metrics`, `images`, `outbox`, `defaults`, `step-up`) pass their respective Zod schemas, and probes each schema's rejection rules with deliberately malformed inputs. It does not pin values — value correctness is asserted at the call sites.

## Key elements

- **`yamlOf(relative)`** — helper that reads a repo-relative YAML file from disk and returns the parsed object; used to feed committed files into schema validation.
- **`job` / `counter`** — minimal valid fixtures (one job entry, one metric entry) mutated per test to break a single field.
- **`images(formats)`** — wraps a formats array in the expected `{ images: { thumbnailVersion, formats } }` document shape.
- **`describe('the committed ops rules files')`** — table-driven test that asserts each YAML file on disk `safeParse`s successfully against its schema.
- **`describe('jobsBlockSchema')`** — tests name pattern, cron schedule format (5-field, step/list), and rejection of unknown keys.
- **`describe('metricsSchema')`** — tests `_total` suffix requirement for counters, bucket requirement for histograms, minimum help-text length, and duplicate-name rejection.
- **`describe('imagesSchema')`** — tests duplicate MIME/alias rejection and byte-range (0–255) validation.
- **`describe('outbox, defaults and step-up')`** — tests positive-integer enforcement and closed-tier-set validation.

## Relationships

- **`src/infrastructure/config/shared-rules/{defaults,images,jobs,metrics,outbox,step-up}.ts`** — the modules under test; this file imports their exported Zod schemas and exercises both the "accept" and "refuse" branches.
- **`tests/support/paths.ts`** — provides `REPO_ROOT` so the `yamlOf` helper can resolve committed YAML files relative to the repository root regardless of the working directory.

## Notes

- These tests hit the filesystem (`readFileSync`), so they depend on the YAML files existing at their committed paths; they will fail if the repo layout changes.
- `jobsSchema` (full document) is only exercised via the committed-file table; `jobsBlockSchema` (single block) gets the granular rejection tests. Don't confuse the two.
- All schema calls use `safeParse` (non-throwing), so a schema rejection is observed as `.success === false` rather than an exception.
