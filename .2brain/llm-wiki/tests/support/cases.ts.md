---
source: tests/support/cases.ts
sha256: 6258bb7aa0fe870bc02bda2144728c1dd172c3dc34c367f3db4cb97f210236a3
generated_at: 2026-10-29T07:06:41.082684+00:00
model: ollama:qwen3.8:27b
---

# tests/support/cases.ts

## Purpose

Shared-cases test harness that loads a `shared/cases/<name>.cases.yaml` file, validates its entries against a Zod schema, and registers one Jest `it` block per case. It exists so that identical input→expected-output logic is verified against both backends (this repo and the PHP twin) from a single YAML source of truth.

## Key elements

- **`CASES_DIRECTORY`** – Resolved path to the repo-root `shared/cases/` directory.
- **`caseBase`** – Minimal Zod schema (`{ name: string }`) that every per-case schema must extend.
- **`describeCases<T>(file, caseSchema, count, run)`** – The only exported test-registry function. Reads and parses the YAML file, validates the `cases` array against `caseSchema`, then inside a `describe("shared cases: <file>")` block:
  1. Asserts the array length equals `count` exactly (pin, not floor).
  2. Runs `it.each` over the cases, calling `run(case)` (sync or async) for each.

## Relationships

- **Consumed by** every cross-cutting conformance test (`crypto-conformance`, `env-booleans-conformance`, `log-redaction-conformance`, `money-conformance`, `normalize-email-conformance`, `outbox-backoff-conformance`, `permission-model-version-conformance`, `rate-limit-keys-conformance`, `request-headers-conformance`, `security-headers-conformance`, `ssrf-conformance`) and the `ownership-shop.contract.test.ts` suite. Each caller invokes `describeCases` with its own schema and `run` assertion.
- **Reads** one or more `shared/cases/*.cases.yaml` files at test time. The same files are consumed by the PHP backend's twin harness.

## Notes

- The `count` parameter is an **exact pin**: a YAML file that gains or loses an entry will fail the suite rather than silently passing with fewer assertions.
- The `file` argument is the bare name (e.g. `"money"`); the function appends `.cases.yaml` and resolves under `shared/cases/`.
- Each `describeCases` call produces `count + 1` tests (the extra one is the length-pinning assertion).
- `run` receives a single already-validated case object; it may throw or use `expect` to signal disagreement. There is no built-in "expected output" comparison—each caller defines what "agrees" means.
