import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePolicyMarkdown, serializePolicyMarkdown } from '../../../public/assets/js/features/policy-markdown.js';

describe('policy markdown', () => {
  it('round-trips sections, paragraphs, and lists', () => {
    const source = `## Purpose
These policies guide guests.

## Business Hours

- Monday to Friday: 8:00 AM – 4:30 PM
- Saturday: Closed

## Contact
Merlyn Ramos
guestservices@apts.edu`;

    const sections = parsePolicyMarkdown(source);
    assert.equal(sections.length, 3);
    assert.equal(sections[0].title, 'Purpose');
    assert.equal(sections[1].blocks[0].type, 'list');
    assert.equal(sections[1].blocks[0].items.length, 2);

    const serialized = serializePolicyMarkdown(sections);
    const again = parsePolicyMarkdown(serialized);
    assert.deepEqual(again, sections);
  });
});
