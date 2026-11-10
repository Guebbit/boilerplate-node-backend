#!/usr/bin/env tsx
/**
 * @module
 * Command line for the audit tripwire (`scripts/audit/RULES.md`, rule 6).
 *
 * Usage:
 *   `npm run audit:check-clean -- snapshot <run-folder> [--repo <path>...]`
 *   `npm run audit:check-clean -- compare  <run-folder> [--repo <path>...]`
 *
 * Exit 0 = clean, 1 = it lists what changed, 2 = bad usage. It reports a write after the fact; it
 * does not stop one. The current directory is always audited; `--repo` adds more (the paired
 * frontend).
 */
import { main } from './check-clean';

process.exitCode = main(process.argv.slice(2));
