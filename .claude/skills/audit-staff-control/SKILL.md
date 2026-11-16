---
name: audit-staff-control
description: Audit money and outside-world flows for the house rule — alert staff and give them the instrument, never a fragile per-case automation
argument-hint: <module|path|--diff|whole-repo>  (default: whole-repo)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch --show-current), Bash(git log:*), Bash(ls:*), Bash(2brain query:*), Bash(npm run audit:check-clean:*)
---

Read `scripts/audit/staff-control/SKILL.md` and follow it. The scope is: $ARGUMENTS

The audit lives under `scripts/audit/` so any AI tool can run it; this file only registers it with
Claude Code. See `docs/build/ai-auditing.md`.
