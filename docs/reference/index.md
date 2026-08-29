# File Glossary

**You found a filename and you do not know what it is.** This section answers that in one hop:
what the file is, what breaks without it, and which page explains the concept behind it.

It is a **map, not a theory page**. Nothing here re-explains what
[Theory](../theory/), [Tools](../tools/) or [API](../api/) already explain — every entry points
at them instead.

::: tip Looking for something else?
Reading the codebase for the first time? [Reading Path](../theory/reading-path.md) names nine
files in order. This section is the opposite tool: it assumes you already hit a file and want out
of it fast.
:::

---

## The map

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 40, 'rankSpacing': 55}}}%%
flowchart TD
    Root["Repository root<br/><i>configs, specs, manifests</i>"] --> Src["src/"]
    Root --> Contracts["Contracts<br/><i>openapi · asyncapi · api/</i>"]
    Root --> Ops["Ops<br/><i>.docker · .github · public</i>"]
    Root --> Dev["Dev tooling<br/><i>scripts · eslint · .husky</i>"]
    Root --> Data["Data<br/><i>db/ · seeds · migrations</i>"]
    Root --> Tests["tests/ · k6/"]

    Src --> Infra["infrastructure/<br/><i>substrate</i>"]
    Src --> Kernel["kernel/<br/><i>the module system</i>"]
    Src --> Modules["modules/<br/><i>one domain each</i>"]
    Src --> App["app/<br/><i>assembly</i>"]

    classDef entry fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef code fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef side fill:#ede9fe,stroke:#7c3aed,color:#111827;
    class Root entry;
    class Src,Infra,Kernel,Modules,App code;
    class Contracts,Ops,Dev,Data,Tests side;
```

| Page                                      | Covers                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [Repository Root](./root.md)              | Everything with no directory above it — configs, manifests, tool entry points                                 |
| [App, Kernel & Types](./src-app.md)       | `src/app/`, `src/kernel/`, `src/types/`, `src/locales/`, and the three files at the top of `src/`             |
| [Infrastructure](./src-infrastructure.md) | `src/infrastructure/` — adapters, http, observability, persistence, runtime                                   |
| [Modules](./src-modules.md)               | The file shapes a module is built from, and which module has which                                            |
| [Contracts](./contracts.md)               | `openapi.yaml`, `asyncapi.yaml`, `shared/contracts/`, generated `api/`, collection exports, Spectral rulesets |
| [Data](./data.md)                         | `db/` — migrations, the demo dataset, cache tools                                                             |
| [Scripts & Hooks](./scripts.md)           | `scripts/`, `eslint/rules/`, `.husky/`                                                                        |
| [Tests](./tests.md)                       | `tests/`, the co-located module suites, `k6/`                                                                 |
| [Ops & Assets](./ops.md)                  | `.docker/`, `.github/`, compose files, `public/`                                                              |

---

## How to read an entry

Every page is a table. Three columns, and the third is the point:

| File             | What it is                                                                                                                                                      | Read next                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/modules.ts` | The list of domains this build serves: one import and one array entry each. Enabling or disabling a domain is one line here — there is no filesystem discovery. | [Modules](../theory/modules.md) · [Reading Path](../theory/reading-path.md) |

- **What it is** — one or two sentences, present tense, saying what the file _is_ and what breaks
  without it. If an entry needs three sentences, the concept belongs in a linked page and the
  entry links to it.
- **Read next** — where the explanation lives. `—` means no page covers it yet, and that is a
  documentation gap on the record rather than a missing link.

## Three tiers, so the whole repository fits in ten pages

Most of the repository is repetition. A row per file would be neither writable nor readable, so
every tracked file lands in exactly one of three tiers.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 40, 'rankSpacing': 45}}}%%
flowchart LR
    F["A tracked file"] --> Q1{"Unique and<br/>hand-written?"}
    Q1 -->|yes| Named["**Named** — its own row"]
    Q1 -->|no| Q2{"One instance of<br/>a shape?"}
    Q2 -->|yes| Pattern["**Pattern** — one row<br/>for the shape"]
    Q2 -->|no| Excluded["**Excluded** — generated,<br/>vendored or binary"]

    classDef named fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef pat fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef exc fill:#fee2e2,stroke:#dc2626,color:#111827;
    class Named named;
    class Pattern pat;
    class Excluded exc;
```

**Named.** The file is one of a kind — `migrate-mongo-config.js`, `src/app.ts`,
`tests/cross-cutting/mail-copy.test.ts`. It gets its own row.

**Pattern.** The file is one instance of a shape that repeats. The shape gets the row and the
explanation; an inventory table says which modules have it. This is where the leverage is:
`src/modules/` collapses to about two dozen entries.

**Excluded.** Generated, vendored or binary, stated once per directory so a reader knows it was a
decision and not an oversight. `api/models/` is the large one — Orval writes it from
`openapi.yaml` and it is regenerated wholesale.

Anything git does not track is out by definition: `dist/`, `coverage/`, `node_modules/`,
`reports/`, `.tmp/`, `docs/.vitepress/cache/`.

## Why there are no file counts here

A number in prose goes stale without anyone editing the line, and nothing distinguishes a stale
count from a current one. So the glossary states **shapes** — "one per module", "one per
migration" — and leaves the counting to `git ls-files`, which is always right and always to hand:

```bash
git ls-files | awk -F/ '{if (NF==1) print "ROOT"; else print $1}' | sort | uniq -c | sort -rn
```

## Keeping this page true

Nothing enforces it. These pages are prose, and prose about a filesystem goes stale the first time
somebody adds a file without opening this section.

So the habit is the mechanism: **a commit that adds, moves or deletes a file updates the page that
names it.** The table in [the map](#the-map) says which page that is. To check a directory by hand,
compare what the glossary names against what git tracks:

```bash
git ls-files src/infrastructure | while read -r f; do
    grep -qF "\`$f\`" docs/reference/*.md || echo "undocumented: $f"
done
```

::: warning If you are writing an entry
The glossary describes what exists. If writing a row reveals a file that should not exist, raise
it — do not document a mistake into permanence.
:::
