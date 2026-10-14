---
source: src/infrastructure/runtime/environment.ts
sha256: c01c4f801d54c0b9772d1a10e76669c2fadb380130193f214c3b4f7138eb63f2
generated_at: 2026-10-14T08:13:34.300490+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/environment.ts

## Purpose

Defines the shared vocabulary of boolean "words" (`true`, `false`, `yes`, `no`, `1`, `0`, `on`, `off`) and a single parser that decodes one of those words into a boolean. It exists so that configuration fields and HTTP request parsing (query strings, form fields) agree on the same on/off spelling without duplicating the list. It does **not** read `process.env` itself — each variable is still read by its owning `config.ts` via `defineConfig`.

## Key elements

- **`TRUTHY_WORDS`** (`readonly string[]`) — `['1', 'true', 'yes', 'on']`. Exported so consumers can inspect the accepted "on" spellings.
- **`FALSY_WORDS`** (`readonly string[]`) — `['0', 'false', 'no', 'off']`. The accepted "off" spellings.
- **`parseBooleanWord(word: string): boolean | undefined`** — Trims and lower-cases the input, then checks membership in a pre-built `Set`. Returns `true`, `false`, or `undefined` (unrecognised / blank).
- **`TRUTHY` / `FALSY`** (module-private `Set` instances) — Backing lookup structures; never exported.

## Relationships

- **`src/infrastructure/config/fields.ts`** — Imports `parseBooleanWord` to coerce boolean-type config field values from their raw string form.
- **`src/infrastructure/http/request.ts`** — Uses the same word list when decoding query-string parameters and form fields that carry an on/off flag.
- **`tests/unit/infrastructure/runtime/environment.test.ts`** — Unit-tests `parseBooleanWord` (case insensitivity, trimming, unrecognised input, boundary values).

## Notes

- **`Set` over plain-object lookup.** The code deliberately uses `Set.has` rather than `'word' in obj` or `obj[word]`. A plain object lookup would hit inherited `Object.prototype` members (e.g. `'constructor'`), which could turn attacker-controlled text into a truthy match. `Set` has no prototype-chain fallback.
- **Return type is `boolean | undefined`, not `boolean`.** Callers must treat `undefined` as "not a recognised word" and handle it explicitly (e.g. default to a safe value). Do not rely on a bare truthiness check without considering that `false` is also falsy.
- **The file is a vocabulary module, not an env reader.** Despite the name `environment.ts`, it never touches `process.env`. The name refers to the *domain* (environment-variable-style words), not the act of reading the environment.
