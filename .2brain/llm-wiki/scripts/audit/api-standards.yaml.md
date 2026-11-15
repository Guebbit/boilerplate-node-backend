---
source: scripts/audit/api-standards.yaml
sha256: d15acf05a2e7e2305aeb32bbb7bb34b24e409e8a5557e8986e191d7ce04ac77c
generated_at: 2026-11-14T17:19:37.811787+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/api-standards.yaml

## Purpose

Registry of API-standards rules consumed by two audit skills (`api-http/SKILL.md` for eight HTTP web standards and `api-style/SKILL.md` for one style guide). It declares, per rule, what the standard mandates, any house promise that goes beyond the standard, where to find evidence in the repo, and how to classify a known deviation. It is a human-authored judgement list, not a machine-lint config.

## Key elements

- **Top shape** — `version` (integer) + `rules` (list). Same envelope as `compliance-rules.yaml`, different per-rule schema.
- **Per-rule fields** — `id` (unique slug), `standard` (rfc9110, rfc9111, rfc9457, rfc5789, rfc7396, rfc6585, ratelimit-headers, idempotency-key, google-aip, zalando), `section`, `rule` (BCP 14 keyword in caps; a keyword-less clause is judged as MUST), `house` (API-specific promise with a `docs/…#anchor` citation, or `null`), `source` (RFC/spec URL(s)), `evidence` (contract JSONPaths into `openapi.yaml`, code paths, doc pages), `lint` (`possible` = a mechanical finding is *reported* only, never auto-converted to a Spectral rule; `no` = judgement only), `difference` (`null`, a single id, or a list of ids pointing to "Where we differ" rows in `docs/theory/api-standards.md`; reported as KNOWN-DIFFERENCE, not a violation).
- **Budget** — 3–6 rules per style guide, 2–4 per RFC, up to 7 for `idempotency-key`.
- **Exclusion rule** — clauses already guarded by Spectral or a test are *not* listed here; the audit SKILL.md names those guards and skips them.

## Relationships

- **scripts/audit/compliance-rules.yaml** — shares the `version` / `rules` envelope; this file is the sibling for standards-based rules, that file for compliance rules.
- **docs/theory/api-standards.md** — the `difference` ids resolve to "Where we differ" rows in this document; it is the authoritative list of accepted deviations.
- **docs/api/errors.md** — cited in `house` clauses and `evidence` for every `rfc9457`-family rule.
- **docs/api/write-methods.md** — cited in `house` clauses for `rfc9110` method/status-code rules.
- **docs/tools/idempotency.md** — context for `idempotency-key` rules (up to 7 entries, the largest budget).
- **openapi.yaml** — the root contract that `evidence` JSONPaths resolve against (e.g. `paths.*.get`, `paths.*.post.responses`, `x-error-codes`).
- **src/infrastructure/http/response.ts** — appears in `evidence` for problem-details and cache-header rules; it is the code that `rejectResponse` and the response builder live in.
- **src/infrastructure/http/errors.ts** — evidence target for `rfc9457` rules (error construction).
- **src/infrastructure/http/preconditions.ts** — evidence for conditional-request / ETag rules.
- **src/infrastructure/http/middlewares/cache.ts** — evidence for `rfc9111` caching rules.
- **src/infrastructure/http/middlewares/idempotency.ts** — implementation behind `idempotency-key` rules.
- **src/infrastructure/http/middlewares/rate-limit.ts** — implementation behind `ratelimit-headers` rules.
- **scripts/contracts/response-headers.ts** — contract-level checks that overlap with `lint: possible` rules (reported, not enforced).

## Notes

- A `MAY` clause in the `rule` field **cannot fail** the audit; it is informational. A clause stated without a BCP 14 keyword (e.g. RFC 7396's algorithm) is judged as a MUST.
- `house` must end with a `docs/…#anchor` citation; if the page does not exist, the `house` clause is invalid. Exceptions are written *into* the sentence, not via `difference`.
- `lint: possible` means the audit *may* surface a mechanical finding, but it is never auto-promoted to a Spectral rule — that is a separate, explicit decision.
- `difference` entries are reported as **KNOWN-DIFFERENCE**, which is distinct from a violation; the audit still lists them so they are visible in the report.
- The file is read by AI skills, not by a build step or test runner; a typo in an `evidence` path will not break CI, only the audit's ability to locate the code.
