---
source: shared/contracts/spectral.yaml
sha256: b10684f07ce6819fab29f95727f08073d8d02ad8601d88b0fa340842c890cec9
generated_at: 2026-11-08T03:08:36.077627+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/spectral.yaml

## Purpose

Spectral linting configuration for the project's OpenAPI 3.1 contract. It extends the built-in `spectral:oas` ruleset and layers project-specific rules on top, covering security declaration, naming conventions, schema shape constraints, and US-English spelling. Every rule is set to `error` severity — violations block the build.

## Key elements

- **`operation-security-declared`** — Requires every operation to declare a `security` key (`[]` for public, a scheme list for auth). Prevents ambiguous "forgotten guard" vs. "deliberately public."
- **`no-nullable-keyword`** — Rejects the OpenAPI 3.0 `nullable` keyword (unknown in 3.1 / JSON Schema 2020-12). Exempts a literal property *named* `nullable` under `properties`.
- **`no-refs-typo`** — Catches the common `$refs` misspelling of `$ref`.
- **`error-responses-are-problem-json`** — 4xx/5xx responses must declare exactly `application/problem+json` (RFC 9457). `x-not-problem: true` opts a non-JSON answer out.
- **`success-body-is-not-an-array`** — 2xx `application/json` bodies must be objects, never bare top-level arrays.
- **`verb-replace-is-put` / `verb-update-is-patch`** — An operationId prefixed `replace` must sit under `PUT`; one prefixed `update` must sit under `PATCH`. Comments reference an allowlist for genuine exceptions.
- **`operation-id-no-http-verb-prefix` / `operation-id-camel-case`** — operationIds must be camelCase and must not start with `post`, `put`, or `patch` + capital.
- **`request-schema-no-http-verb-prefix` / `request-schema-pascal-case`** — `*Request` schemas are PascalCase with no HTTP-verb prefix.
- **`response-schema-no-http-verb-prefix` / `response-schema-pascal-case`** — Same constraints for `*Response` schemas.
- **`parameter-name-camel-case`** — Parameter names are camelCase; `in: header` is excluded (wire names are conventionally hyphenated).
- **`string-declares-max-length`** — Every request-carried `string` (in bodies or nested parameter schemas) must set `maxLength`. Exempts enums, fixed formats (`date`, `uuid`, etc.), `binary`, and composed schemas (`allOf`/`oneOf`/`anyOf`).
- **`string-parameter-declares-max-length`** — Same requirement for a parameter whose schema *is* the string (one level up, not a child).
- **`names-in-us-english-operation-ids`** (and likely siblings) — Enforces US-English spelling in machine-read names via an explicit stem list (not a suffix regex, to avoid flagging e.g. `promisedAt`).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — The primary OpenAPI spec that this ruleset lints. Rules here target the document structure of that file (paths, components, responses).
- **`shared/contracts/spectral.modules.yaml`** — Sibling Spectral ruleset covering module-specific linting rules; loaded alongside this file by the Spectral CLI.
- **`shared/contracts/spectral.asyncapi.names.yaml`** — Sibling Spectral ruleset for AsyncAPI naming conventions; separate concern, no shared rules with this file.

## Notes

- All rules are `error`; there is no `warn` tier. A single violation fails the lint run.
- `no-nullable-keyword` uses `schema: { not: {} }` in its functionOptions to reject the keyword *regardless of its value* (true, false, or otherwise).
- The `x-not-problem: true` annotation is a **house rule** (not part of Zalando's ruleset) and the only documented escape hatch for `error-responses-are-problem-json`.
- The verb/operationId pairing rules (`verb-replace-is-put`, `verb-update-is-patch`) select offenders via `given` so a match is always a real drift; the comments reference an "allowlist" that lives above the rule in the file.
- `string-declares-max-length` deliberately does **not** exempt `pattern`, `format: email`, or `format: uri` — none of those bound length.
- The US-English rules operate on machine-read names only (operationIds, schema names, property names, enum values, error-code keys); prose fields (`description`, `summary`) are exempt.
- The file is truncated in the snapshot; additional rules (likely more spelling rules for schema names, property names, etc.) follow `names-in-us-english-operation-ids`.
