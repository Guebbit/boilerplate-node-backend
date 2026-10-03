#!/usr/bin/env tsx
/**
 * `npm run setup` — from a fresh clone to a filled-in `.env`, one command (B11b).
 *
 * 1. Copies `.env-example` to `.env` if `.env` does not exist yet — never overwrites one already
 *    there.
 * 2. Fills every still-placeholder secret the boot gate would refuse (`fillableKeys` reads that
 *    list off the enabled modules and the app-level checks, so a new module's secret is covered
 *    automatically), with a fresh `randomBytes(32)` value each.
 * 3. Hands Prometheus its own copy of `NODE_METRICS_TOKEN`, since it has no access to `.env` and
 *    reads its scrape credential from a file instead (`credentials_file` in
 *    `docker/observability/prometheus.config.yaml`, mounted by `docker-compose.yml`). Written
 *    unconditionally, so the bind mount always finds a real file — an absent one, Docker/Podman
 *    silently creates as a directory instead, and Prometheus fails to read it.
 *
 * Prints only key NAMES, never values.
 *
 * Usage: `npm run setup`
 */

import {
    constants as fsConstants,
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fillPlaceholders, readEnvironmentValue } from './environment-file';
import { fillableKeys } from './required-keys';

/** The repo root, two levels up from `scripts/setup/`. */
const ROOT = path.join(__dirname, '..', '..');

/** The committed template `.env` is copied from. */
const ENV_EXAMPLE = path.join(ROOT, '.env-example');

/** The developer's local environment file (gitignored). */
const ENV_FILE = path.join(ROOT, '.env');

/** Where the Prometheus metrics token is written for the local observability stack. */
const METRICS_TOKEN_FILE = path.join(ROOT, 'tmp', 'secrets', 'prometheus-metrics-token');

/** Copies `.env-example` to `.env`, but only when `.env` does not exist yet. */
const ensureEnvironmentFile = (): boolean => {
    if (existsSync(ENV_FILE)) return false;
    // COPYFILE_EXCL: fail rather than overwrite if `.env` appeared between the check above and
    // this call — the one thing this script must never do to a developer's real secrets.
    copyFileSync(ENV_EXAMPLE, ENV_FILE, fsConstants.COPYFILE_EXCL);
    return true;
};

/** Writes `content` to `target` atomically (temp file + rename), mode 0600 — a secrets file. */
const writeSecretFile = (target: string, content: string): void => {
    mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}`;
    writeFileSync(temporary, content, { mode: 0o600 });
    renameSync(temporary, target);
};

/** Whether this run created `.env` (false when one was already there). */
const created = ensureEnvironmentFile();

// Say so when a fresh `.env` was just copied.
if (created) console.log('[setup] .env created from .env-example.');

/** `.env` as it is now. */
const before = readFileSync(ENV_FILE, 'utf8');

/** `.env` with every placeholder secret replaced by a generated value, and which keys changed. */
const { content: after, filled } = fillPlaceholders(before, fillableKeys());

// Write `.env` only when something was filled, so a re-run leaves the file untouched.
if (filled.length > 0) {
    writeSecretFile(ENV_FILE, after);
    console.log(`[setup] filled: ${filled.join(', ')}`);
} else {
    console.log('[setup] nothing to fill — every secret is already set.');
}

// Mirror the metrics token into its own file, which the Prometheus container reads.
writeSecretFile(METRICS_TOKEN_FILE, readEnvironmentValue(after, 'NODE_METRICS_TOKEN') ?? '');
console.log(`[setup] ${path.relative(ROOT, METRICS_TOKEN_FILE)} written for Prometheus.`);
