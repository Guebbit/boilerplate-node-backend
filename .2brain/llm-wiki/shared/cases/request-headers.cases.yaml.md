---
source: shared/cases/request-headers.cases.yaml
source_sha256: ef1c6c0b5444ec5315cb01ff9e81334acc7a29c219d5e908751cd771dde1928c
context_sha256: 239ccb99bbbe781a1cbfb21e104f378a1a11d6a124062e5a27ceb3b8d3429fd4
generated_at: 2026-11-22T02:22:13.534300+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/cases/request-headers.cases.yaml

## Purpose
A declarative table of test cases that pins down how two HTTP request headers are read: `If-Match` (RFC 9110 §13.1.1) and `x-request-id`. Each case gives an input header and the expected parsed outcome, so implementations can be checked against one shared spec.

## Key elements
- `cases:` – the single top-level list. Every entry has a `name`, a `kind`, an optional `header`, and expectation fields that depend on the kind.
- `kind: if-match` – expectation fields are `expect` and, for `tags`, a `tags` list:
  - `unconditional`: no header, so the write runs without a check.
  - `any`: header is `*` (surrounding spaces are tolerated).
  - `tags`: exactly the listed entity-tags, with quotes and any `W/` prefix kept. A list is split on commas and trimmed.
  - An unparseable header also gives `tags` with `tags: []`. Nothing matches, so the write is refused with 412 rather than running unconditionally. The unparseable cases are an unquoted tag, `*` mixed with a tag, a trailing comma, and an empty header. An empty quoted tag `""` is valid.
- `kind: request-id` – fields are `header`, `trustedIngress` (true/false), `clientRequestId` (`kept` or `dropped`) and `requestId` (`generated` or `client`).
  - A canonical hyphenated UUID, in any version and either case, is kept as the client id.
  - Anything else is dropped. This covers a non-UUID, trailing text, a trailing newline, no hyphens, a non-hex digit, and a missing header.
  - The service's own `requestId` is `generated`. The exception is a valid UUID behind a trusted ingress, where it is `client`.

## Relationships
- `scripts/audit/api-standards.yaml` is the only graph neighbor. The two files are linked in the dependency graph, but this file does not show how.

## Notes
- A weak tag (`W/"a"`) keeps its prefix, so it never equals a strong tag.
- The trailing-newline case (`"...000\n"`) is there because `$` must not match before a trailing newline. A naive regex would wrongly accept it.
- A malformed id is dropped even when `trustedIngress` is true.
