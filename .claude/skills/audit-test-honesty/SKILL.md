---
name: audit-test-honesty
description: Report tests that pass without proving anything — coverage padding, mocked subjects, swallowed failures, lying titles, degenerate inputs
argument-hint: <module|path|--diff|whole-repo>  (default: whole-repo)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch --show-current), Bash(git log:*), Bash(ls:*), Bash(rg:*), Bash(npm run mutation), Bash(npm run audit:check-clean:*), Bash(npm run audit:test-candidates:*)
---

Read `scripts/audit/test-honesty/SKILL.md` and follow it. The scope is: $ARGUMENTS

The audit lives under `scripts/audit/` so any AI tool can run it; this file only registers it with
Claude Code. See `docs/tools/ai-auditing.md`.
