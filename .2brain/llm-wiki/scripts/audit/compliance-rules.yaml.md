---
source: scripts/audit/compliance-rules.yaml
sha256: 173a43aa41d27033c5325073c7bddbbd52080546db4e504b01bca41dfa2bc1e9
generated_at: 2026-11-08T02:37:40.775128+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/compliance-rules.yaml

## Purpose
Shared compliance rule registry consumed by the AI-driven audit prompts in `scripts/audit/compliance-backend/SKILL.md` and `scripts/audit/compliance-frontend/SKILL.md`. Each prompt filters rules by `responsibility` (backend / frontend / both) and evaluates only its own `evidence.<side>` hints. The file exists once so both audits share a single source of truth for what to check, rather than duplicating rule text across two prompt files.

## Key elements
- **`version`** — top-level integer (currently `1`); bump when the schema shape changes.
- **`rules[]`** — the active rule set the audit prompts evaluate. Each entry carries:
  - `id` — stable kebab-case identifier (e.g. `signup-mandatory-consent-checkbox`).
  - `responsibility` — `"backend"`, `"frontend"`, or `"both"`; determines which prompt picks it up.
  - `severity` — `critical` / `high` / `medium` (ordering for reporting, not enforcement).
  - `rule` — the normative statement the model checks.
  - `applies_when` — **prose** (not a boolean) the model evaluates against the app's current shape at run time.
  - `evidence.backend` / `evidence.frontend` — file paths or patterns the model should inspect as supporting evidence.
  - `references` — legal/regulatory citations (GDPR, ePrivacy, PCI-DSS, WCAG, DMCA, EU AI Act, etc.).
  - `notes` — context, known-good baselines, or "NOT-APPLICABLE as of writing" markers.
- **`suggested_rules[]`** — staging area for candidate rules pending human approval. **Neither prompt reads this section.** Promote by moving the entry under `rules:` and deleting `suggested_reason`.
- **Categories** present in active rules: `consumer-protection`, `ip`, `data-security`, `ai-governance`, `e-privacy`, `accessibility`.

## Relationships
- **`docs/theory/data-protection.md`** — cited as evidence for the `sensitive-data-plaintext-storage` rule ("no full PAN ever stored" section).
- **`openapi.yaml`** — cited as evidence for `legal-pages-published` (a `/legal` or `/policies` path) and `signup-mandatory-consent-checkbox` (signup request schema).
- **`scripts/audit/api-standards.yaml`** — sibling rule file in the same audit pipeline; covers API-standards concerns separately from this compliance registry.
- **`src/infrastructure/adapters/logger.ts`** — cited as evidence for `sensitive-data-plaintext-storage`; the `NODE_LOG_PERSONAL_FIELDS` env var here is the mechanism that keeps secrets out of logs.
- **`src/modules/users/model.ts`** — cited as evidence for both `signup-mandatory-consent-checkbox` (`termsAcceptedAt` / `termsVersion` fields) and `sensitive-data-plaintext-storage` (password hashing call site).

## Notes
- `applies_when` is **not** a toggle. The auditing model reads it as natural language and decides applicability at run time based on what actually exists in the codebase. A rule with `applies_when: "NOT-APPLICABLE as of this registry's writing"` is still in `rules:` and will be re-evaluated every audit run.
- Frontend evidence arrays can be empty (`frontend: []`); that simply means there is no frontend artifact to inspect for that rule.
- The `notes` field on a rule may state a **known-good baseline** (e.g. argon2id hashing, cardLast4-only storage) and that the rule is expected to audit SATISFIED — it exists to catch regressions, not to flag the current state.
- `suggested_rules:` is a hard boundary: prompts must not read or evaluate entries there. Human review is the gate.
- The file is intentionally co-located under `scripts/audit/` (not `src/` or `docs/`) because it is consumed exclusively by the audit tooling, not by application code.
