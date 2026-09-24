# Repo Context

_Canonical 2brain context source for AI editors._

## Core Artifacts
- `.2brain/graphify-out/GRAPH_REPORT.md` — structural and semantic code graph report
- `.2brain/EXECUTION.md` — runnable build/test/CI/migration knowledge
- `.2brain/llm-wiki/` — per-file machine-oriented pages, one per source file (page path = source path + `.md`)
- `.2brain/modules/` — human-oriented module notes, mirrored into Obsidian
- `.2brain/repo-index.json` — semantic retrieval index backing `2brain query` (a query backend, not a document to open directly)

## Where to look

- **Editing or reading a source file** → read `.2brain/llm-wiki/<path>.md` first (page path = source path + `.md`). It carries the file's purpose, key elements, graph neighbours, and gotchas not in the source.
- **"How do I run / build / test / deploy this?"** → `.2brain/EXECUTION.md`.
- **First contact with an unfamiliar large codebase** → `.2brain/graphify-out/GRAPH_REPORT.md` for structural orientation.
- **Anything else, or you don't know which file** → `2brain query <repo-path> "question"`.

Artifacts generated from commit `d0616e30614e1bdb4e61496b55da33c1441b07e0`. If `git rev-parse HEAD` differs, prefer the source over these artifacts and say so.

## Index Metadata
- Provider: `ollama`
- Model: `qwen3.8:27b`
- Index revision: `108dc8e1b2c67f13d4e3f994e910d3d22643201bf28cc35218cd2109147a1fe3`
- Indexed chunks: `5434`
- Memory entries: `0`

## Query
- Semantic query: `2brain query <repo-path> "your question" --top-k 5`
- Add durable memory: `2brain remember <repo-path> "fact/decision/runbook" --kind fact`

