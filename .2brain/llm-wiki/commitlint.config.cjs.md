---
source: commitlint.config.cjs
sha256: 4fb7b9f0315ce3c2620f9c3c24440f3fe2eea9b97c204b56cab0463ed9e9328f
generated_at: 2026-11-08T02:16:30.191390+00:00
model: ollama:qwen3.8:27b
---

# commitlint.config.cjs

## Purpose
Commitlint configuration that enforces the [Conventional Commits](https://www.conventionalcommits.org/) specification for all commit messages in the repository. It exists so that a single, shared rule set is available to any tool that validates commit or PR titles.

## Key elements
- **`module.exports`** — Exports a single object with one property:
  - **`extends`** — Set to `['@commitlint/config-conventional']`, pulling in the full set of conventional-commit rules (type, scope, subject, footer, etc.) rather than defining them inline.

## Relationships
- **`github/workflows/pr-title.yml`** — The GitHub Actions workflow invokes commitlint against pull-request titles, using this file as its rule source. If you change the `extends` value here, the CI title check behavior changes accordingly.

## Notes
- No custom rules, overrides, or `plugin` entries are defined; all behavior is inherited from `@commitlint/config-conventional`. Adding a rule or exception here is the intended extension point.
- The file uses CommonJS (`module.exports` / `.cjs`) even if the rest of the repo uses ESM, because commitlint loads the config via `require`.
