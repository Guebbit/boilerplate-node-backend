---
name: audit-test-honesty
description: Report tests that pass without proving anything — coverage padding, mocked subjects, swallowed failures, lying titles, degenerate inputs
argument-hint: <module|path|--diff>  (default: modules touched by the working tree)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(git log:*), Bash(ls:*), Bash(rg:*), Bash(npm run mutation:*)
---

Read `scripts/audit/test-honesty/SKILL.md` and follow it. The scope is: $ARGUMENTS

The audit lives under `scripts/audit/` so any AI tool can run it; this file only registers it with
Claude Code. See `docs/tools/ai-auditing.md`.
