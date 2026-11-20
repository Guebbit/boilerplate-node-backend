#!/usr/bin/env tsx
/**
 * Generates the permission vocabulary from `authorization-keys.generated.yaml`: actions, subjects, rule ids,
 * set names, scopes, step-up tiers and the subject-to-actions pair map, each a runtime array plus
 * its union type.
 *
 * The render module beside it is the same text in both repos (kept by hand, not synced); both write
 * a `permission-vocabulary` module beside their other generated contract types. The input is the SAME
 * document in both: the backend reads its `shared/authorization-keys.generated.yaml`, the frontend the copy
 * `sync:frontend` hands it (`contracts/authorization-keys.generated.yaml`).
 *
 * `--check` writes nothing and exits 1 on a mismatch — the contract every generator here keeps.
 *
 * Usage: tsx scripts/contracts/generate-permission-vocabulary.ts --in <yaml> --out <path> [--check]
 */
import { readFileSync } from 'node:fs';
import { writeOrCheck } from './generated-file';
import {
    readPermissionVocabulary,
    renderPermissionVocabulary
} from './permission-vocabulary-render';
import { requiredPath } from '../cli';
import { REPO_ROOT } from '../modules-on-disk';

/** The permission-key YAML to read, from `--in`. */
const INPUT = requiredPath('in', REPO_ROOT);

/** The file to generate, from `--out`. */
const OUTPUT = requiredPath('out', REPO_ROOT);

/** The whole generated file's text. */
const output = renderPermissionVocabulary(readPermissionVocabulary(readFileSync(INPUT, 'utf8')));

// Write the file, or under `--check` compare it with what is on disk.
writeOrCheck(OUTPUT, output, INPUT);
