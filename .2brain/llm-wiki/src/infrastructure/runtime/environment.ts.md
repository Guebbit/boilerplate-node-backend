---
source: src/infrastructure/runtime/environment.ts
sha256: 09b2929ff28e56c1ba85a78990081bb87671dc2509d63773f473f4f16e7ad926
generated_at: 2026-09-23T17:52:00.247114+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/environment.ts

## Purpose

Centralises the string-to-typed-value coercion for every `process.env` reader in the app. Because all values arrive as strings and there are only a handful of shapes (integer, decimal, boolean, closed-set choice), this module defines one strict parser per shape so no caller re-implements its own and silently produces `NaN`. Reads are always lazy (`process.env[key]` at call time), so tests and late-set variables work regardless of import order.

## Key elements

- **`environmentNumber(key, fallback, min?)`** — Reads a whole base-10 integer from the environment. Rejects hex, unit suffixes, and partial digits via a strict regex. Optionally enforces a lower bound (`min`); values below it fall back.
- **`parseEnvironmentDecimal(raw)`** — Pure string-to-decimal parser (no env lookup). Returns `number | undefined`. Rejects scientific notation, missing leading digits, and whitespace.
- **`environmentDecimal(key, fallback)`** — Env-var convenience wrapper around `parseEnvironmentDecimal`; falls back when unset or unparseable.
- **`parseBooleanWord(word)`** — Decodes a single word (`1/true/yes/on` or `0/false/no/off`, case-insensitive) to `true`/`false`/`undefined`. Uses `Set.has` to avoid prototype-chain pitfalls.
- **`environmentFlag(key, fallback)`** — Reads a boolean switch from the environment; accepts both "kill-switch" (`!== '0'`) and "opt-in" (`'1'`/`'true'`) vocabularies.
- **`environmentChoice<T>(key, allowed, fallback)`** — Reads a closed-set selector (provider/mode). Trims, lower-cases, validates against `allowed`, **throws** on an unrecognised value rather than silently falling back.

## Relationships

- Consumed by the adapter and middleware layers (antibot providers, mailer, logger, cache, queue, image, HTTP middlewares) which call `environmentChoice` for their provider/transport selectors (`NODE_ANTIBOT_PROVIDER`, `NODE_MAIL_TRANSPORT`, `NODE_LOG_PERSONAL_FIELDS`, etc.) and `environmentNumber`/`environmentFlag` for tunable thresholds.
- Ops scripts (`reap-inactive-accounts`, `reap-mail-spool`, `reap-quarantine`) read their interval/batch-size settings through `environmentNumber`.
- `src/app/security.ts` and `src/cluster.ts` use `environmentFlag` and `environmentNumber` for boot-time feature switches and port/size values.
- This file imports nothing; it is a pure, side-effect-free utility module.

## Notes

- **Strict whole-string matching is intentional.** `environmentNumber("NODE_MAX_UPLOAD_BYTES")` with a value like `5mb` silently returns the fallback — there is no partial-numeric recovery. If you see a "wrong" default at runtime, check the raw env value for stray characters.
- **`environmentChoice` throws, not falls back.** Unlike the other readers, an unrecognised value is a hard error with a message listing the allowed set. This is the only path in this module that can crash boot.
- **`parseBooleanWord` uses `Set` lookups deliberately** to sidestep `Object.prototype` keys (`constructor`, `__proto__`). Do not "simplify" this to a plain object.
- **Decimal parsing and integer parsing are separate on purpose.** `Number("0900")` is fine, but `Number(".5")` is `0.5` while the integer regex rejects it. A caller that needs fractions must use `environmentDecimal`, not `environmentNumber`.
