---
source: scripts/contracts/asyncapi-webhook-events.ts
sha256: 50c2c79282141dabb54b872d0e5256024dcf015dc2ef97b408e0f3dc54db9d95
generated_at: 2026-10-15T09:35:37.657349+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/asyncapi-webhook-events.ts

## Purpose

Discovers per-module AsyncAPI webhook-event fragments from disk and merges them into the `webhooks` section of the bundled AsyncAPI document. Exists as its own module so the bundler interacts with it through a single call (`withWebhookEvents`) and the discovery logic stays independently testable.

## Key elements

- **`webhookEventFragments()`** — Returns absolute paths to every `asyncapi.webhooks.yaml` file found under module directories, ordered by `FRAGMENT_ORDER` then alphabetically.
- **`withWebhookEvents(section, document, merge)`** — The bundler hook. If `section` is `"webhooks"`, reads each fragment, parses it with `yaml`'s `parseDocument`, and hands it to the bundler's `merge` function. All other sections are returned unchanged.
- **`WEBHOOKS_SECTION`** (`"webhooks"`) — The only section this file mutates.
- **`FRAGMENT_FILE`** (`"asyncapi.webhooks.yaml"`) — The per-module file name that marks a module as a webhook owner.
- **`FRAGMENT_ORDER`** (`['orders', 'delivery', 'payments', 'returns']`) — Narrative ordering for known shop modules; any other module sorts alphabetically after this list.

## Relationships

- **`./section-order.ts`** — Provides `orderSections`, used to apply `FRAGMENT_ORDER` before falling back to alphabetical.
- **`../modules-on-disk.ts`** — Provides `MODULES_ROOT` (the directory root to scan) and `modulesWith` (the disk-discovery predicate that finds modules shipping `FRAGMENT_FILE`).
- **`./asyncapi-bundles.ts`** — The bundler that calls `withWebhookEvents` during assembly; supplies the `merge` callback that enforces duplicate-key rejection.
- **`tests/unit/scripts/contracts/asyncapi-webhook-events.test.ts`** — Unit tests exercising the discovery and merge behaviors in isolation.

## Notes

- `FRAGMENT_ORDER` is a *preference* list, not a registry — modules not listed are not excluded, they simply sort after the listed ones.
- `parseDocument` is called with `{ keepSourceTokens: true }` so each merged node retains its authored YAML style (indentation, quoting, etc.) rather than being re-serialized.
- The `merge` callback is owned by the bundler, not by this file; duplicate-key detection and error messaging are the bundler's responsibility.
- A module that does not ship `asyncapi.webhooks.yaml` simply never appears in the fragment list — there is no explicit opt-in/out flag.
