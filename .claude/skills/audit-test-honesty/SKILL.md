---
name: audit-test-honesty
description: Audit tests that pass without proving anything — coverage padding, mocked subjects, swallowed failures, lying titles, degenerate inputs — and, with --fix, repair the confirmed ones
argument-hint: <module|path|--diff> [--fix]  (default: modules touched by the working tree)
allowed-tools: Read, Glob, Grep, Write, Edit, Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(git log:*), Bash(git worktree:*), Bash(ls:*), Bash(rg:*), Bash(npx jest:*)
---

Read `scripts/audit/test-honesty/SKILL.md` and follow it. The scope is: $ARGUMENTS

The audit lives under `scripts/audit/` so any AI tool can run it; this file only registers it with
Claude Code. See `docs/tools/ai-auditing.md`.
