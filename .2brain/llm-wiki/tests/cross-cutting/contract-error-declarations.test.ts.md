---
source: tests/cross-cutting/contract-error-declarations.test.ts
sha256: 2f03d93935228ffcac37b6c7232dce5df1e9831af504da03b2bdc1b9a1457ddf
generated_at: 2026-09-23T19:55:00.456931+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-error-declarations.test.ts

## Purpose

Ensures every OpenAPI operation whose route takes an id parameter declares a `422` response. The `databaseErrorInterpreter` returns 422 for any malformed id on any such route, so a fragment that omits it describes an API that cannot fail the way it actually does. The test guards against the recurring copy-paste gap where a new endpoint inherits an incomplete responses block from a neighbor.

## Key elements

- **`MODULES_ROOT`** – Resolved path to `src/modules/`; the directory scanned for per-module `openapi.yaml` fragments.
- **`METHODS`** – `Set` of lowercase HTTP method keys (`get`, `post`, `put`, `patch`, `delete`) used to filter operation entries.
- **`TAKES_AN_ID`** – Regex `/{[^}]*[Ii]d}/` matching any path parameter whose name contains "id" (covers `{id}`, `{orderId}`, `{userId}`, …). Matches on parameter _name_, not on a hard-coded route list.
- **`Operation`** – Interface for a single flattened operation: `module`, `route`, `method`, `codes` (declared response status strings).
- **`operations()`** – Reads every `src/modules/<name>/openapi.yaml`, parses it with `yaml`, and flattens `paths → method → responses` into an `Operation[]`.
- **`takingAnId()`** – Filters `operations()` to those whose `route` matches `TAKES_AN_ID`.
- **Canary test** (`finds the operations it means to check`) – Asserts ≥ 40 total operations and ≥ 20 id-taking operations so a renamed fragment or structural change doesn't silently make the real assertion pass on an empty list.
- **Main test** (`declares 422 on every operation that takes an id`) – Collects id-taking operations missing `422` and asserts the list is empty.

## Relationships

- **package.json** – Supplies the `yaml` package (used for fragment parsing) and defines the project layout (`src/modules/…`) that `MODULES_ROOT` resolves against. No other runtime interaction is visible.

## Notes

- **Reads fragments, not the bundle.** The generated `openapi.yaml` bundle is not parsed; a failure in it would point at a line nobody edits.
- **Scope is 422 only.** Three operations (`GET /account`, `GET /observability/events`, `GET /observability/metrics`) lack a `500` declaration. The file deliberately does _not_ assert on 500 because resolving those gaps requires coordinated edits across three repositories; the test enforces only the rule it can defend in-repo.
- **The contract is a shared artifact.** `openapi.yaml` fragments must stay byte-identical with a paired frontend (whose client is generated from it) and a PHP twin. An undeclared status is a missing type in the generated client, not a cosmetic gap.
- **Test, not fix.** The doc comment explains why the correction is made in the fragments themselves; this file exists to make the regression visible and to document _why_ the rule holds.
