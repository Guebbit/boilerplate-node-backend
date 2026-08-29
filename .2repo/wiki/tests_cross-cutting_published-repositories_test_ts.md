# tests/cross-cutting/published-repositories.test.ts

## Purpose

Enforces that every repository handle exported through a module's barrel (`index.ts`) is justified by (a) at least one **production** caller in sibling code, and (b) a documented, non-trivial reason in an in-file allowlist. It exists because a published repository is a write handle on a collection the caller does not own, making it a materially different (and more dangerous) export than a type, which `published-language.test.ts` already governs.

## Key elements

- **`PUBLISHED_FOR`** – The allowlist: `Record<string, string>` keyed by `"<module>.<binding>"`, value is the prose reason the module publishes that repository. Adding a new barrel export without an entry here fails the suite.
- **`publishedRepositoriesOf(module)`** – Parses a module's `index.ts` with a regex over `export { … }` clauses; a name qualifies if it ends in `Repository` (case-insensitive) **or** the re-export source file is `repository.ts`. Skips `export type` re-exports (those are governed by `published-language`).
- **`publishedRepositories()`** – Flattens all modules × their published bindings into `{ module, binding }` pairs.
- **`consumersOf(module, binding)`** – Regex-scans every `.ts` file under `src/` (excluding the owning module) for `import { … } from "@modules/<module>"` and returns files that name that binding.
- **`isSpec(file)`** – Returns true if the path contains `/tests/`; used to exclude spec-only consumers (the critical difference from `published-language`).
- **`clauseNames(clause)`** – Splits an import/export clause into individual names, stripping `type` prefixes and `as` aliases.
- **Test cases (5):**
  1. Canary: at least one module and one published repo must exist.
  2. No published repo may be reachable **only** from spec files.
  3. Every published repo must appear in `PUBLISHED_FOR`.
  4. Every reason must be a real sentence (≥ 60 chars, ≥ 10 words, no placeholder tokens).
  5. `PUBLISHED_FOR` must contain no entry for a repo that is no longer published (staleness guard — truncated in source).

## Relationships

No graph neighbors are recorded. The file is self-contained; it reads module barrels and source files directly from disk via `node:fs` rather than importing them.

## Notes

- **Spec exclusion is the whole point.** `published-language.test.ts` intentionally counts a sibling's spec as a consumer (a type named in a test is a type the test depends on). Here that rule has a hole the size of the export: `cartRepository` survived for years because one integration spec read it. This test treats spec files as non-consumers.
- **`isSpec` checks directory, not filename.** `tests/factory.ts` and `tests/setup.ts` are test-only code despite not matching `*.test.ts`.
- **Allowlist keys are qualified by module.** Two modules may publish a repo under the same alias; keying on binding alone would excuse one for the other.
- **Reasons are reproduced, not invented.** The test's intent is that a barrel and this file disagreeing is itself the finding — the reasons mirror the argument the barrel (or its module's `index.ts` comment) already makes.
- **Disk reads, not import resolution.** Consistent with `context-map.test.ts` and `eslint-plugin-boundaries` rationale: the question is what the code *says*, and booting the app would turn this into an integration test.
- **Placeholder detection regex** (`/^(todo|tbd|fixme|xxx|n\/?a|because|reason|see above|\W*)$/i`) is intentionally broad to catch single-word justifications that would pass a mere "presence" check.
