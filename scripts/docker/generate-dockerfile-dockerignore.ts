#!/usr/bin/env tsx
/**
 * `docker/Dockerfile.dockerignore` — `npm run docker:dockerignore`, part of `regenerate`.
 *
 * Docker and Buildah both look for `<dockerfile-name>.dockerignore` next to the Dockerfile before
 * falling back to the root `.dockerignore`, and use it INSTEAD, not merged with it. Hand-keeping a
 * second copy is exactly how it drifted the first time — the root file moved test/mutation output
 * under `tmp/`, and this one kept excluding the old `coverage`/`reports`/`.stryker-tmp` names
 * until nobody noticed. Deriving it removes the chance.
 *
 * The one deliberate difference from the root file: `.git` stays IN. `npm run complete` — which
 * `docker-compose.test.yml`'s `gate` service and the `container-gate` CI job both run inside this
 * image — includes `lint`, and the `local/comment-links` ESLint rule shells out to `git ls-files`
 * to check that a comment's file reference still exists. No `.git` directory means that rule
 * hard-crashes rather than reporting a finding, not a lint failure that could be waived.
 * `docker/Dockerfile.production` has the same gap and sidesteps it by never running `lint` at all
 * — see the comment on its build stage — which is not an option here because running `npm run
 * complete` unmodified is the point.
 *
 * `--check` reports drift instead of rewriting, for `complete`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Report drift instead of rewriting the file — what `complete` runs. */
const checkOnly = process.argv.includes('--check');

/** Repo root, two levels up from `scripts/docker/`. */
const ROOT = path.join(__dirname, '..', '..');

const SOURCE = path.join(ROOT, '.dockerignore');
const TARGET = path.join(ROOT, 'docker', 'Dockerfile.dockerignore');

/** Explains the one deliberate difference from the root file, and why this file exists at all. */
const HEADER = `# Per-Dockerfile override of the root \`.dockerignore\`, for \`docker/Dockerfile\` ONLY — Docker/
# Buildah both look for \`<dockerfile-name>.dockerignore\` next to the Dockerfile before falling
# back to the root file, and use it INSTEAD, not merged with it. This file therefore repeats the
# root list in full; the one deliberate difference is \`.git\` staying IN.
#
# Why: \`npm run complete\` — which \`docker-compose.test.yml\`'s \`gate\` service and the
# \`container-gate\` CI job both run inside this image — includes \`lint\`, and the
# \`local/comment-links\` ESLint rule shells out to \`git ls-files\` to check that a
# comment's file reference still exists. No \`.git\` directory means that rule hard-crashes rather
# than reporting a finding, not a lint failure that could be waived. \`docker/Dockerfile.production\`
# has the same gap and sidesteps it by never running \`lint\` at all — see the comment on its build
# stage — which is not an option here because running \`npm run complete\` unmodified is the point.
#
# GENERATED from the root .dockerignore by scripts/docker/generate-dockerfile-dockerignore.ts —
# \`npm run regenerate\` rebuilds it. Do not hand-edit.
`;

/** Blank-line-separated entries, so the `.git` block can be dropped as a whole unit. */
const blocksOf = (content: string): string[] => content.trimEnd().split('\n\n');

/** The root file's blocks, minus the one whose comment names version control. */
const derive = (): string => {
    const root = readFileSync(SOURCE, 'utf8');
    const kept = blocksOf(root).filter((block) => !block.startsWith('# Version control'));
    return `${HEADER}\n${kept.join('\n\n')}\n`;
};

const next = derive();

if (checkOnly) {
    const current = readFileSync(TARGET, 'utf8');
    if (current === next) process.exit(0);
    console.error(
        `[docker] ${path.relative(ROOT, TARGET)} is out of date with ${path.relative(ROOT, SOURCE)}.\n` +
            '         Run `npm run docker:dockerignore` and commit the result.'
    );
    process.exit(1);
}

writeFileSync(TARGET, next);
console.log(`[docker] ${path.relative(ROOT, TARGET)} updated.`);
