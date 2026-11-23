---
source: scripts/audit/compliance-rules.yaml
source_sha256: 9c39825e49af5e306563526450186028d81f9236e9f84ffb9ee4b03736a1e4e1
context_sha256: 893c4a9eb9b868602e1926dbe2667a71ab1757fefc2fec6178b1d36409977e9b
generated_at: 2026-11-22T01:52:09.599420+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/audit/compliance-rules.yaml

## Purpose
Shared compliance rule registry (version 1) read by the backend and frontend compliance audit prompts. Each prompt filters rules by `responsibility` and evaluates only its own `evidence.<side>` hints. The file lives here once, and the frontend audit reads this same copy.

## Key elements
- `version: 1`: registry schema version.
- `rules:`: the active rules that either audit prompt evaluates.
- `suggested_rules:`: staging area for candidate rules pending human approval. Neither prompt may read it. To promote a rule, move the entry under `rules:` and delete its `suggested_reason`.
- Rule fields: `id`, `title`, `category`, `responsibility` (`both` or `backend`), `severity`, `rule` (the requirement), `applies_when` (prose), `evidence` (`backend`/`frontend` lists of hints), `references` (legal citations), `notes` (including VIOLATION criteria in some rules).
- Rules visible in the shown portion:
  - `legal-pages-published` (consumer-protection, high, both): privacy, cookie and terms pages and the legal notice must be reachable.
  - `signup-mandatory-consent-checkbox` (consumer-protection, high, both): each account records its holder's own Terms acceptance (time and version) via an unticked checkbox or a provider-button notice. The privacy notice is shown, not agreed to. Cookie and analytics consent is kept separate.
  - `dmca-agent-published` (ip, medium, both): copyright agent contact and takedown process. N/A today.
  - `sensitive-data-plaintext-storage` (data-security, critical, backend): no plaintext passwords, tokens, PANs or biometrics.
  - `ai-usage-policy-disclosure` (ai-governance, medium, both): AI feature disclosure. NOT-APPLICABLE today.
  - `biometric-consent-required` (data-security, critical, both): explicit, revocable consent for biometric login. NOT-APPLICABLE today.

## Relationships
- `shared/cases/crypto.cases.yaml` is the only graph neighbor. The visible content doesn't state how the two interact, so no concrete interaction is documented here.

## Notes
- A rule is never mandatory on its face. `applies_when` is prose that the auditing model evaluates against the app's actual shape at run time, not a boolean flag.
- Evidence hints must cite the authored contract, meaning a module's `openapi.yaml` fragment or the shared root contract, and cite the fragment's line. They must never cite the generated, gitignored root `openapi.yaml`, which a worktree may lack.
- Rules marked N/A or NOT-APPLICABLE are kept deliberately so they fire automatically once the relevant feature (user content, AI, biometrics) is added.
- `legal-pages-published` treats a shipped `<LegalPlaceholder>` as the designed default and not as a verdict factor. Violations are missing pages, routes or footer links, fake legal wording, or a missing go-live step in the docs.
- `frontend: []` (as in `sensitive-data-plaintext-storage`) means the rule has no frontend evidence.
