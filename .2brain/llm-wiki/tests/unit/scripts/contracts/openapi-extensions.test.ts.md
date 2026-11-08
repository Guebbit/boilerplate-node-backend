---
source: tests/unit/scripts/contracts/openapi-extensions.test.ts
sha256: 93047cd9c15f55b4ed222f3b04642aa1bccd96d99841da9cff3249200be06d3c
generated_at: 2026-11-08T10:34:00.390144+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/openapi-extensions.test.ts

## Purpose

Unit tests for the `openapi-extensions` module, which lets a module extend another module's OpenAPI enums and discriminated unions via an `x-extends` key in a sidecar `openapi.<owner>.yaml` file. The tests drive the merge logic with scratch module trees written to temp directories and a minimal in-memory bundle, focusing on the merge rule and its refusal paths rather than any production module tree.

## Key elements

- **`modulesWith(files)`** — creates a temp directory tree (registered in `roots`) containing the given `<module>/<file>` YAML texts plus a fixed `owner/openapi.yaml`; returns the root path. All temp trees are removed in `afterEach`.
- **`bundle()`** — builds a stub `OpenApiDocument` (via `asStub`) with two open targets: `Kind` (enum with `x-enum-from`) and `Notice` (oneOf with discriminator), plus their referenced variants.
- **`fragmentsOf(text)`** — writes a single `shop/openapi.owner.yaml` into a scratch tree and runs `extensionFragments` over it.
- **`run(text, document?)`** — convenience wrapper that applies `withUnionExtensions` to a (default) bundle and returns the resulting `components.schemas`.
- **`describe('extensionFragments')`** — verifies file discovery (only `openapi.<owner>.yaml` with `x-extends`), shape validation of `x-extends`, owner-existence check, and schema-name validation.
- **`describe('enumSourcesOf')`** — confirms that multiple fragments appending to the same enum schema are joined in fragment order.
- **`describe('checkExtensions')`** — validates that a target must be either a `oneOf` or declare `x-enum-from`; refuses otherwise.
- **`describe('withExtensionSchemas')`** — checks that fragment schemas are injected into a root YAML string as `$ref` pointers to the staged file, and that name collisions are refused.
- **`describe('withUnionExtensions')`** — the largest group: verifies oneOf variant appending, discriminator mapping (including reading the property name from the union itself), schema ordering, non-interference with enum keys, and refusals (undeclared variant, missing discriminator value, duplicate discriminator value).

## Relationships

- **`scripts/contracts/openapi-extensions.ts`** — the system under test. All five exported functions (`checkExtensions`, `enumSourcesOf`, `extensionFragments`, `withExtensionSchemas`, `withUnionExtensions`) are imported and exercised.
- **`scripts/contracts/openapi-document.ts`** — imported for the `OpenApiDocument` type used to shape the `bundle()` stub.
- **`tests/support/stub.ts`** (`@tests/stub`) — provides `asStub` for creating type-safe mutable document fixtures.

## Notes

- Temp directories are created in `os.tmpdir()` under the prefix `extensions-`; the `roots` array and `afterEach` cleanup are the sole lifecycle management.
- The YAML fixture constants (`OWNER`, `FRAGMENT`, `VARIANT`) are raw strings, not parsed objects. `withExtensionSchemas` is tested against a *string* root (parsed back with `yaml/parse`), while `withUnionExtensions` operates on the in-memory `bundle()` object.
- `asStub` returns a deeply mutable object; tests that need a mutated variant (e.g. removing a schema, changing a discriminator) cast and mutate the stub directly rather than building a new fixture.
- The test file does **not** import `scripts/contracts/build-bundles.ts` or `tests/support/routes.ts`; those graph neighbors are related transitively through the production module under test.
