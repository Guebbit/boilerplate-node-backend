---
source: shared/contracts/spectral.yaml
sha256: a2ee3552b41b07cc09b3468a50974516a7b76009a8d324e8abe606e03e8a4b98
generated_at: 2026-09-27T14:01:50.438766+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/spectral.yaml

## Purpose

Spectral (OpenAPI linter) configuration that layers custom naming and quality rules on top of the base `spectral:oas` ruleset. Enforces consistent `operationId`, schema, and parameter naming conventions across all API contracts in the repo.

## Key elements

- **`extends: ['spectral:oas']`** — inherits the full base OAS ruleset (draft checks, path/operation completeness, etc.).
- **`operation-operationId` / `operation-tags`** (severity: error) — hard-gate that every operation has an `operationId` and at least one tag.
- **`no-refs-typo`** — flags the common `$refs` (plural) typo with a JSONPath `truthy` check.
- **`operation-id-no-http-verb-prefix`** — regex `notMatch '^(post|put|patch)[A-Z]'` on `$.paths[*][*].operationId`. Allows `delete`/`get` as prefixes.
- **`operation-id-camel-case`** — regex `match '^[a-z][a-zA-Z0-9]*$'` on the same path.
- **`request-schema-no-http-verb-prefix` / `request-schema-pascal-case`** — constrain `$.components.schemas` keys ending in `Request` (e.g. `CreateOrderRequest`).
- **`response-schema-no-http-verb-prefix` / `response-schema-pascal-case`** — constrain `$.components.schemas` keys ending in `Response`.
- **`parameter-name-camel-case`** — enforces camelCase on `$.components.parameters` names, **excluding** `in: header` (wire headers stay hyphenated).

## Relationships

- **`shared/contracts/spectral.modules.yaml`** — companion Spectral config that scopes rules to a specific set of OpenAPI files/modules. The two files together form the repo's lint pipeline: this file defines *what* to enforce; the modules file defines *where* those rules apply.

## Notes

- All custom rules are set to `severity: error` (not `warn`), so violations fail CI.
- The "no HTTP verb prefix" rules explicitly allow `Delete` and `Get` as leading words; only `Post`, `Put`, `Patch` (and their lowercase forms) are blocked.
- Header parameters are deliberately excluded from the camelCase rule because real wire values (e.g. `x-antibot-challenge-token`) are hyphenated; camelCasing them would produce a name no client actually sends.
- The `request-schema-pascal-case` and `response-schema-pascal-case` rules use a JSONPath filter `@property.match(/Request$/)` / `/Response$/` to target only the relevant schema subset.
