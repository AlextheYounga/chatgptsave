importScripts('conversation-parser.js');

class ConversationDownloadService {
  static MESSAGE_TYPES = Object.freeze({
    download: 'CHATGPT_SAVE_DOWNLOAD_REQUEST'
  });

  constructor(parser) {
    this.parser = parser;
  }

  handleMessage(message, sender, sendResponse) {
    if (!this.isPlainObject(message)) {
      return undefined;
    }

    if (message.type === ConversationDownloadService.MESSAGE_TYPES.download) {
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
    const conversation = this.requireConversation(payload?.conversation);
    const filenameBase = this.deriveFilenameBase(conversation);

    if (format === 'markdown') {
      const markdown = this.parser.conversationToMarkdown(conversation, { role: null }) || '';
      const filename = `${filenameBase}.md`;
      await this.triggerDownload(filename, markdown, 'text/markdown');
      return { format, filename };
    }

    const json = JSON.stringify(conversation, null, 2);
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

  requireConversation(conversation) {
    if (!this.isPlainObject(conversation)) {
      throw new Error('Conversation payload missing or invalid.');
    }
    return conversation;
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

  deriveFilenameBase(conversation) {
    const candidates = [conversation.title, conversation.id, conversation.conversation_id];

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

const downloadService = new ConversationDownloadService(conversationParser);
chrome.runtime.onMessage.addListener((...args) => downloadService.handleMessage(...args));
