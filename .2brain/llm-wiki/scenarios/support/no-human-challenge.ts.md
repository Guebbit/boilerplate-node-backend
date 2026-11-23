---
source: scenarios/support/no-human-challenge.ts
source_sha256: 7c57e9944ff31df4f69df6b9d4bd0ef6a649566466e40e6004159b47c7c81a23
context_sha256: 4c397b83b7e330898bbba27fb3d78202f7d719d5192ed66af02b75a6759bb3b8
generated_at: 2026-11-22T01:49:04.616875+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/no-human-challenge.ts

## Purpose
Provides `withoutHumanChallenge`, a helper that builds a scenario with the human-challenge (antibot) provider turned off. The flow runner signs in and pays over real HTTP and cannot solve a challenge, so with a provider enabled the first login would be refused and the shop would never be built. See `src/modules/antibot/module.ts` for the antibot module.

## Key elements
- `withoutHumanChallenge<T>(work)`: overrides `NODE_ANTIBOT_PROVIDER` to `'none'`, runs `work()`, and restores the previous state once the promise settles (via `.finally`). It returns whatever `work` resolved to. A rejection passes through after the restore.
- `PROVIDER_VARIABLE` (module-private): the name of the variable that selects the provider, `NODE_ANTIBOT_PROVIDER`.

## Relationships
- `src/infrastructure/config/store.ts`: supplies `overrideEnvironment`, which this file uses to set the override. The function returns an undo callback, which is passed to `.finally`.
- `scenarios/index.ts` and `tests/unit/scenarios/no-human-challenge.test.ts`: graph neighbors, presumably the scenario entry point and the unit test. The file itself shows no import or export link to either, so no interaction is documented here.

## Notes
- It uses an override rather than writing `process.env`, because the config store reads the process environment only once.
- The undo restores the prior state exactly, including a variable that was unset.
- A process that boots with the provider on, such as the paired suite's antibot run, still serves the challenge. The scenario build happens before the process listens, so the override only covers the build.
