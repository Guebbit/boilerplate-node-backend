---
source: scripts/audit/api-standards.yaml
generated_at: 2026-11-22T01:51:09.056804+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/audit/api-standards.yaml

## Purpose
A YAML rule registry of API-standards clauses (HTTP RFCs plus style guides) that two audit skills read: one judges the eight HTTP web standards, and the other judges one style guide (Zalando, unless the API clearly leans Google AIP). It shares the top-level shape (`version`, `rules`) with `compliance-rules.yaml`, but its per-rule fields differ.

## Key elements
- `version: 1` and `rules:` are the top-level keys.
- Per-rule fields:
  - `id`: `<standard>-<what>`, unique.
  - `standard`: one of `rfc9110`, `rfc9111`, `rfc9457`, `rfc5789`, `rfc7396`, `rfc6585`, `ratelimit-headers`, `idempotency-key`, `google-aip`, `zalando`.
  - `section`: the part of the standard the rule comes from, as a name rather than a number.
  - `rule`: what the standard says, with its BCP 14 keyword in capitals. A clause stated without a keyword is judged as a MUST. MAY clauses are included, but they cannot fail.
  - `house`: `null`, or one sentence this API promises beyond `rule`, ending with a `docs/…#anchor`. It never takes a `difference`, and it is not counted in the budget.
  - `source`: a URL or a list of URLs, with the clause that holds the MUST first. The audit re-reads each one.
  - `evidence`: where to look. This can be contract JSONPaths (root contract), code paths, or docs pages. Some entries point read-only into `../boilerplate-vue-frontend`.
  - `lint`: `possible` means a mechanical finding is reported only, and never turned into a Spectral rule. `no` means judgement only.
  - `difference`: `null`, or an id or list of ids. These are rows of "Where we differ" in the API-standards docs page. A known difference is reported as KNOWN-DIFFERENCE, not as a violation.
- Rules visible in the shown portion:
  - RFC 9110: `rfc9110-get-safe`, `rfc9110-delete-no-body`, `rfc9110-created-means-created`, `rfc9110-conditional-requests`.
  - RFC 9111: `rfc9111-no-store-on-errors`, `rfc9111-personal-is-private`, `rfc9111-read-declares-cache`, `rfc9111-validators-and-304`.
  - RFC 9457: `rfc9457-every-error-is-a-problem`, `rfc9457-members-shape`, `rfc9457-errors-extension`.

## Relationships
- `shared/contracts/openapi.root.yaml`: the root contract that the `evidence` JSONPaths target (for example `paths.*.get` and `paths.*.delete.requestBody`). The `rfc9110-conditional-requests` evidence also mentions `x-versioned` and `x-cache`, which are contract-level extensions.
- `shared/cases/request-headers.cases.yaml` and `shared/cases/security-headers.cases.yaml`: no direct references are visible in the shown content. They are presumably related through the header and caching rules (conditional requests, `Cache-Control`, `Vary`). That link is inferred and not stated in the file.

## Notes
- Rules that Spectral or a test already guards are deliberately left out. The audits name those guards and skip them.
- Budget: 3–6 rules each for Google AIP and Zalando, 2–4 per RFC, and up to 7 for `idempotency-key`, since no Spectral rule or test guards its clauses.
- A `house` clause is allowed only if a docs page promises it. With no page, there is no house clause.
- Exceptions to a house promise go into the sentence itself, because `house` never takes a `difference`.
- The file's header points to a docs page on API standards for the theory and the list of differences.
- The file uses 4-space indentation, and some values are quoted for YAML safety.
