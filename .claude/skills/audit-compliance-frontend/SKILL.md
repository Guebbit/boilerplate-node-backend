---
name: audit-compliance-frontend
description: Audit the paired frontend against the shared compliance registry's frontend-responsibility rules
argument-hint: <module|path|--diff|whole-repo>  (default: whole-repo)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch --show-current), Bash(ls:*), Bash(2brain query:*), Bash(npm run audit:check-clean:*)
---

Read `scripts/audit/compliance-frontend/SKILL.md` and follow it. The scope is: $ARGUMENTS

The audit lives under `scripts/audit/` so any AI tool can run it; this file only registers it with
Claude Code. See `docs/build/ai-auditing.md`.
