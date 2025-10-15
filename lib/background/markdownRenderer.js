export default class MarkdownRenderer {
	constructor(payload, markdownMessages, roles = ['user', 'assistant', 'system']) {
		this.payload = payload;
		this.markdownMessages = markdownMessages;
		this.roles = roles; // For a future feature
	}

	compile() {
		const mapping = this.payload?.mapping;
		if (!mapping || typeof mapping !== 'object') return '';
		if (!this.markdownMessages || typeof this.markdownMessages !== 'object') return '';
		const title = this.extractTitle(this.payload);
		const mappedMessages = this.mapMessages(mapping);
		return this.renderMarkdown(mappedMessages, title);
	}

	extractTitle(payload) {
		const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
		return title;
	}

	mapMessages(mapping) {
		const mapped = [];

		for (const node of Object.values(mapping)) {
			const message = node?.message;
			if (!message) continue;

			const messageId = message?.id ?? null;
			if (!messageId) continue;

			const markdownContent = this.markdownMessages[messageId];
			if (!markdownContent) continue;

			mapped.push({
				content: markdownContent,
				time: this.formatTimestamp(message?.create_time),
				id: message?.id ?? null,
				status: message?.status ?? null
			});
		}

		return mapped;
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
			lines.push(`# ${title}\n\n\n`);
		}

		for (const message of messages) {
			const block = [];
			block.push(`> ${this.capitalize(message.role)} – ${message.time}`);
			block.push(message.content);
			lines.push(block.join('\n'));
		}

		return lines.join('\n\n');
	}
}

module.exports = MarkdownRenderer;
