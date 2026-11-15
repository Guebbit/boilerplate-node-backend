---
source: scripts/audit/compliance-rules.yaml
sha256: 21e43d6bdf199dc1c0ee2127b0162fa505adec8db6f856b458fe0e8ba972795e
generated_at: 2026-11-14T17:21:25.024364+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/compliance-rules.yaml

## Purpose

Shared compliance-rule registry consumed by the AI audit prompts that filter by `responsibility` and evaluate only the evidence hints for their own side. The file lives here once so both backend and frontend audits read the same single source of truth (see `docs/tools/ai-auditing.md`).

## Key elements

- **`rules:`** — The active rule list each audit prompt evaluates. Each entry carries:
  - `id`, `title`, `category`, `severity` — identification and prioritisation.
  - `responsibility` — `backend`, `frontend`, or `both`; the prompt-side filter.
  - `rule` — Prose statement of the requirement.
  - `applies_when` — Prose context the auditing model evaluates at run time against the app's actual shape (not a boolean flag). A rule may be `NOT-APPLICABLE` today and fire later.
  - `evidence.backend` / `evidence.frontend` — File-and-line hints pointing to the **authored** contract (module `openapi.yaml` fragments, `shared/contracts/openapi.root.yaml`), never the generated root `openapi.yaml`.
  - `references` — Legal/regulatory citations (GDPR, ePrivacy, PCI-DSS, EU AI Act, DMCA, etc.).
  - `notes` — Audit-specific guidance: what to flag, what is expected-satisfied, known-good baselines, and when a rule should re-trigger.
- **`suggested_rules:`** — Staging area for candidate rules pending human approval. **Neither prompt may read this section.** Promotion is done by moving the entry under `rules:` and deleting the `suggested_reason` field.
- **`version`** — Top-level integer (currently `1`) for schema/registry versioning.

## Relationships

- **`src/modules/users/model.ts`** — Cited as evidence in `sensitive-data-plaintext-storage` (password hashing call site) and `signup-mandatory-consent-checkbox` (`termsAcceptedAt` / `termsVersion` fields).
- **`src/infrastructure/adapters/logger.ts`** — Cited in `sensitive-data-plaintext-storage` evidence alongside `NODE_LOG_PERSONAL_FIELDS` to verify secrets are not logged in cleartext.
- **`docs/theory/data-protection.md`** — Cited in `sensitive-data-plaintext-storage` evidence for the "no full PAN ever stored" policy statement.
- **`openapi.yaml`** (root) — Explicitly **excluded** as an evidence source; the header comment warns to cite module fragments (`src/modules/<m>/openapi.yaml`) instead, because the root file is generated and may be absent in a worktree.
- **`scripts/audit/api-standards.yaml`** — Sibling standards file in the same audit tooling directory; the two files together define the audit contract.

## Notes

- `applies_when` is **prose, not a flag**. The auditing model judges applicability at run time against the codebase's actual shape. A rule marked `NOT-APPLICABLE` (e.g. `dmca-agent-published`, `ai-usage-policy-disclosure`, `biometric-consent-required`) is intentionally present so it fires automatically when the relevant feature is added.
- Evidence hints must point to **authored** files (module `openapi.yaml` fragments, `shared/contracts/openapi.root.yaml`), never the gitignored, generated root `openapi.yaml`. Cite the fragment's line number.
- A shipped `<LegalPlaceholder>` component is the **designed default** for legal pages; the auditor must judge routes, footer links, and operator identity, not the absence of legal wording. The placeholder never decides the verdict.
- The `notes` field on `signup-mandatory-consent-checkbox` distinguishes two separate faults: presenting a privacy notice as "consent" (Art. 13/14 vs. Art. 7) and bundling cookie consent into the Terms checkbox (Art. 7(4)).
- Frontend evidence lists may be empty (`frontend: []`) when a rule is backend-only (e.g. `sensitive-data-plaintext-storage`).
