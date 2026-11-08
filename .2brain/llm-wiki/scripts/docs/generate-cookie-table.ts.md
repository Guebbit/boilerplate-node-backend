---
source: scripts/docs/generate-cookie-table.ts
sha256: afbf774727157cc4f6bbc2744b23dab6a58c25210b8b54886ee7ae5e80034392
generated_at: 2026-11-08T02:47:10.184999+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-cookie-table.ts

## Purpose

Generates (or checks) the "Cookies the backend sets" Markdown table inside `docs/theory/data-protection.md`, sourcing rows from `shared/rules/cookies.yaml`. It exists so the GDPR disclosure page stays in sync with the canonical cookie config, and a `--check` mode lets CI (`complete`) report drift without rewriting the file.

## Key elements

- **`lifetimeCell(row: CookieRow): string`** – Maps a row's lifetime to a human-readable cell (session-tier, challenge, browser session, N days, or N minutes).
- **`basisCell(row: CookieRow): string`** – Returns the consent-exemption wording (ePrivacy Art. 5(3) for necessary cookies; preference-identification for others).
- **`cookieTable(): string`** – Assembles the full Markdown table (header + separator + one row per cookie, in YAML file order). Escapes literal `|` in purpose text.
- **`checkOnly`** – Boolean set from `hasFlag('check')`; passed through to `applyMarkerBlocks` to switch from write to drift-report.
- **`START` / `END`** – The HTML-comment markers (`<!-- cookie-inventory:start/end -->`) that delimit the generated block in the target page.
- **Top-level call to `applyMarkerBlocks`** – Invokes the marker-block writer/checker, then sets `process.exitCode` or calls `failScript`.

## Relationships

- **`scripts/docs/marker-block.ts`** – Provides `applyMarkerBlocks`, the shared mechanism that inserts or validates the table between the comment markers.
- **`scripts/cli.ts`** – `hasFlag('check')` determines check-only vs. write mode.
- **`scripts/fail-script.ts`** – `failScript` is the `.catch` handler for unhandled errors.
- **`scripts/modules-on-disk.ts`** – Supplies `REPO_ROOT` used to resolve the target page path.
- **`src/infrastructure/config/shared-rules/load.ts`** – `loadSharedRules('cookies', cookiesSchema)` parses and validates the YAML into a typed object.
- **`src/infrastructure/config/shared-rules/cookies.ts`** – Exports the `cookiesSchema` (Zod) and the `CookieRow` type consumed by the cell helpers.
- **`src/domain-primitives/time.ts`** – Provides `DAY_MS` and `MINUTE_MS` constants for lifetime formatting.

## Notes

- Follows the same marker-block + `--check` pattern as `generate-rate-limit-budgets.ts` (referenced in the file's doc comment).
- Table row order is `Object.values` order of the parsed YAML map—i.e., file order, not alphabetical.
- The `purpose` field is scanned for unescaped `|` characters and backslash-escaped to keep the Markdown table valid.
- In check-only mode the script exits non-zero on drift but does **not** mutate the page.
