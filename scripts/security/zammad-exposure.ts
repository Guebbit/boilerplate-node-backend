/**
 * @module
 * Is the Zammad image this repo pins inside an advisory's vulnerable range?
 *
 * Zammad's security advisories carry no package ecosystem, so Dependabot never raises them (see
 * `docs/operate/zammad.md#security-releases`). `scripts/security/zammad-advisories.ts` reads them from GitHub and
 * asks this file the one question.
 *
 * Two quirks drive the shape:
 *   - The image tag has a build suffix (`7.2.3-0017`); the advisory ranges do not. It is stripped
 *     from both sides.
 *   - A range that cannot be read is reported, never skipped: a skipped one is a missed advisory.
 *
 * @see docs/operate/zammad.md#security-releases
 */
import { coerce, satisfies } from 'semver';
import { z } from 'zod';

/**
 * One repository security advisory, reduced to what the watcher reads.
 * https://docs.github.com/en/rest/security-advisories/repository-advisories#list-repository-security-advisories
 */
export const advisorySchema = z.object({
    ghsa_id: z.string(),
    html_url: z.string(),
    summary: z.string(),
    severity: z.string().nullish(),
    vulnerabilities: z.array(
        z.object({
            vulnerable_version_range: z.string().nullish(),
            patched_versions: z.string().nullish()
        })
    )
});

/** One advisory as the GitHub API returns it, see {@link advisorySchema}. */
export type ZammadAdvisory = z.infer<typeof advisorySchema>;

/** What the pin is checked against: the advisories that name it, and the ones whose range could not be read. */
export interface ExposureReport {
    /** Advisories whose vulnerable range contains the pin. */
    exposed: ZammadAdvisory[];
    /** Advisories with a range this file cannot read; each needs a person. */
    unreadable: ZammadAdvisory[];
}

/**
 * The Zammad version in a compose file's image reference, without the build suffix.
 *
 * @param composeText the contents of `compose.production.yaml`
 * @returns the plain `x.y.z`, e.g. `7.2.3` for `ghcr.io/zammad/zammad:7.2.3-0017@sha256:…`
 * @throws {Error} unless the file pins the image exactly once, so a moved or duplicated pin is loud
 */
export const readZammadPin = (composeText: string): string => {
    const found = [
        ...composeText.matchAll(/ghcr\.io\/zammad\/zammad:(\d+\.\d+\.\d+)(?:-\d+)?@sha256:/gu)
    ].map((match) => match[1]);
    const versions = [...new Set(found)];
    const [version] = versions;
    if (versions.length !== 1)
        throw new Error(
            `Expected one pinned ghcr.io/zammad/zammad version in the compose file, found ${String(versions.length)}.`
        );
    return version;
};

/**
 * One comparator of an advisory range: an optional operator, then a version that may carry the
 * `-00NN` build suffix. `6.5` is read as `6.5.0`.
 */
const COMPARATOR = /^(<=|>=|[<>=])?\s*v?(\d+(?:\.\d+){0,2})(?:-\d+)?$/u;

/**
 * Does `pin` fall inside a GitHub-style range such as `>= 7.0.0, < 7.2.4-0020`?
 *
 * @param range comma-separated comparators, all of which must hold
 * @param pin a plain `x.y.z`
 * @returns `undefined` when a comparator cannot be read, so the caller can report it
 */
const inRange = (range: string, pin: string): boolean | undefined => {
    const comparators = range.split(',').map((token) => COMPARATOR.exec(token.trim()));
    if (comparators.includes(null)) return undefined;
    const normalised = comparators.flatMap((match) => {
        // The null check above proved each match is present.
        const [, operator = '=', version = ''] = match ?? [];
        const full = coerce(version);
        return full === null ? [] : [`${operator}${full.version}`];
    });
    if (normalised.length !== comparators.length) return undefined;
    // https://github.com/npm/node-semver#ranges — space-separated comparators are ANDed.
    return satisfies(pin, normalised.join(' '));
};

/**
 * Sort advisories into the ones that hit `pin` and the ones nobody could read.
 *
 * @param advisories the published advisories of the Zammad repository
 * @param pin the plain `x.y.z` from {@link readZammadPin}
 */
export const findExposure = (advisories: ZammadAdvisory[], pin: string): ExposureReport => {
    const report: ExposureReport = { exposed: [], unreadable: [] };
    for (const advisory of advisories) {
        const verdicts = advisory.vulnerabilities.map(({ vulnerable_version_range: range }) =>
            range ? inRange(range, pin) : undefined
        );
        if (verdicts.includes(true)) report.exposed.push(advisory);
        else if (verdicts.length === 0 || verdicts.includes(undefined))
            report.unreadable.push(advisory);
    }
    return report;
};

/** One page of advisories: the raw JSON body, and the URL of the next page when GitHub names one. */
export interface AdvisoryPage {
    body: unknown;
    next?: string | undefined;
}

/**
 * One page of Zammad's published advisories, 100 at a time. GitHub pages this list by cursor, so
 * the next page is whatever the `Link: rel="next"` header names — a `page=` parameter is ignored.
 * https://docs.github.com/en/rest/security-advisories/repository-advisories — `GITHUB_TOKEN` is
 * optional, it only lifts the anonymous limit (60 requests an hour).
 *
 * @param url the page to read; `undefined` is the first
 * @throws {Error} on any answer that is not 2xx
 */
export const fetchPage = (url: string | undefined): Promise<AdvisoryPage> =>
    fetch(
        url ??
            'https://api.github.com/repos/zammad/zammad/security-advisories?state=published&per_page=100',
        {
            headers: {
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                ...(process.env.GITHUB_TOKEN
                    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
                    : {})
            }
        }
    ).then((response) => {
        if (!response.ok)
            throw new Error(`GitHub answered ${String(response.status)} for ${response.url}`);
        // `Link: <https://…&after=…>; rel="next"` — the one rel this reads.
        const next = /<([^>]+)>;\s*rel="next"/u.exec(response.headers.get('link') ?? '')?.[1];
        return response.json().then((body: unknown) => ({ body, next }));
    });

/** More pages than this means the cursor is looping; the real list is a few hundred at most. */
const MAX_PAGES = 50;

/**
 * Read every published advisory, following the pages the API links, and check the pin against them.
 *
 * @param fetchPage returns the page at a URL (`undefined` = the first page); wiring it to GitHub is the caller's
 * @param composeText the contents of `compose.production.yaml`
 * @returns the pin that was checked and the {@link ExposureReport}
 * @throws {Error} when a page is not an advisory list, the pages never end, or the compose file has no single pin
 */
export const checkZammadAdvisories = async (
    fetchPage: (url: string | undefined) => Promise<AdvisoryPage>,
    composeText: string
): Promise<ExposureReport & { pin: string }> => {
    const pin = readZammadPin(composeText);
    const advisories: ZammadAdvisory[] = [];
    let url: string | undefined;
    for (let pages = 0; pages < MAX_PAGES; pages++) {
        const { body, next } = await fetchPage(url);
        advisories.push(...z.array(advisorySchema).parse(body));
        if (next === undefined) return { pin, ...findExposure(advisories, pin) };
        url = next;
    }
    throw new Error(`Advisory list still has a next page after ${String(MAX_PAGES)} pages.`);
};
