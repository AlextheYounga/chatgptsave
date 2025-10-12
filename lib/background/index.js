import MarkdownRenderer from './markdownRenderer';

const MESSAGE_TYPES = Object.freeze({
	download: 'CHATGPT_SAVE_DOWNLOAD_REQUEST'
});

class ConversationDownloadService {
	handleMessage(message, sender, sendResponse) {
		if (!this.isPlainObject(message)) {
			return undefined;
		}

		if (message.type === MESSAGE_TYPES.download) {
			this.processDownload(message.payload)
				.then(result => sendResponse({ ok: true, ...result }))
				.catch(error => {
					console.error('ChatGPT Save: download request failed.', error);
					sendResponse({ ok: false, error: error?.message || String(error) });
				});
			return true;
		}

		return undefined;
	}

	async processDownload(payload) {
		const format = this.normalizeFormat(payload?.format);
		const openAIResponse = this.requireConversation(payload?.openAIResponse);
		const filenameBase = this.deriveFilenameBase(openAIResponse);

		if (format === 'markdown') {
			const markdownMessages = payload?.markdownMessages || {};
			const markdownRenderer = new MarkdownRenderer(openAIResponse, markdownMessages);
			const markdown = markdownRenderer.compile() || '';
			const filename = `${filenameBase}.md`;
			await this.triggerDownload(filename, markdown, 'text/markdown');
			return { format, filename };
		}

		const json = JSON.stringify(openAIResponse, null, 2);
		const filename = `${filenameBase}.json`;
		await this.triggerDownload(filename, json, 'application/json');
		return { format: 'json', filename };
	}

	normalizeFormat(value) {
		if (typeof value !== 'string') {
			return 'json';
		}

		return value.toLowerCase() === 'markdown' ? 'markdown' : 'json';
	}

	requireConversation(openAIResponse) {
		if (!this.isPlainObject(openAIResponse)) {
			throw new Error('openAI response payload missing or invalid.');
		}
		return openAIResponse;
	}

	async triggerDownload(filename, content, mimeType) {
		const dataUrl = await this.encodeDataUrl(content, mimeType);

		await new Promise((resolve, reject) => {
			chrome.downloads.download(
				{
					url: dataUrl,
					filename,
					saveAs: false
				},
				downloadId => {
					if (chrome.runtime.lastError || typeof downloadId === 'undefined') {
						reject(new Error(chrome.runtime.lastError?.message || 'Download failed.'));
						return;
					}
					resolve(downloadId);
				}
			);
		});
	}

	async encodeDataUrl(content, mimeType) {
		const blob = content instanceof Blob ? content : new Blob([content], { type: `${mimeType};charset=utf-8` });
		const buffer = await blob.arrayBuffer();
		const bytes = new Uint8Array(buffer);
		let binary = '';
		const chunkSize = 0x8000;

		for (let offset = 0; offset < bytes.length; offset += chunkSize) {
			const chunk = bytes.subarray(offset, offset + chunkSize);
			binary += String.fromCharCode.apply(null, chunk);
		}

		const base64 = btoa(binary);
		return `data:${mimeType};base64,${base64}`;
	}

	deriveFilenameBase(openAIResponse) {
		const candidates = [openAIResponse.title, openAIResponse.id, openAIResponse.conversation_id];

		for (const candidate of candidates) {
			const slug = this.slugify(candidate);
			if (slug) {
				return slug;
			}
		}

		return 'chatgpt-conversation';
	}

	slugify(value) {
		if (typeof value !== 'string') {
			return '';
		}

		return value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	isPlainObject(value) {
		return value !== null && typeof value === 'object' && !Array.isArray(value);
	}
}

const downloadService = new ConversationDownloadService();
chrome.runtime.onMessage.addListener((...args) => downloadService.handleMessage(...args));
