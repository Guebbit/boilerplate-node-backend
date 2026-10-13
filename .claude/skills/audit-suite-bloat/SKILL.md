---
name: audit-suite-bloat
description: Find near-duplicate tests that cost CI time and add no discriminating power
argument-hint: <module|path|--diff>  (default: modules touched by the working tree)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(ls:*), Bash(npm run mutation:*)
---

Read `scripts/audit/suite-bloat/SKILL.md` and follow it. The scope is: $ARGUMENTS

The audit lives under `scripts/audit/` so any AI tool can run it; this file only registers it with
Claude Code. See `docs/tools/ai-auditing.md`.
