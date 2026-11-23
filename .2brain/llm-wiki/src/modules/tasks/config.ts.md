---
source: src/modules/tasks/config.ts
source_sha256: 5137097cc3c742d2f94134ea25c941ac7d2412fb47ac26bf2a133d93060ad85b
context_sha256: da1fa31e4b634ff39d418081d44aade46f22f2dfc666a710dc284a20167989cd
generated_at: 2026-11-22T07:57:16.053276+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/config.ts

## Purpose
Declares the configuration for the tasks module: how long closed tasks are retained and how quickly contact-form messages are due (the response SLA). It exists so these two tunables are defined as validated, environment-driven settings in one place.

## Key elements
- `tasksConfig` — the exported config object, built with `defineConfig` under the name `'tasks'`. Its shape has two integer fields:
  - `NODE_TASKS_RETENTION_DAYS` — retention of closed tasks, default `730`, minimum `1`.
  - `NODE_TASKS_CONTACT_SLA_HOURS` — contact-message response SLA, default `48`, minimum `1`.

## Relationships
- `src/infrastructure/config/define.ts` — supplies `defineConfig`, which turns the name and shape into the config object.
- `src/infrastructure/config/fields.ts` — supplies the `int` field helper used for both settings.
- `src/modules/tasks/model.ts`, `src/modules/tasks/module.ts` and `src/modules/tasks/services/contact.ts` are graph neighbors of this file. This file imports nothing from them, and the file content shows no direct interaction.

## Notes
- Both values have a minimum of 1, so a zero or negative value is rejected by the field definition.
- The file's header carries a `@see` cross-reference about configuration ownership ("who owns what"). Its target path does not match a file in this repository, so check the project's operations docs for the current location.
