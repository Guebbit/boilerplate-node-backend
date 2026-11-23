---
source: scripts/scaffold/scaffold-module.ts
source_sha256: 8894342f24d7e9b7a7a14e4c1d3ed75e0ebc6bce7a8f9a27e5d0b1916f7119fb
context_sha256: f4a41b0ac7b09ce7baee53d169e0fa39c4ba11fd29f9268c191f1b32f56ace5f
generated_at: 2026-11-22T02:16:28.198679+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/scaffold-module.ts

## Purpose
CLI entry point behind `npm run scaffold:module -- <name> [options]`. It creates a working module from the template (cut from the example module's core). It writes the module folder, the docs page and the registry lines. Unless disabled, it then runs `regenerate --no-sync` so the generated types exist for the first compile. It prints the decisions it cannot make for the author.

## Key elements
- `OPEN_DECISIONS`: the list of messages printed after a successful run. They cover `personalData` defaulting to `"none"`, role grants in `shared/rules/authorization-roles.yaml`, undeclared rate limits, and the TODOs left in `module.yaml`, `module.ts` and `docs/modules/<name>.md`.
- `main(argv)`: the orchestration. It returns the exit code.
  1. Parse the arguments. A refusal prints the error plus `USAGE` and returns 1.
  2. Call `applyScaffold(REPO_ROOT, options, formatWithRepoConfig)`. If it throws, log `[scaffold] refused:` with the message and return 1.
  3. Log the number of files written and the registered kebab-case name.
  4. If `options.regenerate` is set, run `npm run regenerate -- --no-sync` with inherited stdio. A non-zero status is returned as the exit code.
  5. Print `OPEN_DECISIONS` and return 0.
- Top-level `main(process.argv.slice(2))` call: sets `process.exitCode` from the result. An unexpected throw is logged and sets exit code 1.

## Relationships
- `./options`: supplies `parseArguments`, `isRefusal` and `USAGE` for argument handling and error output.
- `./apply`: supplies `applyScaffold`, which does the file writing and registration. The file uses the returned plan to report how many files were written and the registered name.
- `./format-text`: supplies `formatWithRepoConfig`, passed to `applyScaffold` as the formatter.
- `../modules-on-disk`: supplies `REPO_ROOT`, used as the scaffold target and as the `cwd` for the regenerate subprocess.

## Notes
- Regeneration is skipped when `options.regenerate` is falsy. The generated client and Zod schemas that the new module imports then won't exist yet.
- It does not decide personal data, rate limits or role grants. It only prints reminders.
