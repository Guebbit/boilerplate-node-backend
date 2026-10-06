#!/usr/bin/env tsx
/*
 * Generates the permission-action vocabulary from `authorization-keys.yaml`'s `actions:` — a
 * runtime array plus the union type derived from it.
 *
 * SHARED SCRIPT — byte-identical in both repos of the pair, and both write a
 * `permission-actions` module beside their other generated contract types. The input is the SAME
 * document in both: the backend reads its `shared/authorization-keys.yaml`, the frontend the copy
 * `sync:frontend` hands it (`contracts/authorization-keys.yaml`).
 *
 * `--check` writes nothing and exits 1 on a mismatch — the contract every generator here keeps.
 *
 * Usage: tsx scripts/contracts/generate-permission-actions.ts --in <yaml> --out <path> [--check]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeOrCheck } from './generated-file';
import { readPermissionActions, renderPermissionActions } from './permission-actions-render';

/** The repo root. `import.meta.url` rather than `__dirname`: this script runs as ESM. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/*
 * Reads a required `--flag <value>` argument.
 *
 * @param flag The flag name, with its dashes.
 * @returns Absolute path the value names.
 */
const requiredPath = (flag: string): string => {
    const value = process.argv[process.argv.indexOf(flag) + 1];
    if (process.argv.includes(flag) && value) return path.resolve(ROOT, value);
    console.error(`Missing required argument: ${flag} <path>`);
    process.exit(1);
};

/** The permission-key YAML to read, from `--in`. */
const INPUT = requiredPath('--in');

/** The file to generate, from `--out`. */
const OUTPUT = requiredPath('--out');

/** The whole generated file's text. */
const output = renderPermissionActions(readPermissionActions(readFileSync(INPUT, 'utf8')));

// Write the file, or under `--check` compare it with what is on disk.
writeOrCheck(OUTPUT, output, INPUT);
