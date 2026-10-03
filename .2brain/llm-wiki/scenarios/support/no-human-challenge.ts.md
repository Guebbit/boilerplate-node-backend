---
source: scenarios/support/no-human-challenge.ts
sha256: c2d27525ab3df880ee18a93fea4a040538c75c81f1aeccb83c4881ba8ece5d4c
generated_at: 2026-10-01T12:24:19.183756+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/no-human-challenge.ts

## Purpose

Provides a scoped context manager (`withoutHumanChallenge`) that temporarily sets `NODE_ANTIBOT_PROVIDER` to `none` so that a flow-runner scenario can sign in and pay over real HTTP without the antibot provider refusing the first login. The provider is read per-request, so the build can be driven under "no challenge" and the original value restored afterwards.

## Key elements

- **`PROVIDER_VARIABLE`** (private constant) — the env-var name (`NODE_ANTIBOT_PROVIDER`) used to select the antibot provider.
- **`withoutHumanChallenge<T>(work: () => Promise<T>): Promise<T>`** (exported) — Saves the current value of the env var, sets it to `'none'`, awaits `work()`, then restores the original value (or deletes the key if it was previously unset). Rejections from `work` still trigger the restore via `.finally`.

## Relationships

- **`scenarios/index.ts`** — Consumes `withoutHumanChallenge` to wrap scenario builds that must run with the challenge provider off.
- **`tests/unit/scenarios/no-human-challenge.test.ts`** — Unit-tests the set/restore behavior, including the edge case where the variable was previously unset.

## Notes

- Restoring an *absent* variable requires `delete process.env[PROVIDER_VARIABLE]`, not assignment to `undefined` (which would store the literal string `"undefined"`). This is why the restore logic has two branches.
- The helper is intentionally synchronous to read the env var and asynchronous to execute the callback; it does not spawn or signal any process. A process that boots with the provider already on (e.g., a paired antibot suite) is unaffected because the build completes before that process starts listening.
- See `docs/modules/antibot.md` for the broader provider-selection contract.
