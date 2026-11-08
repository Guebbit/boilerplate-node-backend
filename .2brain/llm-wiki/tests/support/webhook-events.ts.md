---
source: tests/support/webhook-events.ts
sha256: fdd026341f2f919f1e3fe48afa1990f5e40bcc5333d403996aa904e3f9909769
generated_at: 2026-11-08T10:02:03.400875+00:00
model: ollama:qwen3.8:27b
---

# tests/support/webhook-events.ts

## Purpose

Test-support utility that reads each module's `asyncapi.webhooks.yaml` fragment directly from disk (never through application code) and returns the set of declared channel names. It exists so webhook-related tests can derive their expectations from the contract files themselves — delete a module, and its events disappear from the test automatically.

## Key elements

- **`fragmentOf(moduleName)`** *(internal)* — Builds the filesystem path to a module's `asyncapi.webhooks.yaml` under `MODULES_ROOT`. The file is optional.
- **`deployedModules()`** *(internal)* — Returns the names of all directories under `MODULES_ROOT` (i.e. every module folder in the checkout).
- **`declaredWebhookEvents(moduleNames?)`** *(exported)* — For each named module (defaults to all deployed modules), reads the YAML fragment if it exists, extracts the keys of its `channels` map, and returns the combined list sorted alphabetically.

## Relationships

- **`tests/support/paths.ts`** — Provides `MODULES_ROOT`, the base directory from which all fragment paths are resolved.
- **`src/modules/webhooks/tests/contract/webhooks.contract.test.ts`** — Consumes `declaredWebhookEvents` to build the expected event list for contract assertions.
- **`src/modules/webhooks/tests/unit/catalog.test.ts`** — Consumes `declaredWebhookEvents` to verify the catalog covers every declared event.
- **`tests/cross-cutting/webhook-event-producers.test.ts`** — Consumes `declaredWebhookEvents` to check that producers exist for each declared event.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Uses the same contract-fragment data to validate CI wave groupings.

## Notes

- The file intentionally imports **only** Node built-ins, `yaml`, and `./paths`. It never imports application code, keeping test expectations independent of runtime wiring.
- A module directory may lack an `asyncapi.webhooks.yaml` file; `existsSync` guards against that rather than throwing.
- Uses `.toSorted()` (ES 2023 non-mutating sort) rather than `.sort()`.
- YAML is parsed with the `yaml` package's `parse`, not `js-yaml`.
