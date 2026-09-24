---
source: tests/audit/compliance-rules.yaml
sha256: 2c171056547fadc52fd5413f710d8ebc927fd932e959562c23a3b667b73e9e72
generated_at: 2026-09-23T19:50:49.861352+00:00
model: ollama:qwen3.8:27b
---

# tests/audit/compliance-rules.yaml

## Purpose

Shared compliance rule registry consumed by the `compliance-backend.md` and `compliance-frontend.md` audit prompts. Each prompt filters the list by the `responsibility` field and evaluates only its own `evidence.<side>` hints. The file is byte-identical to its copy in a sibling repo (see `docs/tools/ai-auditing.md`), so edits must be mirrored.

## Key elements

- **`rules:`** — The active rule set that either audit prompt evaluates. Each entry has:
    - `id`, `title`, `category`, `responsibility` (`both` | `backend` | `frontend`), `severity`
    - `rule` — the normative statement the model checks
    - `applies_when` — prose condition the model evaluates at run time against the app's actual shape (not a boolean flag)
    - `evidence.backend` / `evidence.frontend` — file/glob hints telling the auditor where to look
    - `references` — legal citations (GDPR, ePrivacy, PCI-DSS, WCAG, EU AI Act, DSA, BIPA, DMCA)
    - `notes` — context, known-good baselines, or caveats
- **`suggested_rules:`** — Staging area for candidate rules pending human approval. **Must not** be read by either audit prompt.
- **`version:`** — Currently `1`.

Rules present (by id): `legal-pages-published`, `signup-mandatory-consent-checkbox`, `dmca-agent-published`, `sensitive-data-plaintext-storage`, `ai-usage-policy-disclosure`, `biometric-consent-required`, `tracking-pixel-before-consent`, `image-alt-text`, `age-gate-or-parental-consent` (truncated in source).

## Relationships

- **`src/modules/account/module.yaml`** — Referenced in `evidence` hints for `signup-mandatory-consent-checkbox` (Zod schema, consent fields) and `biometric-consent-required` (WebAuthn/passkey endpoints). The audit prompt uses these hints to locate the relevant handler and schema when evaluating those rules.
- **`src/modules/webhooks/openapi.yaml`** — Referenced in `evidence` hints for `legal-pages-published` (a `/legal` or `/policies` path) and `signup-mandatory-consent-checkbox` (whether acceptance is a required field in the signup request schema). The auditor inspects the OpenAPI spec here to verify structural requirements.

## Notes

- `applies_when` is intentionally prose, not a boolean — the auditing model judges applicability against the app's current shape. Two rules (`ai-usage-policy-disclosure`, `biometric-consent-required`) are marked NOT-APPLICABLE as of writing but exist to fire automatically if the relevant feature is later added.
- `suggested_rules:` is a hard boundary: neither prompt may read it. Promote a rule by moving the entry under `rules:` and deleting its `suggested_reason` field.
- Because the file is byte-identical across two repos, any edit requires a matching change in the sibling repo.
- `evidence` lists are hints, not exhaustive checklists — the prompt is expected to follow them but may inspect adjacent files.
- A single bundled "I agree to everything" checkbox is explicitly called out as a known-weak pattern under GDPR Art. 7(2) even when a checkbox is present; the rule requires separation of cookie consent from ToS acceptance.
