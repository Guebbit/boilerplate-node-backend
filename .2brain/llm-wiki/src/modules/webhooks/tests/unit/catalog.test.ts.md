---
source: src/modules/webhooks/tests/unit/catalog.test.ts
sha256: a91d50fe61f4d247e1e8e07b0ce021d1bd0e8532eb378ff9f08158c46f72e658
generated_at: 2026-11-14T22:51:45.793310+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/catalog.test.ts

## Purpose

Unit tests for the webhook event catalog service (`src/modules/webhooks/services/catalog.ts`). Verifies that the catalog lists only events from registered modules, correctly validates unknown event types, enforces per-caller read rules (subscribe permissions), and rejects modules whose channel fragment lacks a usable `x-read-rule`.

## Key elements

- **`listedNames()`** – local helper; calls `listWebhookEventCatalog(callerAs('admin'))` and returns a sorted array of event names.
- **`describe('registerWebhookCatalog')`** – asserts the catalog is empty by default, lists only events of given modules, skips modules with no fragment, and preserves channel descriptions.
- **`describe('unknownEventTypes')`** – asserts that listed names and the `*` wildcard pass, unknown names are deduplicated in request order, and events of unregistered modules are flagged.
- **`describe('read rules')`** – verifies the `actions.subscribe` boolean per event for different caller roles (admin / manager / customer), wildcard expansion in `unreadableEventTypes`, and that an own-rows caller cannot subscribe to a staff-scoped event.
- **`describe('registerWebhookCatalog — a channel without a usable x-read-rule')`** – parameterised test that mocks `fs.existsSync`/`fs.readFileSync` to simulate a YAML fragment whose `x-read-rule` is missing, undeclared, or own-rows, and asserts `registerWebhookCatalog` throws at boot.

## Relationships

- **`src/modules/webhooks/services/catalog.ts`** – the system under test. The file imports `listWebhookEventCatalog`, `registerWebhookCatalog`, `unknownEventTypes`, and `unreadableEventTypes` and exercises all four.
- **`tests/support/callers.ts`** – provides `callerAs(role)` to produce caller objects with specific RBAC scopes (admin, manager, customer) used throughout the read-rule tests.
- **`tests/support/webhook-events.ts`** – provides `declaredWebhookEvents(moduleNames)` as the single source of truth for expected event-name sets, avoiding hard-coded lists in the test assertions.

## Notes

- Every `describe` block resets the catalog with `registerWebhookCatalog([])` in `afterEach` (or `beforeEach` in the read-rules block) to prevent cross-test contamination.
- The boot-failure test mutates `fs` via `jest.spyOn` and restores with `jest.restoreAllMocks()`; the mocked fragment is a minimal YAML string, not a real file.
- The wildcard `'*'` is treated as "every event in the catalog" by both `unknownEventTypes` and `unreadableEventTypes`; tests rely on this semantic rather than expanding it manually.
- `declaredWebhookEvents` is the canonical list per module; tests compare against it instead of hard-coding event names, so adding an event to a module's fragment only requires updating the source fragment, not the test.
