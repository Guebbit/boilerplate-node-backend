---
source: tests/support/expect-warning.ts
sha256: c4776dfbdfe94736761e797a70971b1324ce77341ba32d0caff6aced7fbef687
generated_at: 2026-11-08T09:54:30.255387+00:00
model: ollama:qwen3.8:27b
---

# tests/support/expect-warning.ts

## Purpose

Provides a per-test-case warning watcher that intercepts `console.warn`, `console.error`, and `process` `'warning'` events. Any warning not explicitly declared by the case causes a failure, and any declared warning that never fires also causes a failure. This makes deprecations and stray console output impossible to accidentally ship as "green."

## Key elements

- **`WarningMatcher`** (type) — `string | RegExp`; a substring or pattern a case declares it expects to see.
- **`ConsoleTarget`** (type) — the two console methods the watcher wraps (`warn`, `error`).
- **`WarningEmitter`** (interface) — the minimal `process` surface the watcher listens on (`on`/`off` for `'warning'`).
- **`createWarningWatcher(target, emitter)`** — factory returning `{ start, expect, finish }`. `start` wraps the console and subscribes to process warnings; `expect` records a matcher; `finish` restores originals and throws if there are unexpected warnings *or* declarations that never fired.
- **`warnings`** (export) — the singleton watcher bound to the real `console` and `process`; used by `setup-fail-on-warning.ts` around every case.
- **`expectWarning(matcher)`** (export) — the only call a test case makes: declares that a warning matching the given substring/pattern is expected and *must* fire.

## Relationships

- **`tests/support/setup-fail-on-warning.ts`** — calls `warnings.start()` before each case and `warnings.finish()` after, so the watcher is always active. Test cases interact with it exclusively through `expectWarning`.
- **`tests/unit/support/expect-warning.test.ts`** — exercises `createWarningWatcher` against a fake `ConsoleTarget` and `WarningEmitter`, verifying match/unmatch, must-fire, and restoration behavior.

## Notes

- **Must-fire semantics:** declaring a warning is a two-way contract — the warning must appear *and* nothing else may appear. A stale declaration (warning removed from the code) fails the test, not just an unannounced warning.
- **Console spies bypass the watcher:** if a test replaces `console.warn` itself, the call never reaches the wrapped function, so that test is responsible for its own expectations.
- **Matching is text-only:** the `source` label (`console.warn`, `DeprecationWarning`, etc.) appears in the error report but is not part of the match. Matchers only see the joined argument text (or `Error.message` for `Error` args).
- **Not `jest-fail-on-console`:** chosen deliberately because that library lacks the must-fire check and cannot observe `process` `'warning'` events.
