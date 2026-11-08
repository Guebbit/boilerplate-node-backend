---
source: tests/unit/scripts/contracts/response-headers.test.ts
sha256: 3e05a2136263dd4eed486152aa11dc6a7731bff2a31bfa1fe2caea1f7c845c19
generated_at: 2026-11-08T10:34:46.596198+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/response-headers.test.ts

## Purpose

Unit tests for the two post-bundle header-stamping steps (`withAppLevelHeaders` and `withIdempotentReplay`). The property under test is the stamping rule itself—every inline response gets the header, an operation's own header wins, and a `$ref` response is left untouched—so the tests drive the functions with minimal hand-built documents rather than a real generated spec.

## Key elements

- **`HEADERS`** – The root-map fixture (`x-request-id` → `RequestId`, `Cache-Control` → `CacheControl`) that the `withAppLevelHeaders` cases declare.
- **`bundle(root?)`** – Builds a minimal `OpenApiDocument` with one plain response, one response carrying its own `cache-control`, one `$ref` response, and a shared component response. Used by the `withAppLevelHeaders` suite.
- **`applied(step, document)`** – Thin wrapper that runs a mutating step in place and returns the document, keeping the `it` blocks one-liners.
- **`writes(created)`** – Builds a document for the `withIdempotentReplay` suite: one POST whose `parameters` reference an idempotency-key header (next to one that does not), and a caller-controlled 201 body.
- **`describe('withAppLevelHeaders')`** – Verifies that the declared root headers are stamped onto every inline response *and* every shared component, that an operation's own header (any case) is not overwritten, that `$ref` responses are skipped, that the root key is consumed, and that a missing map throws.
- **`describe('withIdempotentReplay')`** – Verifies that `Idempotent-Replay` is stamped only on the 2xx of operations whose parameters include the key (optional or required), never on other status codes or on operations without the key, and that a 2xx that is itself a `$ref` throws.

## Relationships

- **`scripts/contracts/openapi-document.ts`** – Provides the `OpenApiDocument` type that every fixture and assertion is typed against.
- **`scripts/contracts/response-headers.ts`** – The module under test; exports `withAppLevelHeaders` and `withIdempotentReplay`.
- **`tests/support/stub.ts`** – Supplies `asStub`, which silences excess-property checks so the hand-built fixtures pass through without full structural validation.

## Notes

- Both steps are **in-place mutators**; `applied` exists solely to keep the test reads linear. There is no separate "return a new document" contract.
- The root key `x-app-level-headers` is an *instruction* that the step deletes after reading it—tests assert it is gone from the resulting document.
- Header-case sensitivity matters in the "own header wins" assertion: the fixture declares lowercase `cache-control` while the root map uses `Cache-Control`, and the test confirms the operation's own entry is preserved regardless of case.
- `asStub` means runtime shape is not validated; the tests rely on TypeScript's type-check plus the `expect` matchers for correctness.
