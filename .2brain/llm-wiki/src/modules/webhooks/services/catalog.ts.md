---
source: src/modules/webhooks/services/catalog.ts
sha256: 636566e506b43b4a1887f334560884d381917ee3dae7cce13959cc8167f1ed61
generated_at: 2026-11-14T22:46:17.778454+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/catalog.ts

## Purpose

Builds a static, in-memory event catalogue from each registered module's `asyncapi.webhooks.yaml` fragment, then answers three questions: which events exist, which events a given caller may subscribe to, and which requested event names are unknown. Centralising the source so the public endpoint, the subscribe permission check, and the generated contract can never drift.

## Key elements

- **`registerWebhookCatalog(moduleNames)`** – Exported; called once at boot (from `onRegistered`). Reads each module's `asyncapi.webhooks.yaml`, validates its `x-read-rule`, and populates the module-level `catalogue` array. No disk I/O on later requests.
- **`listWebhookEventCatalog(caller)`** – Exported; returns every catalogue entry annotated with a `subscribe` boolean indicating whether the caller may receive the event.
- **`unknownEventTypes(eventTypes)`** – Exported; returns requested event names absent from the catalogue (the `ALL_EVENTS` wildcard is always accepted). Used for 422 validation.
- **`unreadableEventTypes(eventTypes, caller)`** – Exported; returns catalogue events the caller does not hold a read rule for. Skips unknown names (that is `unknownEventTypes`'s concern).
- **`assertReadRule`** (internal) – Validates at boot that each event declares either `"public"` or a tenant-scoped, unconditioned permission rule; throws otherwise.
- **`eventsOf`** (internal) – Reads and parses one module's YAML fragment into `CatalogEvent[]`.
- **`mayRead`** (internal) – Returns a boolean: the event is `public`, or the caller's `heldRules` set contains the event's read rule.
- **`catalogue`** (module state) – `readonly CatalogEvent[]`, empty until `registerWebhookCatalog` runs.

## Relationships

- **`src/kernel/ability.ts`** – Imports `heldRules` to check whether a caller holds a rule at request time.
- **`src/kernel/permissions.ts`** – Imports `findRule` and `PermissionRuleId` to validate and type `x-read-rule` values at boot.
- **`src/modules/webhooks/domain/index.ts`** – Imports `ALL_EVENTS` (the `"*"` wildcard) for the unknown/unreadable filter helpers.
- **`src/types/index.ts`** – Imports `Caller`, `WebhookEventCatalogEntry`, `WebhookEventName`.
- **`src/modules/webhooks/services/index.ts`** – Barrel that re-exports this module's public API for consumers within the webhooks service layer.
- **`src/modules/webhooks/services/subscriptions.ts`**, **`actions.ts`**, **`deliveries.ts`** – Sibling webhooks services in the dependency graph that consume this module's exported helpers.
- **`src/modules/webhooks/tests/unit/catalog.test.ts`** – Unit-tests the catalogue build, permission filtering, and wildcard handling.
- **`src/modules/webhooks/tests/integration/event-read-rule.test.ts`** – Integration test for read-rule enforcement.
- **`src/modules/webhooks/tests/integration/subscription-lifecycle.test.ts`** – Exercises the subscribe path that depends on `listWebhookEventCatalog` / `unreadableEventTypes`.

## Notes

- **Boot-time only.** Fragments are static YAML files read once; a request path never touches the filesystem.
- **Module folder = registry name.** `MODULES_DIRECTORY/<moduleName>/asyncapi.webhooks.yaml` maps a module's `AppModule.name` to its directory under `src/modules/`. A module that ships no fragment contributes zero events.
- **`WebhookEventName` cast is intentional.** The enum is generated at bundle time (`npm run contracts:bundle`) from the same channel keys, so the compiler cannot verify a disk-read string belongs to it; the `as WebhookEventName` cast is the bridge.
- **Read-rule strictness.** `assertReadRule` rejects platform-scoped, conditioned, or undeclared rules. A tenant rule like `read:Order` would pass every customer and gate nothing, so it is disallowed.
- **`ALL_EVENTS` (`"*"`) is a universal wildcard.** It is never flagged as unknown and expands to every catalogue event in `unreadableEventTypes`.
- **Separation of unknown vs. unreadable.** `unknownEventTypes` is the 422 gate; `unreadableEventTypes` is the 403/permission gate. Callers should check the former first.
