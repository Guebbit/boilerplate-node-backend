---
source: scripts/audit/api-standards.yaml
sha256: 2016154c64d9f27c15426e735cda4d389eb7e78bd7e1355dd6a0bbba2e950ee9
generated_at: 2026-11-08T02:37:03.912102+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/api-standards.yaml

## Purpose

A rule registry that defines the set of testable API-conformance statements the audit suite evaluates. Each of the ten `scripts/audit/api-<standard>/SKILL.md` scripts reads this file and evaluates only the rules whose `standard` matches its own. It exists to keep audit criteria in one declarative place, separate from the mechanical linting (Spectral) and the compliance-rules registry.

## Key elements

- **`version`** – registry version (currently `1`); same top-level shape as `compliance-rules.yaml` (`version` + `rules`) but with different per-rule fields.
- **`rules[]`** – one entry per testable statement. Each rule carries:
  - `id` – `<standard>-<what>`, unique within the file.
  - `standard` – which RFC / AIP / Zalando / header-draft the rule belongs to.
  - `section` – human-readable part of the standard (name, not number).
  - `rule` – one sentence describing the expected behaviour of *this* API.
  - `source` – canonical URL of the RFC/draft clause the rule summarises.
  - `evidence` – list of contract JSONPaths (rooted at `openapi.yaml`), source-code globs, and docs pages where the auditor looks.
  - `lint` – `possible` (a mechanical finding may be reported) or `no` (judgement only). Never produces a Spectral rule.
  - `difference` – `null`, a single id, or a list of ids pointing to "Where we differ" rows in `docs/theory/api-standards.md`; matches are reported as `KNOWN-DIFFERENCE`, not violations.

## Relationships

- **`scripts/audit/api-<standard>/SKILL.md` (×10)** – the primary consumers; each reads this file and filters on `standard`.
- **`scripts/audit/compliance-rules.yaml`** – sibling registry with the same top-level shape (`version`, `rules`); different per-rule fields and a different audience (compliance vs. standard-conformance).
- **`openapi.yaml`** – the root for all `evidence` JSONPaths (`paths.*.get`, `paths.*.*.responses.429`, `x-error-codes`, etc.).
- **`docs/theory/api-standards.md`** – target of the `difference` field; the canonical list of deliberate divergences.
- **`docs/api/errors.md`**, **`docs/api/write-methods.md`**, **`docs/tools/security.md`**, **`docs/tools/idempotency.md`** – cited in `evidence` arrays as the documentation pages the auditor cross-references.
- **`src/infrastructure/http/response.ts`**, **`src/infrastructure/http/errors.ts`**, **`src/infrastructure/http/preconditions.ts`**, **`src/infrastructure/http/middlewares/cache.ts`**, **`src/infrastructure/http/middlewares/rate-limit.ts`**, **`src/infrastructure/http/middlewares/idempotency.ts`** – named in `evidence` as the implementation files the auditor inspects for each rule.

## Notes

- Rules that Spectral or a test suite already guards are deliberately **absent**; the owning SKILL.md names those guards and skips them.
- Rule budget per standard: 3–6 for Google AIP and Zalando, 2–4 for each RFC.
- `lint: possible` means a mechanical finding may be *reported* by the audit; it is never auto-converted into a Spectral rule.
- The `ratelimit-headers` standard references an IETF draft (draft-11 at time of writing); the comment in the file says to re-check the latest draft before relying on it.
- `difference` entries are resolved against ids in the "Where we differ" table in `docs/theory/api-standards.md`; a match downgrades the finding from violation to `KNOWN-DIFFERENCE`.
