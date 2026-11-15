---
source: shared/contracts/spectral.yaml
sha256: 78a529d5f151523c9e82384f80ff4309e1704d7585650e5951aefee0b0e58e93
generated_at: 2026-11-14T17:45:18.881581+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/spectral.yaml

## Purpose

Spectral ruleset (extending `spectral:oas`) that enforces the project's OpenAPI 3.1 house style. Every rule is an **error**-severity gate: it codifies conventions around security declarations, error-response shape, naming (operationIds, schemas, parameters), and field-level bounds so that API contracts are linted consistently before they reach review.

## Key elements

- **`extends: ['spectral:oas']`** — inherits the standard Spectral OpenAPI rules, then overrides `operation-operationId` and `operation-tags` to error level.
- **`operation-security-declared`** — every operation must have a `security` field (even `[]` for public), so "forgot the guard" ≠ "deliberately public."
- **`no-nullable-keyword`** — rejects the OpenAPI 3.0 `nullable: true` keyword (invalid in 3.1 / JSON Schema 2020-12); enforces `type: [X, 'null']` or `oneOf` instead.
- **`no-refs-typo`** — flags the `$refs` typo.
- **`error-responses-are-problem-json`** — 4xx/5xx responses must declare only `application/problem+json` (RFC 9457 / Zalando 176); opt-out via `x-not-problem: true`.
- **`error-responses-have-a-body`** — companion rule: 4xx/5xx must actually declare a `content` block.
- **`success-body-is-not-an-array`** — 2xx `application/json` schema `type` must not be `array` (Zalando 110).
- **`verb-replace-is-put` / `verb-update-is-patch`** — operationId prefix must agree with the HTTP method (`replace*` → PUT, `update*` → PATCH).
- **`operation-id-no-http-verb-prefix` / `operation-id-camel-case`** — operationIds are camelCase and must not begin with a raw HTTP verb.
- **`request-schema-*` / `response-schema-*`** — PascalCase names for `*Request` / `*Response` schemas; no HTTP-verb prefix.
- **`parameter-name-camel-case`** — camelCase parameter names, excluding `in: header` (wire headers stay hyphenated).
- **`string-declares-max-length` / `string-parameter-declares-max-length`** — every request-reachable string must carry `maxLength`; exempts enums, fixed formats (`date`, `uuid`, `binary`, …), and composed schemas. The second rule covers the case where the parameter's schema *is* the string.
- **US-English naming rule** *(truncated in source)* — enforces American English stems in machine-readable names (operationIds, schema/property names, enum values, error-code keys).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — the document this ruleset lints; the rules' `given` JSONPath expressions are written against that spec's structure.
- **`shared/contracts/spectral.asyncapi.names.yaml`** — sibling ruleset applying analogous naming conventions to AsyncAPI broker contracts.
- **`shared/contracts/spectral.modules.yaml`** — sibling ruleset with additional module-specific gates; both files are loaded alongside this one in the same Spectral invocation.

## Notes

- All rules are `severity: error` — there is no warning tier; a violation blocks the lint pass.
- The two error-body rules (`error-responses-are-problem-json` + `error-responses-have-a-body`) are intentionally separate: merging them into one `given` would double-report every hit (the first selects `.content`, which an empty response never has).
- `x-not-problem: true` is the **only** opt-out for the problem+json rules; it is checked via a JSONPath negative filter, not a `not` schema.
- `string-declares-max-length` checks *request*-reachable strings only (request bodies, path/query/header params). Response strings are excluded by design.
- The `no-nullable-keyword` rule's `given` deliberately excludes properties literally named `nullable` under `properties` (a valid schema field name), using `@parentProperty !== 'properties'`.
- `parameter-name-camel-case` skips `in: header` because HTTP header names are conventionally hyphenated on the wire.
