---
source: shared/contracts/spectral.yaml
sha256: 9243a99a4025d85c8c57f4526ae6ff087352b8a19448413abf5076fbfb3e015c
generated_at: 2026-09-23T17:34:35.927615+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/spectral.yaml

## Purpose

Spectral linter configuration for the project's OpenAPI contracts. Extends the base `spectral:oas` ruleset and layers on project-specific naming, quality-gate, and codegen-friendliness rules that every spec must pass before it is accepted.

## Key elements

- **Extends `spectral:oas`** — inherits all default Spectral OpenAPI rules.
- **Quality gates** — `operation-operationId` and `operation-tags` are required (error).
- **`avoid-nullable`** (warn) — flags `nullable: true`; project prefers `optional` for cleaner codegen.
- **`no-refs-typo`** (error) — catches the common `$refs` vs `$ref` typo.
- **`operation-id-no-http-verb-prefix`** (error) — operationId must not start with `post`, `put`, or `patch` followed by an uppercase letter; semantic verbs (`list`, `create`, `update`, `delete`, `search`, `get`, `login`, `signup`) are expected.
- **`operation-id-camel-case`** (error) — operationId must match `^[a-z][a-zA-Z0-9]*$`.
- **`request-schema-no-http-verb-prefix`** (error) — `*Request` schemas must not be prefixed with `Post`/`Put`/`Patch`/`Get`.
- **`request-schema-pascal-case`** (error) — `*Request` schemas must match `^[A-Z][a-zA-Z0-9]*Request$`.
- **`response-schema-no-http-verb-prefix`** (error) — `*Response` schemas must not be prefixed with `Post`/`Put`/`Patch`/`Get`.
- **`response-schema-pascal-case`** (error) — `*Response` schemas must match `^[A-Z][a-zA-Z0-9]*Response$`.
- **`parameter-name-camel-case`** (error) — all non-header parameters must be camelCase.

## Relationships

- **`shared/contracts/spectral.modules.yaml`** — provides the Spectral function/module registrations that the rules in this file invoke (e.g. `falsy`, `truthy`, `pattern`). Without that file the custom function references would not resolve.

## Notes

- **Header parameters are exempt** from the camelCase rule by design: HTTP header names are conventionally hyphenated on the wire (e.g. `x-antibot-challenge-token`), so forcing camelCase would produce names no client actually sends.
- **`delete` is explicitly allowed** as a semantic prefix in both operationId and schema names, while `post`, `put`, `patch`, and `get` (as a prefix) are not. The `get` rule targets the _verb-prefix_ pattern `get[A-Z]…`; a plain `get` operationId is fine.
- `avoid-nullable` is **warn**, not error — existing nullable fields will not break CI but will surface in the report.
- The request/response schema rules only apply to schemas whose names end in `Request` or `Response` respectively; all other component schemas are unconstrained by these naming rules.
