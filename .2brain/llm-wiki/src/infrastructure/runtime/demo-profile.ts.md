---
source: src/infrastructure/runtime/demo-profile.ts
sha256: 879e73ce61473e13b669d80c8810d09652eccedd9e17a12a04bc034004c9ffe5
generated_at: 2026-09-23T17:51:43.243087+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/demo-profile.ts

## Purpose

Holds a single in-process flag (`demoProfileEnabled`) and exposes the two functions that set it (`enableDemoProfile`) and query it (`isDemoMode`). It exists so that every consumer—the kernel boot gate, the mailer, `app.ts`, two `account` providers, and `scenarios/run-server.ts`—has exactly one import path (`@infrastructure/runtime/demo-profile`) to check "is this a demo run?" without coupling to each other.

## Key elements

- **`demoProfileEnabled`** (module-level `let`, not exported) — the actual boolean. Lives for the life of the process only; a restart resets it to `false`.
- **`enableDemoProfile(enabled?: boolean)`** — the sole mutator. Defaults to `true`. Called in-process before `src/app.ts` is imported. Tests may call it directly and **must** call `enableDemoProfile(false)` in cleanup to prevent flag leakage between tests.
- **`isDemoMode(): boolean`** — the sole reader. Returns `true` only when `demoProfileEnabled` is set **and** `NODE_ENV !== 'production'`. If the flag is set but `NODE_ENV` is `production`, it logs an `error` via the logger and returns `false`. Stryker mutations are disabled around that error-log branch.

## Relationships

- **`scenarios/run-server.ts`** — the only non-test caller of `enableDemoProfile`; invokes it before `src/app.ts` is imported.
- **`src/app.ts`** — reads `isDemoMode` during bootstrap.
- **`src/infrastructure/adapters/logger.ts`** — imported; used solely for the production-refusal `error` log inside `isDemoMode`.
- **`src/infrastructure/adapters/mailer.ts`** — reads `isDemoMode` to divert mail behavior.
- **`src/kernel/required-config.ts`** — the "boot secrets gate" that `isDemoMode` can skip.
- **`src/modules/account/oauth/providers/index.ts` / `src/modules/account/two-factor/methods/email.ts`** — two `account`-module providers that read `isDemoMode`.
- **Test files** (`demo-profile.test.ts`, `required-config.test.ts` (both copies), `mailer-transport.test.ts`, `oauth-providers.test.ts`, `oauth.contract.test.ts`, `config.test.ts`) — call `enableDemoProfile` to exercise demo-mode code paths without booting the full server.

## Notes

- The flag is **in-memory only** by design. The doc comment explicitly states that a copied `.env` must never be able to activate demo mode; there is no environment-variable check for *enabling*, only for *refusing* (the `NODE_ENV` production guard in `isDemoMode`).
- `scenarios/run-server.ts` **defaults** `NODE_ENV` to `development` but does **not** override a shell-supplied `NODE_ENV=production`. The `isDemoMode` production check is the safety net that catches that case and logs at `error` rather than silently mounting.
- The import path is deliberately fixed to `@infrastructure/runtime/demo-profile`. The module doc warns against re-exporting it from `app/demo.ts` or any other location.
