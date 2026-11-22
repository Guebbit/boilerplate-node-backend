#!/usr/bin/env tsx
/**
 * @module
 * The daily Zammad advisory watcher — `npm run security:zammad-advisories`.
 *
 * Reads Zammad's published security advisories from GitHub, compares their vulnerable ranges with
 * the image pinned in `compose.production.yaml`, and exits non-zero when the pin is exposed (2)
 * or a range could not be read, or anything else failed (1). `.github/workflows/zammad-advisories.yml` turns that into one tracking issue.
 *
 * The comparison is `scripts/security/zammad-exposure.ts`'s. This file only talks to GitHub and the disk.
 *
 * @see docs/operate/zammad.md#security-releases
 */
import { readFileSync } from 'node:fs';
import { checkZammadAdvisories, fetchPage, type ZammadAdvisory } from './zammad-exposure';
import { failScript } from '../fail-script';

/** The compose file whose pin is checked; the script runs from the repository root, like every `npm run`. */
const COMPOSE_FILE = 'compose.production.yaml';

/**
 * One line per advisory: id, severity, summary, link.
 *
 * @param advisory what to describe
 */
const describe = (advisory: ZammadAdvisory): string =>
    `  ${advisory.ghsa_id} [${advisory.severity ?? 'unrated'}] ${advisory.summary} — ${advisory.html_url}`;

checkZammadAdvisories(fetchPage, readFileSync(COMPOSE_FILE, 'utf8'))
    .then(({ pin, exposed, unreadable }) => {
        if (exposed.length === 0 && unreadable.length === 0) {
            console.log(`Zammad ${pin}: no published advisory covers this version.`);
            return;
        }
        if (exposed.length > 0)
            console.error(
                `Zammad ${pin} is inside the vulnerable range of:\n${exposed.map((advisory) => describe(advisory)).join('\n')}\n` +
                    'Bump the pin: docs/operate/zammad.md#security-releases'
            );
        if (unreadable.length > 0)
            console.error(
                `Version range not readable, check by hand:\n${unreadable.map((advisory) => describe(advisory)).join('\n')}`
            );
        // 2 = the pin is covered: the workflow names its issue after that. 1 = the watcher could not decide.
        process.exitCode = exposed.length > 0 ? 2 : 1;
    })
    .catch(failScript);
