# tests/cross-cutting/contract-error-declarations.test.ts

## Purpose

Cross-cutting contract test that asserts every OpenAPI operation accepting an id parameter declares a `422` response in its module's `openapi.yaml` fragment. It exists because the shared error interpreter (`databaseErrorInterpreter`) can return `422 Invalid identifier` for any malformed id on any such route, so the contract must declare that status consistently or the generated client and the PHP twin's response-schema suite will break. It is written as a test rather than a linter because the contract fragments are a shared artifact that must stay byte-identical across three repositories.

## Key elements

- **`MODULES_ROOT`** — path constant pointing to `src/modules`, the directory scanned for per-module fragments.
- **`TAKES_AN_ID`** (`/{[^}]*[Ii]d}/`) — regex matched against route paths to select operations that carry an id-like parameter (e.g. `{id}`, `{orderId}`, `{userId}`).
- **`operations()`** — reads every `src/modules/*/openapi.yaml`, parses it with the `yaml` package, and returns a flat list of `{ module, route, method, codes[] }`.
- **`takingAnId()`** — filters `operations()` to only those whose route matches `TAKES_AN_ID`.
- **"finds the operations it means to check"** (canary test) — asserts the scanned set is non-trivially large (`>40` total, `≥20` id-taking) so a broken path or renamed fragment does not silently produce an empty list and pass.
- **"declares 422 on every operation that takes an id"** — the core assertion: collects any id-taking operation missing `422` in its `responses` keys and expects the list to be empty.

## Relationships

- **`package.json`** — provides the Jest test runner (`describe`/`it`/`expect`) and the `yaml` dependency used to parse the OpenAPI fragments.

## Notes

- **Reads fragments, not the bundle.** The test intentionally scans `src/modules/*/openapi.yaml` rather than the generated `openapi.yaml` bundle, because a failure in the bundle would point at a line nobody edits; the fix lives in a fragment.
- **Scope is 422 only.** A parallel sweep over `500` would flag three operations (`GET /account`, `GET /observability/events`, `GET /observability/metrics`), but whether those are omissions or deliberate is an open question about those endpoints. The file records that gap in its header comment rather than asserting it, keeping the test to a single rule it can defend.
- **Matching is by parameter name, not by route list.** Adding a new id-parameter route automatically brings it into scope without editing the test.
- **The canary test is load-bearing.** Without it, a renamed module directory or a changed fragment filename would make `operations()` return `[]`, and the 422 assertion would pass vacuously.
