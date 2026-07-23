/**
 * Parse and serialize admin policy documents. Stored format uses ## headings,
 * - list items, and blank-line-separated paragraphs (same as the public page).
 */

/** @typedef {{ type: 'paragraph', text: string } | { type: 'list', items: string[] }} PolicyBlock */
/** @typedef {{ title: string, blocks: PolicyBlock[] }} PolicySection */

/** @param {string} source @returns {PolicySection[]} */
export function parsePolicyMarkdown(source) {
  /** @type {PolicySection[]} */
  const sections = [];
  /** @type {PolicySection | null} */
  let current = null;
  /** @type {string[]} */
  let paragraphLines = [];
  /** @type {string[]} */
  let listItems = [];

  const ensureSection = () => {
    if (!current) {
      current = { title: 'Untitled section', blocks: [] };
      sections.push(current);
    }
    return current;
  };

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    ensureSection().blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') });
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    ensureSection().blocks.push({ type: 'list', items: [...listItems] });
    listItems = [];
  };

  for (const rawLine of String(source || '').replace(/\r/g, '').split('\n')) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('## ')) {
      flushParagraph();
      flushList();
      current = { title: trimmed.slice(3).trim() || 'Untitled section', blocks: [] };
      sections.push(current);
      continue;
    }
    if (trimmed.startsWith('- ')) {
      flushParagraph();
      listItems.push(trimmed.slice(2).trim());
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  return sections.length ? sections : [{ title: 'Purpose', blocks: [{ type: 'paragraph', text: '' }] }];
}

/** @param {PolicySection[]} sections @returns {string} */
export function serializePolicyMarkdown(sections) {
  return (sections || [])
    .map((section) => {
      const title = String(section.title || '').trim() || 'Untitled section';
      const parts = [`## ${title}`];
      for (const block of section.blocks || []) {
        if (block.type === 'paragraph') {
          const text = String(block.text || '').trim();
          if (text) {
            parts.push('');
            parts.push(text);
          }
        } else if (block.type === 'list' && block.items?.length) {
          parts.push('');
          parts.push(...block.items.map((item) => `- ${String(item || '').trim()}`).filter((line) => line.length > 2));
        }
      }
      return parts.join('\n');
    })
    .join('\n\n')
    .trim();
}

function appendParagraph(section, lines) {
  if (!lines.length) return;
  const paragraph = document.createElement('p');
  lines.forEach((line, index) => {
    if (index) paragraph.appendChild(document.createElement('br'));
    paragraph.appendChild(document.createTextNode(line));
  });
  section.appendChild(paragraph);
}

/** Render policy markdown into a DOM mount (matches public policies page). */
export function renderPolicyDocument(mount, source) {
  if (!mount) return;
  mount.replaceChildren();
  const lines = String(source || '').replace(/\r/g, '').split('\n');
  let section = null;
  let paragraphLines = [];
  let list = null;

  const ensureSection = () => {
    if (!section) {
      section = document.createElement('section');
      mount.appendChild(section);
    }
    return section;
  };
  const flushParagraph = () => {
    appendParagraph(ensureSection(), paragraphLines);
    paragraphLines = [];
  };
  const closeList = () => { list = null; };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('## ')) {
      flushParagraph();
      closeList();
      section = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = line.slice(3).trim();
      section.appendChild(heading);
      mount.appendChild(section);
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      if (!list) {
        list = document.createElement('ul');
        ensureSection().appendChild(list);
      }
      const item = document.createElement('li');
      item.textContent = line.slice(2).trim();
      list.appendChild(item);
      continue;
    }
    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }
    closeList();
    paragraphLines.push(line);
  }
  flushParagraph();
}

/** @param {string} markdown */
export function policyCharacterCount(markdown) {
  return String(markdown || '').length;
}
