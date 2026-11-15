---
source: tests/cross-cutting/cookie-inventory.test.ts
sha256: 6d694cda2dfe1e967ab72f55b0aef620c916c504802ccb65aa04b8001e3c963c
generated_at: 2026-11-14T23:03:00.809723+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/cookie-inventory.test.ts

## Purpose

Cross-cutting consistency test that asserts the session cookie name defined in the generated infrastructure code (`cookieData.session.name`) matches the `cookieAuth` name declared in the root OpenAPI contract. It guards against the two sources of truth drifting apart.

## Key elements

- **`RootContract`** — local `interface` that types the minimal slice of `openapi.root.yaml` the test needs (`components.securitySchemes.cookieAuth.name`).
- **`describe('the cookie inventory')` / single `it`** — reads `shared/contracts/openapi.root.yaml` at test time via `readFileSync` + `yaml.parse`, then asserts `cookieData.session.name` equals the contract's declared cookie name.

## Relationships

- **`tests/support/paths.ts`** — supplies `REPO_ROOT`, which the test uses to build the absolute filesystem path to the YAML contract file.

## Notes

- The file's top-level JSDoc comment references `shared/rules/cookies.yaml`, but the test actually reads `shared/contracts/openapi.root.yaml`. The comment is stale and should be updated to avoid misleading readers.
- The contract file is parsed at **test time** (not build time), so a renamed or restructured YAML file will surface as a test failure rather than a compile error.
