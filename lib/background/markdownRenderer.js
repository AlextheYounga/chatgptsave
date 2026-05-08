export default class MarkdownRenderer {
	constructor(payload, roles = ['user', 'assistant']) {
		this.payload = payload;
		this.roles = new Set(roles);
	}

	compile() {
		const mapping = this.payload?.mapping;
		if (!mapping || typeof mapping !== 'object') return '';
		const title = this.extractTitle(this.payload);
		const mappedMessages = this.mapMessages(mapping);
		return this.renderMarkdown(mappedMessages, title);
	}

	extractTitle(payload) {
		const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
		return title;
	}

	mapMessages(mapping) {
		const orderedNodes = this.getConversationPath(mapping);
		const mapped = [];

		for (const node of orderedNodes) {
			const message = node?.message;
			if (!message) continue;
			if (!this.shouldIncludeMessage(message)) continue;

			const content = this.renderMessageContent(message?.content);
			if (!content) continue;

			mapped.push({
				id: message?.id ?? null,
				role: message?.author?.role,
				time: this.formatTimestamp(message?.create_time),
				content
			});
		}

		return mapped;
	}

	getConversationPath(mapping) {
		const currentNode = this.payload?.current_node;
		if (!currentNode || !mapping[currentNode]) {
			return this.fallbackNodes(mapping);
		}

		const path = [];
		const visited = new Set();
		let cursor = currentNode;

		while (cursor && mapping[cursor] && !visited.has(cursor)) {
			visited.add(cursor);
			path.push(mapping[cursor]);
			cursor = mapping[cursor]?.parent || null;
		}

		return path.reverse();
	}

	fallbackNodes(mapping) {
		const nodes = Object.values(mapping);
		return nodes.sort((a, b) => {
			const timeA = a?.message?.create_time;
			const timeB = b?.message?.create_time;

			if (typeof timeA !== 'number' && typeof timeB !== 'number') return 0;
			if (typeof timeA !== 'number') return 1;
			if (typeof timeB !== 'number') return -1;
			return timeA - timeB;
		});
	}

	shouldIncludeMessage(message) {
		const role = message?.author?.role;
		if (!this.roles.has(role)) {
			return false;
		}

		if (message?.metadata?.is_visually_hidden_from_conversation) {
			return false;
		}

		const contentType = message?.content?.content_type;
		return contentType === 'text' || contentType === 'code';
	}

	renderMessageContent(content) {
		if (!content || typeof content !== 'object') {
			return '';
		}

		const contentType = content.content_type;
		if (contentType === 'text') {
			return this.renderTextContent(content.parts);
		}

		if (contentType === 'code') {
			return this.renderCodeContent(content.language, content.text);
		}

		return '';
	}

	renderTextContent(parts) {
		if (!Array.isArray(parts)) {
			return '';
		}

		const textParts = parts
			.filter(part => typeof part === 'string')
			.map(part => part.trim())
			.filter(Boolean);

		return textParts.join('\n\n');
	}

	renderCodeContent(language, text) {
		if (typeof text !== 'string' || !text.trim()) {
			return '';
		}

		const fencedLanguage = typeof language === 'string' ? language.trim() : '';
		return `\`\`\`${fencedLanguage}\n${text.trim()}\n\`\`\``;
	}

	formatTimestamp(epochSeconds) {
		if (typeof epochSeconds !== 'number' || Number.isNaN(epochSeconds)) {
			return 'unknown';
		}

		const date = new Date(epochSeconds * 1000);
		if (Number.isNaN(date.getTime())) {
			return 'unknown';
		}

		return date.toISOString().replace('T', ' ').replace('Z', ' UTC');
	}

	capitalize(value) {
		if (!value) return '';
		return value.charAt(0).toUpperCase() + value.slice(1);
	}

	renderMarkdown(messages, title) {
		const lines = [];

		if (title) {
			lines.push(`# ${title}`);
		}

		for (const message of messages) {
			const block = [];
			block.push(`## ${this.capitalize(message.role)}`);
			if (message.time !== 'unknown') {
				block.push(`> ${message.time}`);
			}
			block.push(message.content);
			lines.push(block.join('\n'));
		}

		return lines.join('\n\n');
	}
}

module.exports = MarkdownRenderer;
