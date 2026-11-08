---
source: scripts/contracts/response-headers.ts
sha256: 30f538dd5cfa99a602eff947fc8644c2b76ed142f8639a22f7faf922388bc84d
generated_at: 2026-11-08T02:44:27.741695+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/response-headers.ts

## Purpose

Provides two late-stage OpenAPI document transformation steps that stamp response headers onto the bundled `openapi.yaml` without requiring per-operation duplication. Because these headers are set by middleware (not route handlers), a hand-copied list on every operation would go stale silently; stamping them once at bundle time keeps the published contract in sync with actual behavior.

## Key elements

- **`withAppLevelHeaders`** (exported `Step`) — Reads the root's `x-app-level-headers` map (`{ headerName: componentKey }`), adds a `$ref` header to every inline response that doesn't already declare one (case-insensitive check), then deletes the key from the document. Throws if the map is missing or malformed.
- **`withIdempotentReplay`** (exported `Step`) — For every operation whose parameters include one of the two shared `Idempotency-Key` parameter `$ref`s, attaches an `Idempotent-Replay` header `$ref` to each 2xx response. Throws if a 2xx is a `$ref` (can't attach a header to a reference).
- **`inlineResponsesOf`** (internal) — Collects all non-`$ref` response objects from operations and `components/responses` into a flat array.
- **`declares`** (internal) — Case-insensitive check whether a headers object already contains a given header name.
- **`isHeaderMap`** (internal) — Type guard: non-empty object whose values are all strings.
- **`IDEMPOTENCY_PARAMETERS`** (internal const) — The two `#/components/parameters/…` `$ref` strings that mark an operation as idempotent.
- **`REPLAY_HEADER`** (internal const) — `'Idempotent-Replay'`, used as both the header name and the `components/headers` key.

## Relationships

- **`scripts/contracts/openapi-document.ts`** — Imports `operationsOf`, `Operation`, `OpenApiDocument`, and the `Step` type. All operations are enumerated through `operationsOf`.
- **`scripts/contracts/openapi-bundle.ts`** — Consumes both exported steps; they run *after* the steps that add operation-specific headers, guaranteeing an operation's own header always wins.
- **`scripts/audit/api-standards.yaml`** — Defines the contract standard that requires the root `x-app-level-headers` map; this file's first step throws if the map is absent.
- **`tests/unit/scripts/contracts/response-headers.test.ts`** — Unit tests covering both steps, the never-overwrite rule, the `$ref`-2xx guard, and the idempotency-key parameter detection.

## Notes

- **Ordering is a contract.** Both steps must run after any step that writes operation-specific headers. The "never overwrites" guard in `withAppLevelHeaders` and the unconditional set in `withIdempotentReplay` both depend on this.
- **`x-app-level-headers` is ephemeral.** `withAppLevelHeaders` deletes it from the document before the bundle is written. It is an instruction to the script, not part of the published OpenAPI spec.
- **Idempotency is parameter-driven.** There is no separate marker or list; the presence of a known `Idempotency-Key` parameter `$ref` is the sole trigger for `Idempotent-Replay`. Adding the parameter to a route is the only opt-in step.
- **`$ref` 2xx is a hard error for idempotent ops.** A `$ref` response cannot carry an inline header, so `declareReplay` throws rather than silently skipping.
