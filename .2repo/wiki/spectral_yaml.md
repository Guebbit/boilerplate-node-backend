# spectral.yaml

## Purpose

Project-level Spectral ruleset that extends the built-in `spectral:oas` rules with team-specific linting conventions. It enforces naming patterns (camelCase operationIds, PascalCase schema names), bans `nullable` in favor of optional properties for codegen, and catches common typos in OpenAPI documents.

## Key elements

- **`extends: spectral:oas`** — inherits the standard OpenAPI Spectral rules as a base.
- **Quality gates (error):** `operation-operationId`, `operation-tags` — every operation must have an `operationId` and at least one `tag`.
- **`avoid-nullable` (warn):** flags any `nullable: true` usage; the project prefers plain optional properties.
- **`no-refs-typo` (error):** fails the build if the misspelled key `$refs` appears anywhere.
- **`operation-id-no-http-verb-prefix` / `operation-id-camel-case` (error):** `operationId` must be camelCase and must not begin with `post`, `put`, or `patch` followed by an uppercase letter (semantic verbs like `create`, `update`, `delete`, `list` are expected).
- **`request-schema-no-http-verb-prefix` / `request-schema-pascal-case` (error):** schema names ending in `Request` must be PascalCase and must not start with `Post`, `Put`, `Patch`, or `Get`.
- **`response-schema-no-http-verb-prefix` / `response-schema-pascal-case` (error):** same constraints for schema names ending in `Response`.
- **`parameter-name-camel-case` (error):** entries in `components.parameters[*].name` must be camelCase.

## Relationships

- **openapi.yaml** — the target document this ruleset lints. Every `given` JSONPath expression (`$.paths`, `$.components.schemas`, `$.components.parameters`) is evaluated against an OpenAPI file of that shape.
- **spectral.modules.yaml** — companion Spectral configuration that registers or configures the module/plugin environment in which this ruleset runs (e.g., resolving custom function definitions beyond the built-ins `truthy`, `falsy`, `pattern`).

## Notes

- The verb-prefix bans are asymmetric: `delete` (and by implication `get` in the *allowed* list for operationIds) is permitted as a prefix, but `post`, `put`, `patch` are not. The regexes only exclude the three write-verb prefixes.
- `avoid-nullable` is a **warn**, not an error — existing nullable fields won't block a merge but will surface in lint output.
- The `request-schema-pascal-case` and `response-schema-pascal-case` rules use a JSONPath filter (`@property.match(/Request$/)~`) that selects the *value* of the matching key, then checks the key name itself via `field: '@key'` in the sibling rule. The two rules per type are paired and must be read together.
- All custom rules use Spectral's built-in `pattern`, `truthy`, and `falsy` functions; no external custom functions are referenced in this file.
