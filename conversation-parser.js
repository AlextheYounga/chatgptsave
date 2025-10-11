/**
 * Utilities for converting ChatGPT conversation payloads into Markdown.
 * The payload structure mirrors responses from the ChatGPT conversation API.
 */
const ROLE_USER = 'user';
const ROLE_ASSISTANT = 'assistant';

/**
 * Convert a conversation payload mapping into Markdown transcript text.
 *
 * @param {object} payload - Full conversation payload from the ChatGPT API.
 * @param {object} [options]
 * @param {('user'|'assistant')} [options.role] - Restrict transcript to a single role.
 * @returns {string} Markdown text representing the selected messages.
 */
function conversationToMarkdown(payload, options = {}) {
  const mapping = payload?.mapping;
  if (!mapping || typeof mapping !== 'object') {
    return '';
  }

  const roles = buildRoleFilter(options.role);
  const messages = extractMessages(mapping, roles);
  const title = extractTitle(payload);
  return renderMarkdown(messages, title);
}

function buildRoleFilter(role) {
  if (!role) {
    return new Set([ROLE_USER, ROLE_ASSISTANT]);
  }

  const normalized = String(role).toLowerCase();
  if (normalized === ROLE_USER || normalized === ROLE_ASSISTANT) {
    return new Set([normalized]);
  }

  console.warn(`Unsupported role filter "${role}", defaulting to both roles.`);
  return new Set([ROLE_USER, ROLE_ASSISTANT]);
}

function extractMessages(mapping, roles) {
  const collected = [];

  for (const node of Object.values(mapping)) {
    const message = node?.message;
    if (!message) {
      continue;
    }

    const role = message?.author?.role;
    if (!role || !roles.has(role)) {
      continue;
    }

    const content = aggregateContent(message?.content);
    if (!content) {
      continue;
    }

    collected.push({
      role,
      content,
      time: formatTimestamp(message?.create_time),
      id: message?.id ?? null,
      status: message?.status ?? null
    });
  }

  collected.sort((a, b) => {
    const aUnknown = a.time === 'unknown';
    const bUnknown = b.time === 'unknown';
    if (aUnknown && !bUnknown) return 1;
    if (!aUnknown && bUnknown) return -1;
    if (aUnknown && bUnknown) return 0;
    return a.time.localeCompare(b.time);
  });

  return collected;
}

function aggregateContent(content) {
  const parts = content?.parts;
  if (!Array.isArray(parts)) {
    return '';
  }

  const lines = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      lines.push(part);
    } else if (part && typeof part === 'object') {
      const text = typeof part.text === 'string' ? part.text : '';
      if (text) {
        lines.push(text);
      }
    }
  }

  return lines.join('\n').trim();
}

function formatTimestamp(epochSeconds) {
  if (typeof epochSeconds !== 'number' || Number.isNaN(epochSeconds)) {
    return 'unknown';
  }

  const date = new Date(epochSeconds * 1000);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  return date.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function extractTitle(payload) {
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  return title;
}

function renderMarkdown(messages, title) {
  const lines = [];

  if (title) {
    lines.push(`# ${title}`);
    lines.push('');
  }

  for (const message of messages) {
    lines.push(`### ${capitalize(message.role)} – ${message.time}`);
    lines.push('');
    lines.push(message.content);
    lines.push('');
  }

  return lines.join('\n');
}

function capitalize(value) {
  if (!value) {
    return '';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const conversationParser = {
  conversationToMarkdown,
  _private: {
    buildRoleFilter,
    extractMessages,
    aggregateContent,
    formatTimestamp,
    extractTitle,
    renderMarkdown
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = conversationParser;
} else if (typeof self !== 'undefined') {
  self.chatgptConversationParser = conversationParser;
}
