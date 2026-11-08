---
source: tests/support/cases.ts
sha256: e42b4ba2b64a0cc6d8179c7714cca0f5aea9bacf449d3255a611465fae5ead1f
generated_at: 2026-11-08T09:52:05.853108+00:00
model: ollama:qwen3.8:27b
---

# tests/support/cases.ts

## Purpose

Test harness for the "shared cases" contract: it reads a YAML file from `shared/cases/<name>.cases.yaml`, validates each entry with a caller-supplied Zod schema, and registers one `it` per case. The same YAML is executed by the PHP backend's twin harness, ensuring both backends agree on pure-logic behavior defined in `docs/theory/shared-rules.md`.

## Key elements

- **`CASES_DIRECTORY`** (module-private) — Resolves to `<repo-root>/shared/cases` via `path.join(__dirname, '..', '..', 'shared', 'cases')`.
- **`caseBase`** (exported) — Minimal Zod schema (`{ name: z.string().min(1) }`) that every concrete case schema must extend. Guarantees each case carries a human-readable label.
- **`describeCases<T>`** (exported) — The single public API. Accepts:
  - `file`: basename under `shared/cases/` (without `.cases.yaml`)
  - `caseSchema`: a Zod type for one case row
  - `run`: sync or async callback that asserts one case
  
  Reads + parses the YAML, validates the whole document as `{ cases: T[] }`, then calls `describe` → `it.each(cases)` → `run(one)` for every entry.

## Relationships

Every graph neighbor is a **consumer**: each test file imports `describeCases` (and often `caseBase`) to wire a specific shared-cases YAML into its suite.

- `tests/contract/ownership-shop.contract.test.ts` — ownership/shop contract cases
- `tests/cross-cutting/crypto-conformance.test.ts` — crypto helpers
- `tests/cross-cutting/env-booleans-conformance.test.ts` — env boolean parsing
- `tests/cross-cutting/log-redaction-conformance.test.ts` — log redaction rules
- `tests/cross-cutting/money-conformance.test.ts` — monetary arithmetic
- `tests/cross-cutting/normalize-email-conformance.test.ts` — email normalization
- `tests/cross-cutting/outbox-backoff-conformance.test.ts` — outbox retry/backoff logic
- `tests/cross-cutting/permission-model-version-conformance.test.ts` — permission-model versioning
- `tests/cross-cutting/rate-limit-keys-conformance.test.ts` — rate-limit key derivation
- `tests/cross-cutting/request-headers-conformance.test.ts` — request header normalization
- `tests/cross-cutting/security-headers-conformance.test.ts` — security header assembly
- `tests/cross-cutting/ssrf-conformance.test.ts` — SSRF guard logic

No other production code imports this module; it is test-support only.

## Notes

- **Empty or missing file fails fast.** A zero-case array trips `z.array(caseSchema)` (Zod rejects empty by default in this context) *and* `it.each` throws on an empty table, so a forgotten or stripped YAML file is never a silent pass.
- **`__dirname`-relative path.** The harness assumes it lives at `tests/support/`, so the two `..` segments in `CASES_DIRECTORY` are load-bearing; moving the file without updating the path breaks every shared-cases test.
- **Strict per-case validation.** Each row is checked against the caller's `caseSchema` at load time, not at assertion time — a typo in a YAML field surfaces as a parse error before any test runs.
- **`run` may be async.** The `it.each` callback is `async` and awaits `run`, so cases can perform I/O (e.g., calling an HTTP client) without extra wrapping.
