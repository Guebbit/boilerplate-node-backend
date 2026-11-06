---
name: audit-api-rfc5789
description: Audit this API against RFC 5789 PATCH, reported only
argument-hint: <module|path|--diff>  (default: the whole contract)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(ls:*), Bash(2brain query:*)
---

Read `scripts/audit/api-rfc5789/SKILL.md` and follow it. The scope is: $ARGUMENTS

The audit lives under `scripts/audit/` so any AI tool can run it; this file only registers it with
Claude Code. See `docs/tools/ai-auditing.md`.
