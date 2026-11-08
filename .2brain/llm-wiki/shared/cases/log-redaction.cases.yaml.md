---
source: shared/cases/log-redaction.cases.yaml
sha256: d4e93e641bb0b1d28c08260daa8ced127e2ee834f7fe1f903ba2ce4daf7e4ff3
generated_at: 2026-11-08T03:05:13.030829+00:00
model: ollama:qwen3.8:27b
---

# shared/cases/log-redaction.cases.yaml

## Purpose

A shared, implementation-agnostic spec of which log keys must be redacted and which must pass through unmodified. It is executed by both the BEnode logger and the PHP twin logger against their respective redaction pipelines, so that the two implementations stay behaviorally identical without duplicating test logic.

## Key elements

- **`cases`** — ordered list of `{name, key, expect}` triples. `expect` is either `redact` or `keep`.
- **Redact cases** cover plain words (`password`, `key`), camelCase/snake_case variants (`newPassword`), kebab-case headers (`x-api-key`, `x-hub-signature`), `__Host-*` cookies (`device`, `oauth_state`, `oauth_deletion_challenge`), and compound keys (`webhookSecret`, `Antibot-Challenge-Token`).
- **Keep (boundary) cases** guard against over-matching: `idempotencyKey` must survive despite containing the bare key `key`; `linkCount` must survive despite the `linkurl` rule; `statusCode` and `code` are explicitly readable.

## Relationships

- **`shared/cases/crypto.cases.yaml`** — sibling spec in the same `shared/cases/` directory; both files follow the identical `cases` shape and are consumed by the same test harness in both language runtimes.

## Notes

- The header comment states a deliberate convention: *every `redact` case sits next to the `keep` case that bounds it.* When adding a new redact rule, place its corresponding keep/boundary case immediately adjacent so the pairing is visible at a glance.
- The keep cases are not "optional extras"—they exist to catch substring/fragment over-matching bugs in whichever language's redaction engine is being tested. Removing them would silently weaken the contract.
- Because both BEnode and PHP execute this file, a change here is a **cross-implementation** change: both runtimes must be updated in the same PR.
