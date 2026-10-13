---
name: audit-reachability
description: Audit whether a defence its tests prove in isolation is reachable, and identical, through the real mounted request path
argument-hint: <module|path|--diff>  (default: modules touched by the working tree)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(git log:*), Bash(ls:*), Bash(2brain query:*)
---

Read `scripts/audit/reachability/SKILL.md` and follow it. The scope is: $ARGUMENTS

The audit lives under `scripts/audit/` so any AI tool can run it; this file only registers it with
Claude Code. See `docs/tools/ai-auditing.md`.
