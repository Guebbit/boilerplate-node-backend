---
source: tests/cross-cutting/outbox-names.test.ts
sha256: 19d04baa08e134157f719bb53cd6d03869dba2363924e94a8319dadb4be34bc6
generated_at: 2026-10-15T12:39:07.334074+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/outbox-names.test.ts

## Purpose

Guarantees that every mail-template name published by this backend is well-formed, unique, resolvable to a real template file, and matches the exact agreed-upon set shared with the PHP twin. Because the name is a cross-repository identifier (the frontend e2e specs use it to locate a specific mail), it must be engine-agnostic, literal, and stable. This file enforces those invariants by reading the `emails.ts` source of every deployed module rather than importing the emails themselves.

## Key elements

- **`templateFileOrUndefined(name)`** — wraps `templateFile()` to convert its "unregistered name" throw into `undefined`, so the existence check can report *why* a name failed.
- **`listEmailFiles()`** — discovers every `src/modules/<name>/emails.ts` via `readdirSync` on `MODULES_ROOT`; no hardcoded module list.
- **`templateAssignments(source)` / `namesIn(source)`** — regex-extract `template:` lines and literal name values from raw source text.
- **`publishedNames()`** — flat-maps all modules into a `{ module, name }[]` the test cases consume.
- **Canary case** (`finds the mails it means to check`) — asserts ≥ 8 names across ≥ 3 modules so a structural rename doesn't silently empty the list.
- **Literal-only case** — rejects any `template:` assignment that isn't a plain single-quoted string, closing the blind spot of computed names.
- **Shape case** — enforces the `<module>.<event>` two-segment kebab-case pattern via regex (deliberately avoids `path.extname`, which misreads the dot in the name).
- **Uniqueness case** — detects two modules publishing the same name.
- **Existence case** — resolves each name through `templateFile()` and checks `existsSync`, catching typos that would only fail at send time.
- **Agreed-set case** — compares the sorted published names against a hardcoded `agreedByPair` array (filtered by `isDeployed`), encoding the cross-repository contract.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — imports `templateFile`, the single function that turns a suffixless name into a filesystem path. The test's existence case depends on this resolution to prove a typo is caught.
- **`tests/support/paths.ts`** — imports `MODULES_ROOT` (the directory scanned for `emails.ts` files) and `isDeployed` (filters the agreed-set against modules that may be disabled in a given environment).
- **`src/infrastructure/adapters/template-registry.ts`** — indirect: `templateFile` in mailer.ts resolves names against this registry; the test's existence check therefore transitively validates registry entries.

## Notes

- The test reads **source text**, not runtime values. Any name assembled via a variable, template literal, or helper is invisible to the extraction regexes and will be flagged by the literal-only case.
- The shape regex (`^[a-z][\da-z-]*\.[a-z][\da-z-]*$`) encodes "two segments, kebab-case" rather than banning specific extensions. This is intentional: a third templating engine would slip past a denylist.
- `path.extname` is explicitly unsuitable here — the names are dotted by design, so it would read the event half as an extension.
- The agreed-set case uses `isDeployed(name.split('.', 1)[0])` to drop names belonging to modules that are removed in the current deploy; deleting a module (`demo:remove`) must also remove its names from the hardcoded list.
- The canary case exists because a renamed `emails.ts` or a changed `template:` field name would make every subsequent case pass vacuously over an empty list.
