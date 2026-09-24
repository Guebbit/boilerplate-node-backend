/**
 * A syntactically valid ObjectId no fixture ever seeds — the "not found" case for a
 * `findById`/`removeById`/route-param lookup, without asserting on a REAL document's absence
 * (which a sibling test creating one nearby could accidentally start colliding with). All `f`s
 * reads as obviously fake at a glance, unlike a hex string that could pass for a real example id.
 */
export const MISSING_ID = 'f'.repeat(24);
