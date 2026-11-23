---
source: scripts/ops/check-config.ts
source_sha256: 86d43eaf16800c3031eb2ffc468ec6878953c1ce9065eb04fa2c1cfbdcdb76d6
context_sha256: 53e075686c02dc38adb18eff3b851115b8e007e81cf9f741272154c1432aa11d
generated_at: 2026-11-22T02:11:09.909487+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/ops/check-config.ts

## Purpose
Entry point for `npm run config:check`. It validates the environment and exits, opening no connections and doing no work. It exists because the `cron` healthcheck only shows that supercronic is alive, and each job validates configuration on its own. Without this check, a broken `.env` would look like a healthy container whose every job fails. Run before supercronic, it makes the container fail to start instead.

## Key elements
- `import '@infrastructure/config/dotenv'`: a side-effect import that loads and judges the environment.
- `runScript(undefined, () => Promise.resolve(), () => Promise.resolve())`: the only runtime call. It is invoked with `void`.
  - The first argument is `undefined` because this is not a scheduled job, so there is no outcome to record.
  - The other two arguments are no-op callbacks, because nothing is opened and nothing needs closing.

## Relationships
- `src/infrastructure/config/dotenv.ts`: imported for its side effects. Loading it is what performs the environment check.
- `scripts/run-script.ts`: provides `runScript`, the wrapper that runs the script.

## Notes
- `runScript` never rejects (failure is reported via `process.exitCode`), so the floating promise is deliberate, with an ESLint disable for `no-floating-promises`.
- The docs for this are in `docs/operate/health-checks.md#liveness-and-readiness`.
