---
source: shared/contracts/spectral.asyncapi.names.yaml
source_sha256: fb3e34113f61d2f1912050066d728ca2f07a9bb5501716359a92da6774bf74f2
context_sha256: 763149f42a9c5464b6ccc69b434e3ace4e46ac865bd118eeef8995f63f00aa43
generated_at: 2026-11-22T02:24:23.852162+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/contracts/spectral.asyncapi.names.yaml

## Purpose
A Spectral ruleset, run via `npm run lint:asyncapi:names`, that checks the machine-read names in the bundled AsyncAPI contract are spelled in US English. It is the AsyncAPI counterpart of the `names-in-us-english-*` rules in `spectral.yaml` (AIP-190, Zalando #103). Only names are checked. Prose is not.

## Key elements
- **`&british` anchor**: a `pattern` function option with a single `notMatch` regex, defined on the first rule and reused by the others through `*british`. It flags these British spellings, case-insensitively:
  - `cancell` followed by `ed`, `ing` or `able`
  - `catalogue`
  - `fulfil` when not followed by another `l`
  - `colour`, `behaviour`, `licence`
  - `-ise`, `-ised`, `-ises`, `-ising` and `-isation` forms of organ, recogn, normal, serial, initial, author, synchron, categor, custom, minim, maxim, optim, sanit, summar, final, util, visual, local and standard
- **Six rules**, all `severity: error`, each applying the shared pattern to a different part of the contract:
  - `names-in-us-english-channels`: keys of `$.channels`.
  - `names-in-us-english-messages`: keys under `$.channels[*].messages` and `$.components.messages`.
  - `names-in-us-english-operations`: keys of `$.operations`.
  - `names-in-us-english-schemas`: keys of `$.components.schemas`.
  - `names-in-us-english-properties`: keys of every `$..properties`.
  - `names-in-us-english-enum-values`: the values of every `$..enum[*]`. This rule has no `field`, so it checks the values themselves rather than keys.

## Relationships
- It is the AsyncAPI twin of the `names-in-us-english-*` rules in `shared/contracts/spectral.yaml`.
- It stays separate from `spectral.yaml` and has no `extends`. The parser's own rules already run in `lint:asyncapi`, so this file only checks spelling.

## Notes
- The word list is hand-maintained. A British spelling that is not in the regex will not be caught.
- The `fulfil(?!l)` lookahead lets `fulfill` pass.
- The rules target the bundled contract, so `given` paths assume a bundled document with `channels`, `operations` and `components`.
