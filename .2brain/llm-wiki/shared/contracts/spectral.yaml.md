---
source: shared/contracts/spectral.yaml
source_sha256: cf392c9c5d4da504fb4c52e79abe52854d1e695922e2266d22a7fd1d903dc0ed
context_sha256: 32331396b10461038f76d586aaf4b401f62575bfa70c7cf1e26e4c49ff360df6
generated_at: 2026-11-22T02:24:50.417427+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/contracts/spectral.yaml

## Purpose
Spectral lint ruleset for the project's OpenAPI contract. It extends the built-in `spectral:oas` ruleset and adds house rules, all at `error` severity, that enforce API design conventions: declared security, OpenAPI 3.1 idioms, RFC 9457 problem responses, naming, and bounded request strings. It exists so contract drift is caught mechanically rather than in review.

## Key elements
- **Quality gates**: `operation-operationId` and `operation-tags` are set to `error`.
- **`operation-security-declared`**: every operation must have `security` (truthy). `[]` marks a public operation, so a forgotten guard is never mistaken for a deliberate one.
- **`no-nullable-keyword`**: rejects the 3.0 `nullable` keyword (3.1 ignores it silently). Use `type: [X, 'null']` or `oneOf` with `{ type: 'null' }`. A property named `nullable` under `properties` is exempt.
- **`no-refs-typo`**: flags `$refs` used in place of `$ref`.
- **`error-responses-are-problem-json`**: 4xx/5xx `content` may only contain `application/problem+json`. `x-not-problem: true` on the response opts out.
- **`error-responses-have-a-body`**: 4xx/5xx responses must declare `content`, with the same `x-not-problem` opt-out. It is a separate rule so hits are not reported twice.
- **`success-body-is-not-an-array`**: a 2xx `application/json` schema may not have `type: array`.
- **`verb-replace-is-put`** and **`verb-update-is-patch`**: an operationId starting with `replace` must be on PUT, and one starting with `update` must be on PATCH.
- **`operation-id-no-http-verb-prefix`**: operationIds may not start with `post`, `put` or `patch` followed by an uppercase letter.
- **`operation-id-camel-case`**: operationIds must match `^[a-z][a-zA-Z0-9]*$`.
- **Schema naming**: `request-schema-*` and `response-schema-*` rules ban `Post/Put/Patch/Get` prefixes on `*Request`/`*Response` component schema names and require PascalCase.
- **`parameter-name-camel-case`**: component parameter names must be camelCase. `in: header` parameters are excluded because headers are hyphenated on the wire.
- **`string-declares-max-length`** and **`string-parameter-declares-max-length`**: strings reachable from request bodies and parameters must define `maxLength`.
  - Exempt: enums, `date`, `date-time`, `uuid`, `time` and `binary` formats, and schemas that use `allOf`, `oneOf` or `anyOf`.
  - `pattern`, `email` and `uri` do not count as exemptions.
  - Responses are not checked.
  - The second rule exists because the recursive selectors in the first never match a bare string parameter schema itself.
- **US English names section**: a rule block on machine-read names (operationIds, schema names, property names, enum values, error-code keys) built on an explicit stem list, not a suffix regex. The rule definitions are not visible in the excerpt.

## Relationships
- Applies to the OpenAPI contract rooted at `shared/contracts/openapi.root.yaml`. The `$.paths` selectors target that document's structure.
- `spectral.asyncapi.names.yaml` and `spectral.modules.yaml` are sibling Spectral rulesets in the same directory. This file's rules are OpenAPI-specific (`paths`, `components`).

## Notes
- The `maxLength` rules mention a shared `Text` schema (1 to 200) and per-kind limit values documented elsewhere.
- The comments cite the RFC 9457, Zalando and AIP-190 guidelines as the basis for several rules. The comments call them house rules, not the full Zalando ruleset.
- `delete*` operationIds and `Delete*` schema names are deliberately allowed.
