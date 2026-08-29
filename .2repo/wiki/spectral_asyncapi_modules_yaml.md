# spectral.asyncapi.modules.yaml

## Purpose

A Spectral ruleset that allows individual AsyncAPI section files (e.g. `src/modules/<name>/asyncapi.yaml`) to be linted in isolation. It starts from the recommended `spectral:asyncapi` ruleset and disables only the rules that expect service-wide facts (tags, contact, license) which are declared once in the root document rather than restated by every section.

## Key elements

- **`extends: [[spectral:asyncapi, recommended]]`** — base ruleset providing all standard AsyncAPI linting rules.
- **`asyncapi-tags: off`** — suppresses the requirement for a tag list; tags are a service-level concern declared in `asyncapi.root.yaml`.
- **`asyncapi-info-contact: off`** — suppresses the contact-info requirement in `info`.
- **`asyncapi-info-license: off`** — suppresses the license requirement in `info`.
- **`asyncapi-servers` and `asyncapi-channel-servers` (deliberately NOT disabled)** — each section must declare the server its channels bind to; this is a real, section-level obligation.
- **`id` / `defaultContentType` (not listed here)** — no Spectral rule exists for these; their validation is left to the AsyncAPI CLI against the assembled bundles.

## Relationships

- **asyncapi.yaml** — the fully assembled AsyncAPI document. It is linted by the AsyncAPI CLI (via `npm run lint:asyncapi`) with all rules active, including content-type checks. This ruleset is *not* used against it; it exists solely for the section files that compose it.

## Notes

- Invoked via `npm run lint:asyncapi:modules`.
- The file is the async-protocol twin of `spectral.modules.yaml`; the two exist for the same reason (lint a fragment as a standalone document).
- Spectral is used here instead of the AsyncAPI CLI because the CLI does not accept a custom ruleset, so ERROR-level findings (e.g. a missing root `id`) cannot be waived.
- Turning off rules is intentionally scoped to "restate a service-wide fact." Anything a section can and must satisfy on its own (server declarations, channel validity) remains enforced.
