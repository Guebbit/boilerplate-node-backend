---
source: scripts/contracts/build-bundles.ts
sha256: 08d028e3ee42c78e83afa51be0cb10d01a8cb7d31eea47f9df3e55ad44625180
generated_at: 2026-10-14T07:09:57.375417+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/build-bundles.ts

## Purpose

CLI entry point (`npm run contracts:bundle`) that rebuilds the repo's published contract bundles (OpenAPI, AsyncAPI) from their source fragments. It can either rewrite drifted bundles on disk or (`--check`) assert they are current without writing. The selection logic lives here rather than in `package.json` because npm appends `--` flags only to the last command in a `&&` chain, which would silently drop them in a multi-step script.

## Key elements

- **`checkOnly` / `named` / `unknown`** — Parsed CLI state: whether `--check` was passed, which bundle names were requested, and any names that match no known bundle.
- **`bundle(bundles)`** — Assembles the given bundles in parallel via `assembleBundle`, diffs each against its committed copy (`readCommittedBundle`), writes only the stale ones (unless `--check`), and returns the list of stale bundles.
- **`fail(message)`** — Prints to stderr and calls `process.exit(1)`. Typed `never` so TypeScript treats the call-site branch as terminating.
- **`run()`** — Top-level orchestration. Two paths:
  - *Named selection:* builds exactly the requested bundles. Refuses `--check` on generated (client-collection) bundles because they are `.gitignore`d and have no committed copy to be stale against.
  - *Full run (no names):* builds only the authored (non-generated) bundles; generated collections are excluded to avoid writing files nobody requested.
- **`relative(file)`** — Converts an absolute path to a repo-root-relative path for human-readable output.
- **Entry point** — `run().catch(...)` logs any rejection and exits 1.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — Sole module import. Provides `assembleBundle`, `CONTRACT_BUNDLES`, `findBundle`, `isGenerated`, `readCommittedBundle`, `REPO_ROOT`, and the `ContractBundle` type. This file is a thin CLI shell over that registry's assembly and lookup logic.

(The other listed graph neighbors—`bundle-kinds.ts`, `scripts/mutation/ci/cli.ts`, `tests/cross-cutting/mail-copy.test.ts`—are related downstream or indirectly; no direct import or call is visible in this file.)

## Notes

- **Exit codes are meaningful:** `0` success / up-to-date, `1` stale bundles or runtime error, `2` unknown bundle name (usage error). CI gates key off these.
- **Committed vs. generated split:** `openapi.yaml` is `.gitignore`d and rebuilt on every install; `asyncapi.yaml` / `asyncapi.public.yaml` are committed. Client collections (e.g. Bruno) are generated-on-demand and never committed, so `--check` explicitly rejects them rather than reporting a permanent false "stale."
- **Idempotent writes:** bundles whose assembled content is byte-identical to the file on disk are not rewritten, so timestamps don't churn.
- **`arguments_` naming:** the trailing underscore avoids shadowing the function-level `arguments` object in sloppy-mode contexts.
