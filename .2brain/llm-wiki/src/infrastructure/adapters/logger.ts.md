---
source: src/infrastructure/adapters/logger.ts
source_sha256: 54c8c9a9944a046ba0a8e8d082f11049d8f43503594f744f984181c9ba8b8ce1
context_sha256: 73172cce20f8345a5f3405c8b329983ef98e34580baa5684f04a8d519cb65e27
generated_at: 2026-11-22T02:39:23.971935+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/logger.ts

## Purpose
Structured logging module for the codebase. It defines a narrow `Logger` port that other tiers depend on instead of winston directly. It also holds the redaction policy applied to log records: credentials are replaced, and personal-data fields are hashed, redacted or left plain depending on config. The redaction lists come from `shared/rules/log-redaction.yaml`, which the PHP twin also reads. Winston is the underlying library, built from formats and transports. The rest of the file, including the winston wiring, is not covered here.

## Key elements
- `Logger` (interface): the logging port, with `debug`, `info`, `warn` and `error` taking a string or `LogFields` plus optional meta (a string, an `Error` or an object), and `log(level, message, meta?)` with an explicit level. It is deliberately narrow so winston can be swapped out.
- `LogFields`: `Record<string, unknown>`, the object form of a log call.
- `SENSITIVE_FIELDS` (exported `Set`): credential key names. It is built from `log-redaction.yaml`'s `sensitiveFields` plus every cookie name marked `secret` in the generated cookie data. It is exported so the policy test can assert each entry.
- `SENSITIVE_KEY_FRAGMENTS` (exported): substrings that make a key sensitive anywhere in the key, from the YAML rules.
- `PERSONAL_FIELDS` (exported `Set`): personal-data keys. This is a separate policy from credentials and is kept as its own set on purpose.
- `resolvePersonalFieldMode()`: returns `loggingConfig().NODE_LOG_PERSONAL_FIELDS`, one of `hash`, `redact` or `plain`.
- `redactSensitiveFields(input, ancestors?)`: recursively copies a value, redacting credentials and applying the personal-field mode.
- `redactCredentials(input)`: the same walk, but personal fields are left untouched. It is meant for stores such as the audit row that keep `ip` readable but must never hold secrets.
- Internal helpers:
  - `normalizeKey` lowercases a key and drops `_` and `-`.
  - `isSensitiveKey` checks an exact match or a fragment match.
  - `applyPersonalFieldMode` returns the value unchanged for `plain`, `[REDACTED]` for `redact`, and `correlationDigest(value)` for `hash`.
  - `redactWalk` and `redactEntries` do the recursion.
  - The markers are `REDACTED` (`[REDACTED]`) and `CIRCULAR` (`[Circular]`).

## Relationships
- Imports `../runtime/config` (`loggingConfig`, `isRelaxedEnvironment`, `PERSONAL_FIELD_MODES`), `../security/pseudonymise` (`correlationDigest`), `./semantic-names`, `./log-scrub` (`maskMessage`, `scrubError`) and `../observability/span-context` (`getActiveSpanContext`).
- Loads its rules through `../config/shared-rules/load` and `log-redaction`.
- Among the listed graph neighbors, only `scenarios/support/ephemeral-mongo.ts` has a concrete link in the visible portion: the file's comment says this module sits on an import chain through that file. The other neighbors under `scenarios/`, `scripts/` and `k8s/` are related via the dependency graph, but no specific interaction is visible here.

## Notes
- **Relative imports.** The imports are relative, not the `@infrastructure` alias. The file is loaded via `ephemeral-mongo.ts` outside jest's normal module resolution, where an alias fails at runtime.
- **Boot failure.** `loadSharedRules` runs at import, so a malformed `log-redaction.yaml` fails the boot.
- **Key matching.** Keys are compared after `normalizeKey`, so `newPassword`, `new_password` and `new-password` all match one entry.
- **Fragment list.** The fragment list is substring-based and deliberately excludes `code` and broad `code|key|link` patterns. An allowlist was rejected because it would hide new fields by default.
- **Credentials beat personal fields.** A name on both lists is redacted.
- **Personal-field treatment.** The mode applies only when the value is a string. A nested object under a personal-sounding key is walked normally.
- **Hash mode.** The default is `hash`. The digest is keyed (`hmac:`-prefixed) and truncated to 12 hex characters. It is a correlation aid, not a security boundary.
- **Invalid mode.** An unrecognised `NODE_LOG_PERSONAL_FIELDS` value is refused at boot by the config slice rather than falling back.
- **Copy-only walk.** The walk returns copies and never mutates the caller's objects.
- **Error serialisation.** `Error` instances are serialised first, because their fields are non-enumerable and would otherwise become `{}`.
- **Cycle guard.** Cycles are detected by tracking only the current path. A shared object reached by two routes is not treated as circular.
