---
source: shared/contracts/spectral.yaml
sha256: eb5f559a056e2c761be53cc489c38f70049a0739afa146b08c35d0e0c0ad6c0c
generated_at: 2026-10-01T12:43:34.738222+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/spectral.yaml

## Purpose

Base Spectral (OpenAPI linter) configuration for the project's API contracts. Extends the standard `spectral:oas` preset and layers on project-specific naming-convention and semantic-consistency rules (operationId ↔ HTTP verb, schema/parameter casing, typo guards) so that contract drift is caught at lint time rather than in review.

## Key elements

- **`extends: spectral:oas`** — inherits the full OAS core ruleset as a starting point.
- **`operation-operationId` / `operation-tags`** — promoted to `error` (quality gates).
- **`no-refs-typo`** — flags the common `$refs` misspelling (should be `$ref`).
- **`verb-replace-is-put`** — any operationId starting with `replace` must live under the `put` method key.
- **`verb-update-is-patch`** — any operationId starting with `update` must live under `patch`, with two hardcoded allowlist exceptions (`updateCartItemById`, `updateLocaleEntry`).
- **`operation-id-no-http-verb-prefix`** — rejects `post`/`put`/`patch` as an operationId prefix; requires semantic verbs (`create`, `update`, `delete`, etc.).
- **`operation-id-camel-case`** — enforces `^[a-z][a-zA-Z0-9]*$`.
- **`request-schema-no-http-verb-prefix` / `request-schema-pascal-case`** — `*Request` schema names: no HTTP-verb prefix, must be PascalCase.
- **`response-schema-no-http-verb-prefix` / `response-schema-pascal-case`** — same constraints for `*Response` schemas.
- **`parameter-name-camel-case`** — camelCase for all parameter names **except** `in: header` (headers stay hyphenated on the wire).

All custom rules are set to `severity: error`.

## Relationships

- **`shared/contracts/spectral.modules.yaml`** — module-level override/extension of this base config; adds or adjusts rules per contract module on top of the conventions defined here.

## Notes

- **Allowlist is inlined in the JSONPath.** Adding a new verb/verb exception (e.g. another `update*` that is genuinely a PUT) requires editing the `given` expression in `verb-update-is-patch` — there is no separate allowlist array.
- **Verb rules encode a semantic contract:** `replace*` = full idempotent set → PUT; `update*` = partial change → PATCH. The `given` selectors are written so a match *always* means real drift, not a rule false-positive.
- **Header parameters are deliberately excluded** from the camelCase rule because HTTP header names are conventionally kebab-case (`x-antibot-challenge-token`); forcing camelCase would produce names no client sends.
- **Schema-name rules only trigger on the `*Request` / `*Response` suffix.** Schemas that don't end in one of those two suffixes are not checked by these particular rules.
