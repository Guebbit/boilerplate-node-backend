---
source: tests/support/webhook-events.ts
sha256: fdd026341f2f919f1e3fe48afa1990f5e40bcc5333d403996aa904e3f9909769
generated_at: 2026-10-15T13:03:15.252192+00:00
model: ollama:qwen3.8:27b
---

# tests/support/webhook-events.ts

## Purpose

Test-support helper that discovers webhook events by reading each module's `asyncapi.webhooks.yaml` fragment directly from disk. It exists so tests never hard-code event names: if a module (and its fragment) is removed, its events disappear from the expectation set automatically.

## Key elements

- **`declaredWebhookEvents(moduleNames?)`** — the sole export. Accepts an optional list of module names (defaults to every directory under `MODULES_ROOT`). For each name it looks for `asyncapi.webhooks.yaml`, parses the YAML, and collects the keys of `channels`. Returns the channel names sorted.
- **`fragmentOf(moduleName)`** (private) — builds the relative path to a module's webhook fragment.
- **`deployedModules()`** (private) — lists all subdirectories of `MODULES_ROOT`.

## Relationships

- **`tests/support/paths.ts`** — imports `MODULES_ROOT`, the single configuration value that anchors all filesystem lookups in this file.
- **`src/modules/webhooks/tests/contract/webhooks.test.ts`**, **`src/modules/webhooks/tests/unit/catalogue.test.ts`**, **`tests/cross-cutting/webhook-event-producers.test.ts`**, **`tests/unit/scripts/mutation/ci/waves.test.ts`** — consumer tests that call `declaredWebhookEvents` to obtain the expected set of webhook events without listing them by hand.

## Notes

- Deliberately avoids importing any application code; it reads YAML fragments by hand (the header comment and `paths.ts` precedent make this a project convention).
- A missing fragment file is silently skipped (`existsSync` filter), so a module without webhooks contributes nothing rather than throwing.
- Uses `Object.keys(document.channels ?? {})` — a fragment with no `channels` key is valid and yields zero events.
- Sorting uses `.toSorted()` (non-mutating), available in Node 20+/ES2023 runtimes.
