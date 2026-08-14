#!/usr/bin/env tsx
/**
 * Summarises a V8 heap snapshot — `npx tsx scripts/heap-report.ts <file.heapsnapshot> [topN]`.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────
 * A runaway process is usually diagnosed from the outside: lower a limit, raise a worker count, swap
 * a transform, and see whether the symptom moves. That answers "did it get better", never "what is
 * in there" — so it cannot tell a fix apart from a postponement.
 *
 * A snapshot answers the second question directly. Node writes one at the moment it is about to die
 * if the process is started with:
 *
 *     NODE_OPTIONS="--max-old-space-size=<mb> --heapsnapshot-near-heap-limit=1"
 *
 * Lower the limit to make the moment arrive sooner; the composition of the heap is the same.
 *
 * ── WHY IT STREAMS ───────────────────────────────────────────────────────────────────────────────
 * `.heapsnapshot` is JSON, and the obvious `JSON.parse(readFileSync(...))` cannot read one: a heap
 * of any interesting size produces a file past V8's maximum string length (~512 MB), so the read
 * fails with `ERR_STRING_TOO_LONG` before parsing begins. The irony is exact — the file is too big
 * to load for the same reason it is worth reading.
 *
 * So this walks the file in chunks and never holds more than one buffer:
 *
 *   1. the header, for `node_fields` (the shape of a node record) and `node_types` (its type names)
 *   2. `nodes`, a flat integer array — every `node_fields.length` values is one object, aggregated
 *      as it goes and then discarded
 *   3. `strings`, the interned name table — scanned in order, keeping only the few names the
 *      largest groups actually need
 *
 * ── READING THE OUTPUT ───────────────────────────────────────────────────────────────────────────
 * One dominant kind is a finding; an even spread is a working set. That distinction is the whole
 * point: it separates "something is retained" from "this suite is simply heavy", which need
 * opposite fixes. Chrome DevTools reads the same file and is better at retainer chains — this is
 * for the prior question of whose bug it is.
 */
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';

const file = process.argv[2];
if (!file) {
    console.error('usage: tsx scripts/heap-report.ts <file.heapsnapshot> [topN]');
    process.exit(2);
}
const topN = Number(process.argv[3] ?? 25);

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

/** The header is small and sits at the front, so a fixed read is enough to describe the records. */
const readHeader = async () => {
    const handle = await open(file, 'r');
    const { buffer } = await handle.read(Buffer.alloc(65_536), 0, 65_536, 0);
    await handle.close();
    const head = buffer.toString('utf8');

    // `[^\]]*` rather than a dot-all `.*?`: both arrays hold flat strings, no nested brackets
    const fields = JSON.parse(/"node_fields":(\[[^\]]*\])/.exec(head)![1]!) as string[];
    const types = JSON.parse(/"node_types":\[(\[[^\]]*\])/.exec(head)![1]!) as string[];
    return { fields, types };
};

/**
 * Streams one bracketed array of the top-level object, yielding its raw text in chunks.
 *
 * Depth counting rather than a regex: `nodes` contains no nested brackets, but `strings` contains
 * escaped quotes and brackets inside its values, so the scan has to know whether it is inside a
 * string literal.
 */
const streamArray = (key: string, onChunk: (text: string) => void): Promise<void> =>
    new Promise((resolve, reject) => {
        const opener = `"${key}":[`;
        let pending = '';
        let started = false;
        let depth = 0;
        let inString = false;
        let escaped = false;

        const stream = createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 22 });

        stream.on('data', (piece: string | Buffer) => {
            let text = pending + String(piece);
            pending = '';

            if (!started) {
                const at = text.indexOf(opener);
                if (at === -1) {
                    // Keep a tail long enough that the marker cannot be split across two chunks
                    pending = text.slice(-opener.length);
                    return;
                }
                started = true;
                depth = 1;
                text = text.slice(at + opener.length);
            }

            let cut = text.length;
            for (const [index, character] of [...text].entries()) {
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (character === '\\' && inString) {
                    escaped = true;
                    continue;
                }
                if (character === '"') {
                    inString = !inString;
                    continue;
                }
                if (inString) continue;
                if (character === '[') depth += 1;
                else if (character === ']') {
                    depth -= 1;
                    if (depth === 0) {
                        cut = index;
                        break;
                    }
                }
            }

            onChunk(text.slice(0, cut));
            if (depth === 0) {
                stream.destroy();
                resolve();
            }
        });

        stream.on('error', reject);
        stream.on('close', () => resolve());
    });

const main = async () => {
    const { fields, types } = await readHeader();
    const stride = fields.length;
    const typeAt = fields.indexOf('type');
    const nameAt = fields.indexOf('name');
    const sizeAt = fields.indexOf('self_size');

    /** Bytes and instances per "<type>|<name index>", so no string is held while nodes are read. */
    const byKind = new Map<string, { bytes: number; count: number }>();
    let total = 0;
    let objects = 0;

    let column = 0;
    let type = 0;
    let nameIndex = 0;
    let carry = '';

    await streamArray('nodes', (text) => {
        const values = (carry + text).split(',');
        // The last element may be a number cut in half by the chunk boundary
        carry = values.pop() ?? '';

        for (const raw of values) {
            const value = Number(raw);
            if (column === typeAt) type = value;
            else if (column === nameAt) nameIndex = value;
            else if (column === sizeAt) {
                total += value;
                const key = `${type}|${nameIndex}`;
                const entry = byKind.get(key) ?? { bytes: 0, count: 0 };
                entry.bytes += value;
                entry.count += 1;
                byKind.set(key, entry);
            }
            column += 1;
            if (column === stride) {
                column = 0;
                objects += 1;
            }
        }
    });

    const ranked = [...byKind.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, topN);
    const wanted = new Set(ranked.map(([key]) => Number(key.split('|')[1])));

    // Second pass: resolve only the names the ranking actually prints.
    const names = new Map<number, string>();
    let index = 0;
    let stringCarry = '';
    await streamArray('strings', (text) => {
        const parts = (stringCarry + text).split('","');
        stringCarry = parts.pop() ?? '';
        for (const part of parts) {
            if (wanted.has(index)) names.set(index, part.replace(/^"|"$/g, '').slice(0, 60));
            index += 1;
        }
    });

    console.log(`\nheap total ${mb(total)} MB across ${objects.toLocaleString()} objects\n`);
    console.log(`${'bytes'.padStart(10)}  ${'count'.padStart(11)}  kind`);
    console.log('-'.repeat(78));
    for (const [key, { bytes, count }] of ranked) {
        const [typeIndex, stringIndex] = key.split('|').map(Number);
        const label = `${types[typeIndex!] ?? '?'} ${names.get(stringIndex!) ?? ''}`.trim();
        console.log(
            `${`${mb(bytes)} MB`.padStart(10)}  ${count.toLocaleString().padStart(11)}  ${label}`
        );
    }
    console.log('\nOne dominant kind is a finding; an even spread is a working set.');
};

void main();
