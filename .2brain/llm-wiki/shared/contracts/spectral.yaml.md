---
source: shared/contracts/spectral.yaml
sha256: 103b5a80e83e602f3bc1393749b03f6bf080d50182588d3dfc97f347c4fc125a
generated_at: 2026-10-14T07:36:43.087256+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/spectral.yaml

## Purpose

Spectral linter configuration for the project's OpenAPI 3.1 specifications. Extends the base `spectral:oas` preset and layers on project-specific rules that enforce security declarations, correct verb/operationId alignment, naming conventions for operations and schemas, and mandatory `maxLength` on request strings. Every rule is set to `severity: error`, so violations block the CI pipeline.

## Key elements

- **`extends: ['spectral:oas']`** — pulls in Spectral's built-in OAS rules before applying the custom ones below.
- **Quality gates** — `operation-operationId` and `operation-tags` promoted to error severity.
- **`operation-security-declared`** — every operation must carry a `security` key (even `[]` for public endpoints), so a missing guard is caught rather than mistaken for an intentional public route.
- **`no-nullable-keyword`** — rejects the OpenAPI 3.0 `nullable` keyword (exempt under `properties`); enforces `type: [X, 'null']` or `oneOf` with a null branch instead.
- **`no-refs-typo`** — catches the common `$refs` → `$ref` typo.
- **`verb-replace-is-put` / `verb-update-is-patch`** — operationId prefix must match the HTTP verb (`replace*` → PUT, `update*` → PATCH). Two allowlisted exceptions: `updateCartItemById` and `updateLocaleEntry`.
- **`operation-id-no-http-verb-prefix`** — operationIds must not start with `post`, `put`, or `patch` followed by an uppercase letter.
- **`operation-id-camel-case`** — operationIds must be camelCase (`^[a-z][a-zA-Z0-9]*$`).
- **`request-schema-no-http-verb-prefix` / `request-schema-pascal-case`** — `*Request` schemas must be PascalCase and must not start with an HTTP verb.
- **`response-schema-no-http-verb-prefix` / `response-schema-pascal-case`** — same conventions for `*Response` schemas.
- **`parameter-name-camel-case`** — parameter names must be camelCase; `in: header` parameters are exempt (wire-format hyphenation is intentional).
- **`string-declares-max-length`** — every string reachable through a request body or nested parameter schema must declare `maxLength`. Exempts: `enum`, fixed formats (`date`, `date-time`, `uuid`, `time`, `binary`), and composed schemas (`allOf`/`oneOf`/`anyOf`).
- **`string-parameter-declares-max-length`** — companion rule for parameters whose schema *is* the string (bare `type: string` on the parameter itself), which the recursive selector above cannot reach.

## Relationships

- **`shared/contracts/spectral.modules.yaml`** — module-level Spectral configuration that references this rules file, tying these rules into the linting pipeline for the API contract specs.

## Notes

- All custom rules are `severity: error`; there is no warning tier in this file.
- The `no-nullable-keyword` rule uses `not: {}` as the schema, which rejects *any* value — the keyword is refused regardless of what it was set to.
- `string-declares-max-length` only inspects request-side schemas (bodies, parameters). Response strings are intentionally exempt because they are server-generated.
- The `parameter-name-camel-case` rule deliberately skips `in: header` parameters to preserve conventional hyphenated header names (e.g. `x-antibot-challenge-token`).
- The `verb-update-is-patch` allowlist is hardcoded in the `given` JSONPath filter rather than a separate data structure; adding a new exception means editing the filter expression directly.
- Reference the shared `Text` type (1–200 chars) and `docs/api/field-limits.md` for the canonical `maxLength` values to use when satisfying the length rules.
