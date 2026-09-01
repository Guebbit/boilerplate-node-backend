# Repo Context

_Canonical 2repo context source for AI editors._

## Core Artifacts
- `.2repo/graphify-out/GRAPH_REPORT.md` — structural and semantic code graph report
- `.2repo/EXECUTION.md` — runnable build/test/CI/migration knowledge
- `.2repo/REPO_MEMORY.md` — durable repository memory entries
- `.2repo/repo-index.json` — semantic retrieval index
- `.2repo/wiki/` — living wiki: per-file documentation pages plus `OVERVIEW.md` (generated — do not edit by hand; regenerate with `2repo wiki <repo-path>`)
- `.2repo/arch/` — architecture layer: component/topic pages with Mermaid diagrams plus `overview.md` (generated — do not edit by hand; regenerate with `2repo arch <repo-path>`)

## Index Metadata
- Provider: `ollama`
- Model: `qwen3.8:27b`
- Index revision: `3315a5f779d6768797e6ccfc13524474eb821ff266e8d78305a7a6e29a1ca55e`
- Indexed chunks: `8753`
- Memory entries: `0`

## Query
- Semantic query: `2repo query <repo-path> "your question" --top-k 5`
- Add durable memory: `2repo remember <repo-path> "fact/decision/runbook" --kind fact`

