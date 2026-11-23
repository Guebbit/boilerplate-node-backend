---
source: src/infrastructure/config/shared-rules/frontend-links.ts
source_sha256: 89247c7e6a85c177a5dfe34977715259c50e3d9dbcccf71e6c344ffaca46c9b1
context_sha256: b3e924c05cab37796850b2db8015b03d3dd06f29a3aa459a807907c0d0e4b1d9
generated_at: 2026-11-22T02:44:51.584735+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/frontend-links.ts

## Purpose
Defines the Zod schema for `shared/rules/frontend-links.yaml`. That YAML file lists the frontend paths that mails and the sitemap link to, the staff screens a work-notice mail points at, and the sitemap's static pages. The file holds only the schema. Each value is a path template under the frontend's `/<locale>/`.

## Key elements
- `frontendLinksSchema`: the exported `z.strictObject` schema. Unknown keys are rejected at every level. It has three top-level keys:
  - `links`: one non-empty path template per kind of link: `verify`, `reset`, `setup`, `restore`, `emailChange`, `emailUndo`, `export`, `order`, `product`, `contact`, `privacy`, `terms`.
  - `staffPages`: staff screens that work-notice mails link to. These are `user`, `webhookSubscription`, `task`, `return`, `order`, `inventory` and `salesPayments`. There are also several "summary row" links: `transfersDue`, `preordersLate`, `deliveryHoldsOpen`, `returnsAwaitingGoods`, `returnsUndecided`, `lowStock`, `unshipped`, `awaitingTracking`, `undelivered`, `staleRefunds`.
  - `staticPages`: an array of strings for public pages that take no id. The empty string is the home page.
- `template` (module-private): `z.string().min(1)`, used for every path template.

## Relationships
- `src/infrastructure/config/shared-rules/registry.ts` is a neighbor in the same folder. It most likely registers this schema alongside the other shared-rule schemas. That is an inference, because the file itself shows no link to it.
- `src/infrastructure/http/frontend-link.ts` is the HTTP-side neighbor. It presumably consumes the validated data to build frontend URLs. That is also inferred, not visible in this file.

## Notes
- The module comment says it must use relative imports only, because of the constraint described in `src/infrastructure/config/shared-rules/load.ts`. Only `zod` is imported here.
- Every `links` and `staffPages` entry must be a non-empty string. `staticPages` entries are unconstrained, so `''` is allowed and means the home page.
- The `strictObject` schemas mean that adding a new link needs a schema change as well as a YAML change.
