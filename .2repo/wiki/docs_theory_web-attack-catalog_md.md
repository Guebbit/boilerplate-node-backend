# docs/theory/web-attack-catalog.md

## Purpose

A theory-only reference catalog enumerating every class of web attack and underlying flaw, grouped by the attack surface layer (Human → Browser → Transport → Application → Data & infra). It exists as a checklist for threat-modelling new features: walk the groups top-to-bottom and ask "could this apply here?" It deliberately contains no codebase-specific logic; that mapping lives elsewhere.

## Key elements

- **Five-layer model** (mermaid flowchart): Human, Browser, Transport, Application, Data & infra — the organizing axis for every section.
- **Section 1 – Injection**: ~30-row table covering SQLi, NoSQL, OS command, SSTI, XXE, deserialization, prototype pollution, mass assignment, log/JNDI injection, and related variants. Each row: Name / What (one-sentence flaw) / How (mechanism).
- **Section 2 – Client-side**: XSS variants (reflected, stored, DOM, mXSS, blind, UXSS), HTML/CSS injection, DOM clobbering, CSRF, login CSRF, CSWSH, and other browser-context attacks.
- **Remaining sections** (transport, application logic, data/infra): continue the same table format for their respective layers (content truncated in the excerpt but structurally identical).
- **"How to read the tables" legend**: defines the three columns and clarifies the flaw-vs-attack duality per row.

## Relationships

- **`docs/theory/web-attack-defences.md`** — the row-by-row mapping from this catalog's entries to concrete defence implementations in the codebase. This file is the "what can go wrong" side; that file is the "what we do about it" side.
- **`docs/tools/security.md`** — describes the boilerplate's actual security tooling and configurations. This catalog explicitly defers to it for codebase-specific behaviour ("what the boilerplate actually does about each item lives in Security").
- **`docs/theory/index.md`** — the index page for the `docs/theory/` collection; links to this file as one of the theory references.

## Notes

- This file is intentionally **not** a vulnerability report or a remediation guide. It is a taxonomy. If you need "how does our code prevent XSS?", go to `web-attack-defences.md` or `security.md`.
- Each row is one line by design; depth is delegated to the "standard references" listed at the bottom of the file.
- The document stresses that real attacks are **chains** across layers (e.g., phishing → open redirect → IDOR → data exfiltration), so treating any single row in isolation underestimates risk.
- "Flaw" and "attack" are two sides of the same row: the flaw is the missing control, the attack is the exploitation path.
