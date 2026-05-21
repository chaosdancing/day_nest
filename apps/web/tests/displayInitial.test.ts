import assert from 'node:assert/strict';
import { displayInitial } from '../src/lib/displayInitial.ts';

// ASCII names: pick first letter and uppercase it.
assert.equal(displayInitial('mom'), 'M');
assert.equal(displayInitial('Jane'), 'J');

// Extended Latin: still uppercased (covered by the regex).
assert.equal(displayInitial('ñoño'), 'Ñ');

// CJK: take the first character verbatim, no uppercasing.
assert.equal(displayInitial('妈妈'), '妈');
assert.equal(displayInitial('简爱'), '简');

// Single-codepoint emoji must stay intact — `.slice(0,1)` on a UTF-16
// string would return a broken surrogate half here.
assert.equal(displayInitial('🦊 Mom'), '🦊');

// ZWJ family emoji: when Intl.Segmenter is available we get the whole
// 👨‍👩‍👧 cluster; otherwise we fall back to the first codepoint (👨).
// Either outcome must be a non-broken glyph (not a surrogate half).
const fam = displayInitial('👨‍👩‍👧');
assert.ok(fam === '👨‍👩‍👧' || fam === '👨', `unexpected family fallback: ${JSON.stringify(fam)}`);

// Whitespace trim before picking.
assert.equal(displayInitial('   hello'), 'H');
assert.equal(displayInitial('\n你好'), '你');

// Falls back to the next candidate (username) when display name is
// empty/whitespace, then to '·' if everything is empty.
assert.equal(displayInitial('', 'jane'), 'J');
assert.equal(displayInitial(null, undefined, ''), '·');

console.log('displayInitial: OK');
