---
name: audit-rate-limit-keys
description: Audit whether every rate-limit budget buckets callers by something an attacker cannot cheaply rotate
argument-hint: <module|path|--diff|whole-repo>  (default: whole-repo)
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git status:*), Bash(git branch --show-current), Bash(git log:*), Bash(ls:*), Bash(2brain query:*), Bash(npm run audit:check-clean:*)
---

Read `scripts/audit/rate-limit-keys/SKILL.md` and follow it. The scope is: $ARGUMENTS

The audit lives under `scripts/audit/` so any AI tool can run it; this file only registers it with
Claude Code. See `docs/tools/ai-auditing.md`.
