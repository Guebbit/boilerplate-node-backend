/**
 * Test order for `jest.config.zammad.js`: the adapter contract first, the journeys next, the GDPR
 * file last. The GDPR file's retention case files a deletion for everything older than its shifted
 * clock, which is all the tickets the earlier files made, so it must run when they are done.
 */

/** Jest's own sequencer, which this one only reorders. */
const Sequencer = require('@jest/test-sequencer').default;

/** The files in the order they must run; anything unlisted runs after them, by name. */
const ORDER = ['adapter.contract', 'journeys', 'gdpr'];

/** The rank of a test file: its place in {@link ORDER}, or past the end. */
const rank = (test) => {
    const index = ORDER.findIndex((name) => test.path.includes(`/${name}.`));
    return index === -1 ? ORDER.length : index;
};

/** Jest's sequencer with the fixed order. */
class ZammadSequencer extends Sequencer {
    /**
     * Sort the files into the fixed order.
     *
     * @param tests - the files Jest found
     */
    sort(tests) {
        return tests.toSorted((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
    }
}

module.exports = ZammadSequencer;
