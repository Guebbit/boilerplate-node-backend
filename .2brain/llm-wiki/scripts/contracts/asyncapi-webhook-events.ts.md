---
source: scripts/contracts/asyncapi-webhook-events.ts
sha256: f45eff201ce55981e6ca19b7d6605b9029e04795248966065af06f401864178f
generated_at: 2026-10-14T07:09:15.689330+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/asyncapi-webhook-events.ts

## Purpose

Discovers per-module AsyncAPI webhook-event fragments on disk and merges them into the `webhooks` section of an AsyncAPI bundle. It exists so the bundler needs only a single call (`withWebhookEvents`) to fold in all webhook events, and so the discovery rule is independently unit-testable.

## Key elements

- **`webhookEventFragments(): string[]`** — Scans `src/modules/*/asyncapi.webhooks.yaml` and returns absolute file paths in a preferred module order (orders → delivery → payments → returns), then alphabetically for the rest.
- **`withWebhookEvents(section, document, merge): Document`** — The entry point the bundler calls. If `section` is not `'webhooks'`, returns the document unchanged. Otherwise parses each fragment with `yaml#parseDocument` (`keepSourceTokens: true`) and hands it to the bundler-supplied `merge` callback.
- **`WEBHOOKS_SECTION`** — `'webhooks'`; the only section this file touches.
- **`FRAGMENT_FILE`** — `'asyncapi.webhooks.yaml'`; the filename a module must ship to opt in.
- **`FRAGMENT_ORDER`** — `['orders', 'delivery', 'payments', 'returns']`; a narrative preference, not a registry.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — Provides `REPO_ROOT`, the base path used to locate the `src/modules` directory.
- **`scripts/contracts/section-order.ts`** — Provides `orderSections`, which applies `FRAGMENT_ORDER` and appends remaining modules alphabetically.
- **`scripts/contracts/asyncapi-bundles.ts`** — The bundler that imports and calls `withWebhookEvents` as part of its per-section dispatch, and supplies the `merge` callback (which enforces the no-duplicate-key invariant across owners).
- **`tests/unit/scripts/contracts/asyncapi-webhook-events.test.ts`** — Direct unit tests for fragment discovery and merge behavior.
- **`tests/unit/scripts/contracts/analytics-browser-events.test.ts`** — Sibling test in the same contracts test directory; exercises related bundler section-dispatch paths.

## Notes

- **Conflict handling is delegated.** This file never compares keys across fragments; the bundler's `merge` callback is responsible for refusing a key that two modules both declare.
- **`keepSourceTokens: true`** is passed to `parseDocument` so that authored YAML style (comments, block vs. flow syntax, indentation) survives into the merged document.
- **Opt-in is by file existence.** A module participates only if it ships `asyncapi.webhooks.yaml`; there is no manifest or registry to update.
- **Sections other than `webhooks` are returned verbatim.** The guard at the top of `withWebhookEvents` ensures this file is a no-op for, e.g., `events` or `channels`.
