importScripts('turndown.js');

/**
 * Utilities for converting ChatGPT conversation payloads into Markdown.
 * The payload structure mirrors responses from the ChatGPT conversation API.
 */
function conversationToMarkdown(payload, roles = ['user', 'assistant']) {
	const mapping = payload?.mapping;
	if (!mapping || typeof mapping !== 'object') {
		return '';
	}

	const messages = extractMessages(mapping, roles);
	const title = extractTitle(payload);
	return renderMarkdown(messages, title);
}

function extractMessages(mapping, roles) {
	var turndownService = new TurndownService()
	const collected = [];

	for (const node of Object.values(mapping)) {
		const message = node?.message;
		if (!message) continue;

		const messageId = message?.id ?? null;
		if (!messageId) continue;

		const role = message?.author?.role;
		if (!role || !Array(roles).includes(role)) continue;

		const articleElement = document.querySelector(`article[data-turn-id="${messageId}"]`);
		if (!articleElement) continue;

		const htmlContent = articleElement.innerHTML;
		const markdownContent = turndownService.turndown(htmlContent);
		if (!markdownContent) continue;

		collected.push({
			role,
			content: markdownContent,
			time: formatTimestamp(message?.create_time),
			id: message?.id ?? null,
			status: message?.status ?? null
		});
	}

	return collected;
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
		lines.push(`# ${title}\n\n\n`);
	}

	for (const message of messages) {
		const block = [];
		block.push(`> ${capitalize(message.role)} – ${message.time}`);
		block.push(message.content);
		lines.push(block.join('\n'));
	}

	return lines.join('\n\n');
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
		extractMessages,
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
