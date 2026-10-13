---
name: audit-code-shape
description: Audit a scope for over-abstraction — shallow functions, pass-throughs, lazy files, speculative generality — and its two neighbours, dead code (knip) and copy-paste (jscpd)
argument-hint: <module|path|--diff>  (default: modules touched by the working tree)
allowed-tools: Read, Glob, Grep, Write, Agent, Bash(npm run audit:*), Bash(npm run -s audit:*), Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(ls:*)
---

Read `scripts/audit/code-shape/SKILL.md` and follow it. The scope is: $ARGUMENTS

The audit lives under `scripts/audit/` so any AI tool can run it; this file only registers it with
Claude Code. See `docs/tools/ai-auditing.md`.
