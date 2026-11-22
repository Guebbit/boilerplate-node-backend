import {
    checkZammadAdvisories,
    fetchPage,
    findExposure,
    type AdvisoryPage,
    readZammadPin,
    type ZammadAdvisory
} from '../../../../scripts/security/zammad-exposure';

/**
 * A fixture advisory in the shape GitHub returns, one vulnerable range per entry in `ranges`
 * (`null` stands for an advisory that published no range).
 *
 * @param id the GHSA id, also the sort key in assertions
 * @param ranges the `vulnerable_version_range` of each vulnerability
 */
const advisory = (id: string, ...ranges: (string | null)[]): ZammadAdvisory => ({
    ghsa_id: id,
    html_url: `https://github.com/zammad/zammad/security/advisories/${id}`,
    summary: `summary of ${id}`,
    severity: 'high',
    vulnerabilities: ranges.map((range) => ({
        vulnerable_version_range: range,
        patched_versions: null
    }))
});

/** The compose line the pin is read from, as `compose.production.yaml` writes it. */
const composeLine = (tag: string): string =>
    `x-zammad-image: &zammad-image ghcr.io/zammad/zammad:${tag}@sha256:${'a'.repeat(64)}\n`;

/** The ids of an advisory list, for readable assertions. */
const ids = (list: ZammadAdvisory[]): string[] => list.map((item) => item.ghsa_id);

describe('readZammadPin', () => {
    it('strips the build suffix', () => {
        expect(readZammadPin(composeLine('7.2.3-0017'))).toBe('7.2.3');
    });

    it('accepts the same pin on several services', () => {
        expect(readZammadPin(composeLine('7.2.3-0017') + composeLine('7.2.3-0017'))).toBe('7.2.3');
    });

    it('refuses a file with no Zammad pin', () => {
        expect(() => readZammadPin('image: postgres:17\n')).toThrow(/found 0/u);
    });

    it('refuses a file that pins two different versions', () => {
        expect(() => readZammadPin(composeLine('7.2.3-0017') + composeLine('7.1.0-0001'))).toThrow(
            /found 2/u
        );
    });
});

describe('findExposure', () => {
    it('flags a pin inside a bounded range, whose bounds carry the build suffix', () => {
        const report = findExposure([advisory('A', '>= 7.0.0, < 7.2.4-0020')], '7.2.3');

        expect(ids(report.exposed)).toEqual(['A']);
    });

    it('does not flag the patched version itself', () => {
        const report = findExposure([advisory('A', '>= 7.0.0, < 7.2.3-0017')], '7.2.3');

        expect(report).toEqual({ exposed: [], unreadable: [] });
    });

    it('does not flag a range that ends below the pin', () => {
        const report = findExposure([advisory('LE_BELOW', '<= 7.2.2')], '7.2.3');

        expect(report).toEqual({ exposed: [], unreadable: [] });
    });

    it('does not flag a range on another release line', () => {
        const report = findExposure([advisory('A', '>= 6.0.0, < 6.5.2')], '7.2.3');

        expect(report).toEqual({ exposed: [], unreadable: [] });
    });

    it('reads <=, = and a bare version', () => {
        const report = findExposure(
            [advisory('LE', '<= 7.2.3'), advisory('EQ', '= 7.2.3'), advisory('BARE', '7.2.3')],
            '7.2.3'
        );

        expect(ids(report.exposed)).toEqual(['LE', 'EQ', 'BARE']);
    });

    it('reads a two-part version as .0', () => {
        const report = findExposure([advisory('A', '>= 7.2, < 7.3')], '7.2.3');

        expect(ids(report.exposed)).toEqual(['A']);
    });

    it('flags an advisory when any one of its vulnerabilities covers the pin', () => {
        const report = findExposure([advisory('A', '< 6.5.2', '>= 7.2.0, < 7.2.4')], '7.2.3');

        expect(ids(report.exposed)).toEqual(['A']);
    });

    it('reports a range it cannot read instead of skipping it', () => {
        const report = findExposure(
            [advisory('ODD', 'every version before the fix'), advisory('NULL', null)],
            '7.2.3'
        );

        expect(ids(report.unreadable)).toEqual(['ODD', 'NULL']);
    });

    it('reports a list of bare versions as unreadable, whether or not the pin is in it', () => {
        const report = findExposure(
            [advisory('LIST', '7.0.3, 7.1.1'), advisory('HIT', '7.2.3, 7.1.1')],
            '7.2.3'
        );

        expect(ids(report.unreadable)).toEqual(['LIST', 'HIT']);
        expect(report.exposed).toEqual([]);
    });

    it('reports an advisory with no vulnerability entry at all', () => {
        const report = findExposure([advisory('EMPTY')], '7.2.3');

        expect(ids(report.unreadable)).toEqual(['EMPTY']);
    });

    it('lets a matching entry win over an unreadable one', () => {
        const report = findExposure([advisory('A', 'nonsense', '< 7.3.0')], '7.2.3');

        expect(ids(report.exposed)).toEqual(['A']);
        expect(report.unreadable).toEqual([]);
    });
});

describe('checkZammadAdvisories', () => {
    it('follows the next-page links until there is none', () => {
        const pages: Record<string, AdvisoryPage> = {
            first: { body: [advisory('OLD', '< 1.0.0')], next: 'second' },
            second: { body: [advisory('LAST', '< 8.0.0')] }
        };
        const fetchPage = jest.fn((url: string | undefined) =>
            Promise.resolve(pages[url ?? 'first'] ?? { body: [] })
        );

        return checkZammadAdvisories(fetchPage, composeLine('7.2.3-0017')).then((report) => {
            expect(fetchPage.mock.calls).toEqual([[undefined], ['second']]);
            expect(report.pin).toBe('7.2.3');
            expect(ids(report.exposed)).toEqual(['LAST']);
        });
    });

    it('stops on a cursor that never ends', () =>
        expect(
            checkZammadAdvisories(
                () => Promise.resolve({ body: [], next: 'again' }),
                composeLine('7.2.3-0017')
            )
        ).rejects.toThrow(/after 50 pages/u));

    it('refuses a body that is not an advisory list', () =>
        expect(
            checkZammadAdvisories(
                () => Promise.resolve({ body: { message: 'Not Found' } }),
                composeLine('7.2.3-0017')
            )
        ).rejects.toThrow());
});

describe('fetchPage', () => {
    /** Stands in for the network; each test hands it the one response GitHub would give. */
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    afterEach(() => {
        fetchSpy.mockReset();
    });

    it('rejects on a non-2xx answer, naming the status', () => {
        fetchSpy.mockResolvedValue(new Response('{}', { status: 403 }));

        return expect(fetchPage(undefined)).rejects.toThrow(/GitHub answered 403/u);
    });

    it('returns the rel="next" url when the Link header carries several', () => {
        fetchSpy.mockResolvedValue(
            new Response('[]', {
                headers: {
                    Link: '<https://example.test/prev>; rel="prev", <https://example.test/n>; rel="next"'
                }
            })
        );

        return expect(fetchPage(undefined)).resolves.toEqual({
            body: [],
            next: 'https://example.test/n'
        });
    });

    it('returns no next page without a Link header', () => {
        fetchSpy.mockResolvedValue(new Response('[]'));

        return expect(fetchPage('https://example.test/p')).resolves.toEqual({
            body: [],
            next: undefined
        });
    });
});
