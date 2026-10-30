---
source: shared/contracts/spectral.yaml
sha256: 865842c575608d613188997c9bf62de4a8cf7e1af949d4e000ebe021c926142c
generated_at: 2026-10-29T01:47:51.168469+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/spectral.yaml

## Purpose

Spectral (OpenAPI linter) ruleset that enforces the project's API contract conventions. It extends `spectral:oas` and adds custom rules covering security declaration, naming, error/response shape, and schema hygiene so that contract drift is caught at lint time rather than in review.

## Key elements

- **Quality gates** — `operation-operationId` and `operation-tags` set to `error` (inherited from `spectral:oas`).
- **`operation-security-declared`** — Every operation must have a `security` field present (`[]` for public, named scheme otherwise). Prevents a missing guard being read as intentional.
- **`no-nullable-keyword`** — Rejects the OpenAPI 3.0 `nullable` keyword (unknown in 3.1 / JSON Schema 2020-12); enforces `type: [X, 'null']` or `oneOf` instead.
- **`no-refs-typo`** — Fails on the common `$refs` misspelling.
- **`error-responses-are-problem-json`** — 4xx/5xx responses must declare only `application/problem+json` (RFC 9457). `x-not-problem: true` opts a response out.
- **`success-body-is-not-an-array`** — 2xx `application/json` schemas must not be top-level `array`.
- **`verb-replace-is-put` / `verb-update-is-patch`** — `operationId` starting with `replace` must be a PUT; starting with `update` must be a PATCH. Catches verb drift behind an unchanged id.
- **`operation-id-no-http-verb-prefix` / `operation-id-camel-case`** — `operationId` must be camelCase and must not start with `post`, `put`, or `patch`.
- **`request-schema-*` / `response-schema-*`** — Schema names ending in `Request` or `Response` must be PascalCase and must not start with an HTTP verb.
- **`parameter-name-camel-case`** — Parameters (except `in: header`) must be camelCase.
- **`string-declares-max-length` / `string-parameter-declares-max-length`** — Request-side string schemas and bare string parameters must declare `maxLength`. Exempts enums, fixed formats (`date`, `uuid`, …), binary, and composed schemas.

## Relationships

- **`shared/contracts/spectral.modules.yaml`** — Per-module Spectral configuration that sits alongside this file. This file defines the shared baseline rules; the modules file is where individual services can extend or override them.

## Notes

- All custom rules are `severity: error` — they block CI, not warn.
- The `no-nullable-keyword` rule uses `not: {}` to reject the keyword regardless of its value, because any `nullable` key is invalid in 3.1.
- `string-declares-max-length` has two companion rules because the recursive `..` selector matches schema *children*, not a parameter whose schema *is* the string; `string-parameter-declares-max-length` covers that one-level-up case.
- `parameter-name-camel-case` intentionally excludes `in: header` because wire headers are hyphenated by convention.
- The `error-responses-are-problem-json` rule uses `propertyNames: { const: 'application/problem+json' }` to ensure *only* that media type is present, not just that it is among others.
- Referenced conventions: Zalando API Guidelines 176 (problem+json) and 110 (no bare arrays), RFC 9457.
