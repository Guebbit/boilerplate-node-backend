---
source: tests/cross-cutting/authorization-conformance.test.ts
sha256: f76171dbfc99d669c583ce03b97028ad5f5924d059a281e843b0f34dbcfc1ff9
generated_at: 2026-09-23T19:53:56.168247+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/authorization-conformance.test.ts

## Purpose

Cross-cutting conformance test that validates the TypeScript/CASL evaluator against a shared YAML case file (`shared/authorization-conformance.yaml`) committed byte-identical in both backends. It ensures the TS side answers every allow/deny case the same way the PHP/Laravel side (Gate + Policies) does, and includes "floor" assertions so a missing or empty case file cannot masquerade as a passing suite.

## Key elements

- **`ConformanceCase`** — interface describing one YAML entry: `name`, `caller`, `action`, `subject`, `resource`, `expect` (`'allow' | 'deny'`).
- **YAML load** — reads and parses `shared/authorization-conformance.yaml` at module scope; the resolved `cases` array drives all assertions.
- **`MIN_CASES` / `MIN_DENY` / `MIN_ALLOW`** (30 / 20 / 10) — floor thresholds. A dedicated test asserts the file meets all three so a zero-case file fails loudly.
- **`it.each(cases…)`** — iterates every case, builds an ability via `buildAbility(caller)`, evaluates `ability.can(action, subject(type, resource))`, and asserts the allow/deny verdict matches the YAML expectation.

## Relationships

- **`src/kernel/ability.ts`** — provides `buildAbility(caller)`, the factory that constructs a CASL `Ability` for a given `Caller`. Every conformance case is evaluated through it.
- **`src/types/auth-context.ts`** — source of the `Caller` type (the caller/identity shape used in both the YAML cases and `buildAbility`).
- **`src/types/index.ts`** — barrel export; the test imports `Caller` via the `@types` alias that resolves to this file.

## Notes

- The YAML file is **not** copied between repos; each backend commits an identical byte-for-byte copy. There is no sync mechanism.
- The floor checks exist because a suite that reads zero cases would report green forever. Allow and deny are floored **separately** because an evaluator that denies everything would still satisfy all deny cases.
- `subject()` from `@casl/ability` is used rather than a class constructor because the resource arrives as a plain attribute object from YAML — no class is involved.
- The same floor constants are duplicated in `check-references.ts`; keep them in sync if either is changed.
