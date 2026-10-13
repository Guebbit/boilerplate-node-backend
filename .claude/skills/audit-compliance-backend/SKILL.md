---
name: audit-compliance-backend
description: Audit this backend against the shared compliance registry's backend-responsibility rules
argument-hint: <module|path|--diff>  (default: the whole repo)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(ls:*), Bash(2brain query:*)
---

Read `scripts/audit/compliance-backend/SKILL.md` and follow it. The scope is: $ARGUMENTS

The audit lives under `scripts/audit/` so any AI tool can run it; this file only registers it with
Claude Code. See `docs/tools/ai-auditing.md`.
