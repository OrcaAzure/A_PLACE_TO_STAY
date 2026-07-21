import { getPolicies } from '/assets/js/services/api.js';

function appendParagraph(section, lines) {
  if (!lines.length) return;
  const paragraph = document.createElement('p');
  lines.forEach((line, index) => {
    if (index) paragraph.appendChild(document.createElement('br'));
    paragraph.appendChild(document.createTextNode(line));
  });
  section.appendChild(paragraph);
}

function renderPolicyDocument(mount, source) {
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

function bindPolicyTabs() {
  const tabs = [...document.querySelectorAll('[data-policy-tab]')];
  const panels = [...document.querySelectorAll('[data-policy-panel]')];
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const selected = tab.dataset.policyTab;
      tabs.forEach((candidate) => {
        candidate.setAttribute('aria-selected', String(candidate === tab));
      });
      panels.forEach((panel) => {
        panel.classList.toggle('hidden', panel.dataset.policyPanel !== selected);
      });
    });
  });
}

async function loadPolicies() {
  bindPolicyTabs();
  const error = document.getElementById('policies-error');
  try {
    const policies = await getPolicies();
    renderPolicyDocument(document.getElementById('rooms-policies'), policies.rooms);
    renderPolicyDocument(document.getElementById('venues-policies'), policies.venues);
    const updated = document.getElementById('policies-updated');
    if (updated) {
      updated.textContent = policies.updated_at
        ? `Last updated: ${new Date(policies.updated_at).toLocaleDateString('en-PH', {
          month: 'long', day: 'numeric', year: 'numeric',
        })}`
        : 'Current published version';
    }
  } catch (err) {
    if (error) {
      error.textContent = err.message || 'Policies could not be loaded. Please try again.';
      error.classList.remove('hidden');
    }
  }
}

loadPolicies();
