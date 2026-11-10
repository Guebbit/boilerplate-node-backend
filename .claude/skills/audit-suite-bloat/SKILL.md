---
name: audit-suite-bloat
description: Find near-duplicate tests that cost CI time and add no discriminating power
argument-hint: <module|path|--diff|whole-repo>  (default: whole-repo)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch --show-current), Bash(ls:*), Bash(npm run mutation), Bash(npm run audit:check-clean:*)
---

Read `scripts/audit/suite-bloat/SKILL.md` and follow it. The scope is: $ARGUMENTS

The audit lives under `scripts/audit/` so any AI tool can run it; this file only registers it with
Claude Code. See `docs/tools/ai-auditing.md`.
