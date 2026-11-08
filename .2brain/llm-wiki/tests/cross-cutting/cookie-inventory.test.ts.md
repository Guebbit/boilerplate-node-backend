---
source: tests/cross-cutting/cookie-inventory.test.ts
sha256: 2b253898e9806a9502b6869f08df1b00e2d5028889045a9f9a58e7e58af4601f
generated_at: 2026-11-08T09:26:17.928368+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/cookie-inventory.test.ts

## Purpose

Cross-cutting consistency test that ensures the generated cookie inventory (`cookieData`) agrees with two downstream consumers: the OpenAPI root contract's `cookieAuth` security scheme and the data-protection documentation page. It catches drift when the cookie rules are updated but one of those artifacts is forgotten.

## Key elements

- **`RootContract`** – minimal interface describing the slice of `shared/contracts/openapi.root.yaml` the test needs (`components.securitySchemes.cookieAuth.name`).
- **`describe('the cookie inventory')`** – test suite containing two assertions:
  - *session cookie name matches contract* – asserts `cookieData.session.name` equals the `cookieAuth.name` parsed from the OpenAPI YAML.
  - *all cookies listed in data-protection page* – iterates `Object.values(cookieData)` and asserts each `cookie.name` appears (wrapped in backticks) in `docs/theory/data-protection.md`.

## Relationships

- **`tests/support/paths.ts`** – provides `REPO_ROOT`, which the test uses to build absolute paths to the contract YAML and the data-protection markdown file.

## Notes

- The contract YAML and the markdown page are read as **raw text at test time** (`readFileSync` + `parse`/string search), not imported as modules. They must exist on disk at the paths relative to `REPO_ROOT`.
- The second test checks for the backtick-wrapped form (`` `${cookie.name}` ``), so cookie names in the doc must be written as inline code for the assertion to pass.
- `cookieData` comes from a **generated** module (`cookies.generated`), making the YAML rules the upstream source of truth this test guards.
