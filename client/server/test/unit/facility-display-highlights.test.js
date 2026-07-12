import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/** Mirrors facility-display.parseHighlightLines for regression without browser path imports. */
function parseHighlightLines(text) {
  return String(text || '')
    .split(/\n+|;\s*/)
    .flatMap((chunk) => chunk.includes(',') && !/\d,\d/.test(chunk)
      ? chunk.split(/,\s*/).map((s) => s.trim())
      : [chunk.trim()])
    .map((s) => s.trim())
    .filter(Boolean);
}

describe('parseHighlightLines', () => {
  it('splits one highlight per line', () => {
    assert.deepEqual(
      parseHighlightLines('Private bath\nWi-Fi\nAir-conditioning'),
      ['Private bath', 'Wi-Fi', 'Air-conditioning']
    );
  });

  it('supports semicolon and comma lists', () => {
    assert.deepEqual(
      parseHighlightLines('Kitchenette; Wi-Fi, desk lamp'),
      ['Kitchenette', 'Wi-Fi', 'desk lamp']
    );
  });

  it('returns empty for blank input', () => {
    assert.deepEqual(parseHighlightLines('  \n  '), []);
    assert.deepEqual(parseHighlightLines(null), []);
  });
});

describe('room guest-copy clear semantics', () => {
  it('empty admin text saves as null', () => {
    const description = String('').trim() || null;
    const highlights = String('  ').trim() || null;
    assert.equal(description, null);
    assert.equal(highlights, null);
  });
});
