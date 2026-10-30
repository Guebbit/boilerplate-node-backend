---
source: scripts/scaffold/demo-remove-scenarios.ts
sha256: 4fde6019b16907e6d6f944ce669cb2ff54fd327f609119e34a73e48009cc2eea
generated_at: 2026-10-29T01:42:35.082337+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-scenarios.ts

## Purpose

The "demo scenario data" half of the demo-removal pipeline. It deletes files under `scenarios/` that exist solely to feed the shop's own modules (catalogue fixtures, seed images, per-module scenario files). It only removes content or strips explicit references; registries that *list* those files are regenerated separately by `npm run regenerate`.

## Key elements

- **`SHOP_ONLY_FILES`** (private) — Hardcoded list of 8 paths (product/wishlist fixtures, shop scenario, filler, generated JSON, flow scripts) that are deleted unconditionally.
- **`removeShopOnlyScenarioFiles(repoRoot)`** — Deletes every path in `SHOP_ONLY_FILES` with `rmSync({ force: true })`. Returns a `RemovalNote[]` with one `"deleted"` entry per file.
- **`removeSeedImages(repoRoot)`** — Recursively deletes `public/images/seed/`, the user-images manifest, and the seed-image generator script. Also removes the `"scenario:images"` npm script from `package.json` and strips the `userImages` import + avatar spread from `scenarios/users.ts` via regex. Returns 5 `RemovalNote` entries.
- **`removeScenarioModuleFiles(repoRoot, names)`** — For each removed module name, conditionally deletes `scenarios/<name>.ts`, `scenarios/values/<name>.ts`, and `scenarios/support/doubles/<name>/` (only those that exist). Returns one note per actually-deleted path.
- **`removeOnce(content, pattern, label)`** (private) — Helper that performs a single regex `replace` and throws if the pattern is absent, guarding against silent no-ops when a file's shape has changed.
- **`RemovalNote`** (imported type from `./demo-remove-registry`) — Shape returned by every public function: `{ file: string, detail: string }`.

## Relationships

- **`./demo-remove-registry`** — Supplies the `RemovalNote` type used as the return type of all three exports.
- **`./demo-remove.ts`** — The orchestrator that calls this module's functions (alongside `demo-remove-modules` and `demo-remove-registry`) in a single pass.
- **`./demo-remove-modules.ts`** — The sibling "module" half; `removeScenarioModuleFiles` receives the module names that `demo-remove-modules` has already stripped from the registry, then cleans up each module's leftover scenario artifacts.
- **`tests/unit/scripts/scaffold/demo-remove-scenario-files.test.ts`** — Unit tests for `removeShopOnlyScenarioFiles` and/or `removeScenarioModuleFiles`.
- **`tests/unit/scripts/scaffold/demo-remove-seed-images.test.ts`** — Unit tests for `removeSeedImages` (file deletion, `package.json` edit, `users.ts` avatar spread removal).
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI-level test exercising the full removal pipeline including this file's effects.

## Notes

- All three exports are **destructive and non-reversible**; they assume a clean checkout.
- `removeOnce` throws on a missing pattern (single-match guard), while the `users.ts` avatar-spread cleanup uses `replaceAll` with a tolerant regex — the two patterns handle different certainty levels.
- The avatar spread in `users.ts` can appear in two forms (simple `...userImages.customer` or a ternary `...(index % 2 === 0 ? userImages.root : userImages.customer)`); the regex in `removeSeedImages` covers both.
- `removeScenarioModuleFiles` is idempotent per module (it checks `existsSync` before deleting), but the other two functions are not — running them twice on an already-stripped tree will either no-op (`force: true`) or throw (`removeOnce` on the already-absent `package.json` script).
