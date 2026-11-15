---
name: audit-comments
description: Audit a scope for comments that are missing, in the wrong form, wrong, bloated or unlinked, against the house rules in docs/build/code-comments.md
argument-hint: <module|path|--diff|whole-repo>  (default: whole-repo)
allowed-tools: Read, Glob, Grep, Write, Agent, Bash(git diff:*), Bash(git status:*), Bash(git branch --show-current), Bash(ls:*), Bash(npm run audit:check-clean:*)
---

Read `scripts/audit/comments/SKILL.md` and follow it. The scope is: $ARGUMENTS

The audit lives under `scripts/audit/` so any AI tool can run it; this file only registers it with
Claude Code. See `docs/build/ai-auditing.md`.
