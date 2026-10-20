---
name: audit-ddd-drift
description: Report where the DDD the docs describe no longer matches the code — who drives whose state, named questions vs read tables, domain placement, subdomain depth, stale counts
argument-hint: <module|path|--diff>  (default: the whole repo)
allowed-tools: Read, Glob, Grep, Write, Agent, Bash(rg:*), Bash(wc:*), Bash(ls:*), Bash(git log:*), Bash(git diff:*), Bash(git status:*), Bash(git branch:*)
---

Read `scripts/audit/ddd-drift/SKILL.md` and follow it. The scope is: $ARGUMENTS

The audit lives under `scripts/audit/` so any AI tool can run it; this file only registers it with
Claude Code. See `docs/tools/ai-auditing.md`.
