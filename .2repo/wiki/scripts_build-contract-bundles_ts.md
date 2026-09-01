# scripts/build-contract-bundles.ts

## Purpose

CLI entry point (invoked as `npm run contracts:bundle`) that rebuilds the repository's committed contract bundles (OpenAPI, AsyncAPI, etc.) from their source fragments, or verifies in `--check` mode that the committed files are not stale. The bundles are committed because downstream consumers—spectral, orval, Prism, the seed runner, and `check:spec-identity`—read the bundled files, while the fragments remain the source of truth.

## Key elements

- **`arguments_` / `checkOnly` / `named`** — parses `process.argv` into the `--check` flag and a list of bundle names to narrow the run.
- **`relative(file)`** — converts an absolute path to a repo-root-relative path for log output.
- **`bundle(bundles)`** — core assembly step: calls `assembleBundle` on each entry, compares against the committed file via `readCommittedBundle`, writes only drifted files (skipped under `--check`), and returns the stale list.
- **`fail(message)`** — prints an error and exits with code 1.
- **Main flow (two branches):**
  - *Named run* — builds exactly the requested bundles; refuses `--check` on generated (client-collection) bundles since they are uncommitted by design.
  - *Full run* — builds all authored bundles (`!isGenerated`) and skips the generated collections unless explicitly requested by name.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — the sole import; supplies `assembleBundle`, `CONTRACT_BUNDLES`, `findBundle`, `isGenerated`, `readCommittedBundle`, `REPO_ROOT`, and the `ContractBundle` type. All bundle metadata and assembly logic lives there.
- **`scripts/contracts/bundle-kinds.ts`** — upstream dependency of `bundle-registry.ts`; defines the bundle-kind taxonomy that `CONTRACT_BUNDLES` entries reference.
- **`tests/cross-cutting/mail-copy.test.ts`** — downstream consumer of the committed bundle output this script produces/maintains.

## Notes

- **Why the flag parsing lives here, not in `package.json`:** npm appends `--` arguments only to the *last* command in a `&&`-joined script, so a chain like `a && b -- foo` would silently drop `foo` from `a`. Keeping the selection in the script sidesteps that.
- **Generated collections are opt-in:** they are produced from the *committed* contract (not the fragments) and are `.gitignore`'d. A full run never writes them; `--check` explicitly refuses them to avoid a permanently-red CI gate. Request them by name (e.g. `npm run contracts:bundle -- bruno`).
- **Paired-repo copy:** the `--check` failure message reminds the developer that every authored bundle is byte-identical with a counterpart in a paired repository and must be copied there as well.
- **Exit codes:** `0` success, `1` stale or other failure, `2` unknown bundle name(s) (lists known names for correction).
