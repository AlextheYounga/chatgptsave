import ApiHandler from './apiHandler';
import ChatMarkdownParser from './chatMarkdownParser';
import DownloadUI from './downloadUi';

const DOWNLOAD_FORMATS = Object.freeze({
	json: 'json',
	markdown: 'markdown'
});


class BackgroundBridge {
	static MESSAGE_TYPE = 'CHATGPT_SAVE_DOWNLOAD_REQUEST';

	requestDownload(payload) {
		return new Promise((resolve, reject) => {
			chrome.runtime.sendMessage(
				{
					type: BackgroundBridge.MESSAGE_TYPE,
					payload: payload
				},
				response => {
					const runtimeError = chrome.runtime.lastError;
					if (runtimeError) {
						reject(new Error(runtimeError.message));
						return;
					}

					if (!response?.ok) {
						reject(new Error(response?.error || 'Download failed.'));
						return;
					}

					resolve(response);
				}
			);
		});
	}
}

class ChatGPTSaveApp {
	constructor() {
		this.apiHandler = new ApiHandler();
		this.bridge = new BackgroundBridge();
		this.parser = new ChatMarkdownParser();

		// DownloadUI expects our available formats and a callback function.
		// We'll lose class 'this' context in this anon function, so bind it explicitly with .bind(this).
		this.ui = new DownloadUI(DOWNLOAD_FORMATS, function (format) {
			return this.handleDownload(format);
		}.bind(this));
	}

	init() {
		this.ui.init();
	}

	async handleDownload(format) {
		try {
			const openAIResponse = await this.apiHandler.fetchConversation();
			if (!openAIResponse) {
				throw new Error('Conversation payload was empty.');
			}

			const backgroundRequestPayload = { format, openAIResponse }
		
			// This is a markdown pre-processing step. It's not the full Markdown conversion.
			// We'll handle the full Markdown rendering in the background script.
			if (format === DOWNLOAD_FORMATS.markdown) {
				 const parsedMarkdownMessages = this.parser.parse();
				 backgroundRequestPayload.markdownMessages = parsedMarkdownMessages;
			}

			await this.bridge.requestDownload(backgroundRequestPayload);
		} catch (error) {
			console.warn('ChatGPT Save: failed to prepare download.', error);
		}
	}
}

new ChatGPTSaveApp().init();
