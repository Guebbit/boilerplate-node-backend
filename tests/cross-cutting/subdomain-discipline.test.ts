/**
 * Subdomain discipline: spend modelling effort where the business is, and nowhere else.
 *
 * DDD's own advice is the part most often skipped — tactical patterns belong in the **core**
 * domain, and supporting and generic subdomains should use the simplest thing that works. Every
 * module now says which of the three it is, and this file is what stops that from being a label
 * nobody acts on:
 *
 *   - a `generic` module may not carry a `domain/` folder. Auth, i18n, audit trails and health
 *     endpoints are solved problems; a pure-rules layer inside one is effort spent on the part of
 *     the system that should be replaceable by something bought.
 *   - every module declares its subdomain, and its own glossary of terms.
 *
 * Whether the classification stays HONEST is not checked. If every module drifts to `core` the
 * field stops being able to say no to anything, and nothing here will report it — that is a review
 * question now, not a failing test.
 *
 * There is deliberately no rule that a `core` module MUST have a `domain/` folder. `products` is
 * core and has none, because its rules are currently thin enough to live in the service. That is a
 * legitimate state and a fair thing to notice; it is not a violation, and a test that forced the
 * folder would only produce empty ones.
 *
 * In a boilerplate these values are a worked example rather than a finding — a starter kit has no
 * core domain, and the first thing a real project does is re-decide them. The mechanism is the
 * deliverable, not the answers. See `docs/theory/domain-layer.md` §5.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { enabledModules } from '../../src/modules';
import type { Subdomain } from '@kernel/registry';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

const withSubdomain = (subdomain: Subdomain): string[] =>
    enabledModules.filter((appModule) => appModule.subdomain === subdomain).map(({ name }) => name);

describe('subdomain classification', () => {
    it('classifies every enabled module', () => {
        const unclassified = enabledModules
            .filter((appModule) => !['core', 'supporting', 'generic'].includes(appModule.subdomain))
            .map(({ name }) => name);

        expect(unclassified).toEqual([]);
    });

    it('keeps a domain layer out of generic subdomains', () => {
        const misplaced = withSubdomain('generic').filter((name) =>
            existsSync(path.join(MODULES_ROOT, name, 'domain'))
        );

        expect(misplaced).toEqual([]);
    });
});

describe('ubiquitous language', () => {
    it('is declared by every module', () => {
        const silent = enabledModules
            .filter((appModule) => Object.keys(appModule.language).length === 0)
            .map(({ name }) => name);

        expect(silent).toEqual([]);
    });

    it('defines terms rather than naming them', () => {
        // A one-word "definition" is a term that was added to satisfy this file. The threshold is
        // low on purpose — it catches placeholders, not terse writing.
        const undefinedTerms = enabledModules.flatMap((appModule) =>
            Object.entries(appModule.language)
                .filter(([, meaning]) => meaning.trim().length < 20)
                .map(([term]) => `${appModule.name}: ${term}`)
        );

        expect(undefinedTerms).toEqual([]);
    });
});
