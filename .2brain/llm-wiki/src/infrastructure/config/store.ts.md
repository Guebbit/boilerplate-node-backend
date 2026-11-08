---
source: src/infrastructure/config/store.ts
sha256: 3c271da4dea2de2b654d4450e9a69e67679952f1b89d66937095fb2337ecd8b0
generated_at: 2026-11-08T03:28:12.928420+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/store.ts

## Purpose

Single choke-point for reading and overriding the process environment. On first access it freezes a snapshot of `process.env`, then layers caller-supplied overrides on top (and resolves `NODE_X_FILE` secret files). A version counter lets config slices cache their parsed values and know when to re-derive. State is pinned to `globalThis` via `Symbol.for` so a `jest.resetModules()` re-import still finds the same object.

## Key elements

- **`Environment` / `EnvironmentOverrides`** – readonly record types; `undefined` value in overrides means "unset this variable."
- **`currentEnvironment()`** – returns the effective env (snapshot → overrides → `resolveSecretFiles`). Memoized until the version changes.
- **`environmentVersion()`** – the monotonically-increasing counter; slices compare it to detect staleness.
- **`refreshEnvironment()`** – discards the snapshot so the next `currentEnvironment()` re-reads `process.env` (used after `.env` loading).
- **`overrideEnvironment(entries)`** – applies a temporary override layer; returns an undo closure that restores the prior per-name state (distinguishing "no override" from "overridden to unset").
- **`installEnvironment(entries)`** – alias for `overrideEnvironment` with no undo; the `createApp({ env })` entry point.
- **`markEnvironmentOverrides()` / `resetEnvironmentOverrides()`** – save/restore pair for test harnesses; reset refills the existing `Map` in place so previously-issued undo closures remain valid.

## Relationships

- **`./secret-files.ts`** – imported directly; `resolveSecretFiles` is called inside `currentEnvironment()` after the override merge.
- **`src/infrastructure/config/define.ts`** – config slices created here call `currentEnvironment()` / `environmentVersion()` to obtain and cache values.
- **`src/infrastructure/config/dotenv.ts`** – after loading a `.env` file, calls `refreshEnvironment()` to force a new snapshot.
- **`src/app.ts`** – calls `installEnvironment()` with the `env` option passed to `createApp`.
- **`scenarios/support/development-doubles.ts`**, **`doubles/webhook-sink.ts`**, **`no-human-challenge.ts`** – test/development doubles that use `overrideEnvironment` / `markEnvironmentOverrides` / `resetEnvironmentOverrides` to inject fake credentials or disable features per scenario.
- **`src/modules/account/session/config.ts`**, **`post-oauth-link-start.ts`** – downstream consumers that read their settings through a slice, which in turn reads from this store.

## Notes

- **Immutability:** both `snapshot` and the returned `merged` are `Object.freeze`-d. Mutating the returned object throws in strict mode.
- **`undefined` semantics:** in `EnvironmentOverrides`, a key mapped to `undefined` *removes* the variable from the effective env; a key simply absent means "leave the snapshot value alone." The undo closure preserves this distinction.
- **In-place reset:** `resetEnvironmentOverrides` clears and refills the *same* `Map` instance rather than replacing it, so any undo function handed out by an earlier `overrideEnvironment` call still mutates the live map.
- **No write-back:** resolved secret-file values never touch `process.env`; they exist only in the in-memory `merged` object.
- **Snapshot is truly one-shot:** once taken, later changes to `process.env` are invisible until an explicit `refreshEnvironment()` call.
