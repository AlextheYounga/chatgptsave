const TARGET_URL_PATTERN = 'https://chatgpt.com/backend-api/conversation/*';
const requestEncodings = new Map();
const requestChunks = new Map();
const conversationStore = new Map();

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    const encodingHeader = (details.responseHeaders || []).find(
      header => header.name?.toLowerCase() === 'content-encoding'
    );

    if (encodingHeader?.value) {
      requestEncodings.set(details.requestId, encodingHeader.value.toLowerCase());
    }

    return {};
  },
  { urls: [TARGET_URL_PATTERN] },
  ['responseHeaders', 'extraHeaders']
);

chrome.webRequest.onBeforeRequest.addListener(
  details => {
    const filter = chrome.webRequest.filterResponseData(details.requestId);
    const chunks = [];
    requestChunks.set(details.requestId, chunks);

    filter.ondata = event => {
      const copy = event.data.slice(0);
      chunks.push(copy);
      filter.write(event.data);
    };

    filter.onstop = () => {
      filter.disconnect();
      processCapturedResponse(details.requestId, details.url, chunks).catch(error => {
        console.error('Failed to process conversation response:', error);
      });
    };

    filter.onerror = event => {
      console.error('Response filter error:', event?.error);
      cleanupRequest(details.requestId);
    };
  },
  { urls: [TARGET_URL_PATTERN], types: ['xmlhttprequest', 'fetch'] },
  ['blocking']
);

chrome.webRequest.onErrorOccurred.addListener(details => {
  cleanupRequest(details.requestId);
}, { urls: [TARGET_URL_PATTERN] });

async function processCapturedResponse(requestId, url, chunks) {
  try {
    const encoding = requestEncodings.get(requestId) || 'identity';
    const responseText = await decodeBody(chunks, encoding);

    const payload = parseJsonSafe(responseText);
    if (!payload) {
      return;
    }

    const conversationId = extractConversationId(url);
    if (!conversationId) {
      console.warn('Captured conversation without an identifiable ID.');
      return;
    }

    const enrichedPayload = attachConversationMetadata(payload, conversationId);

    await storeConversationSnapshot(conversationId, enrichedPayload);
    conversationStore.set(conversationId, enrichedPayload);
    console.info(`Stored conversation snapshot for ${conversationId}.`);
  } finally {
    cleanupRequest(requestId);
  }
}

async function decodeBody(chunks, encoding) {
  const normalized = normalizeEncoding(encoding);
  let stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new Uint8Array(chunk));
      }
      controller.close();
    }
  });

  if (normalized) {
    try {
      stream = stream.pipeThrough(new DecompressionStream(normalized));
    } catch (error) {
      console.error('Failed to create decompression stream:', error);
      throw error;
    }
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    result += decoder.decode(value, { stream: true });
  }

  result += decoder.decode();
  return result;
}

function normalizeEncoding(encoding) {
  const value = encoding?.trim().toLowerCase();
  if (!value || value === 'identity') {
    return null;
  }

  if (value === 'gzip' || value === 'x-gzip') {
    return 'gzip';
  }

  if (value === 'br') {
    return 'brotli';
  }

  if (value === 'deflate') {
    return 'deflate';
  }

  console.warn(`Unsupported content-encoding: ${encoding}`);
  return null;
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('Failed to parse conversation JSON:', error);
    return null;
  }
}

function extractConversationId(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/conversation\/([^/]+)/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Failed to extract conversation ID from URL:', error);
    return null;
  }
}

function storeConversationSnapshot(conversationId, payload) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [conversationId]: payload }, () => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(runtimeError);
        return;
      }
      resolve();
    });
  });
}

function cleanupRequest(requestId) {
  requestEncodings.delete(requestId);
  requestChunks.delete(requestId);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'CHATGPT_SAVE_DOWNLOAD_REQUEST') {
    handleDownloadRequest(message.payload)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => {
        console.error('Download request failed:', error);
        sendResponse({ ok: false, error: error?.message || String(error) });
      });
    return true;
  }

  return undefined;
});

async function handleDownloadRequest(payload) {
  const format = (payload?.format || 'json').toLowerCase();
  const conversationId = payload?.conversationId;

  const conversation = await resolveConversation(conversationId);
  if (!conversation) {
    throw new Error('Conversation data not available yet.');
  }

  const filenameBase = deriveFilenameBase(conversation);

  if (format === 'markdown') {
    const markdown = await convertConversationToMarkdown(conversation);
    await triggerDownload(`${filenameBase}.md`, markdown, 'text/markdown');
    return { format, filename: `${filenameBase}.md` };
  }

  const json = JSON.stringify(conversation, null, 2);
  await triggerDownload(`${filenameBase}.json`, json, 'application/json');
  return { format, filename: `${filenameBase}.json` };
}

async function resolveConversation(conversationId) {
  if (conversationId && conversationStore.has(conversationId)) {
    return conversationStore.get(conversationId);
  }

  const stored = await new Promise(resolve => {
    chrome.storage.local.get(null, items => {
      resolve(items || {});
    });
  });

  if (conversationId && stored[conversationId]) {
    const data = attachConversationMetadata(stored[conversationId], conversationId);
    conversationStore.set(conversationId, data);
    return data;
  }

  const keys = Object.keys(stored || {});
  if (keys.length === 0) {
    return null;
  }

  const latestKey = keys[keys.length - 1];
  const conversation = attachConversationMetadata(stored[latestKey], latestKey);
  conversationStore.set(latestKey, conversation);
  return conversation;
}

async function convertConversationToMarkdown(conversation) {
  const parser = await loadConversationParser();
  const markdown = parser.conversationToMarkdown(conversation, { role: null });
  return markdown || '';
}

function loadConversationParser() {
  if (typeof conversationParser !== 'undefined') {
    return Promise.resolve(conversationParser);
  }

  return new Promise((resolve, reject) => {
    try {
      importScripts('conversation-parser.js');
      if (typeof conversationParser === 'undefined') {
        reject(new Error('Failed to load conversation parser.'));
        return;
      }
      resolve(conversationParser);
    } catch (error) {
      reject(error);
    }
  });
}

async function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const blobUrl = URL.createObjectURL(blob);

  await new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: blobUrl,
        filename,
        saveAs: true
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

  URL.revokeObjectURL(blobUrl);
}

function slugify(value) {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'chatgpt-conversation';
}

function deriveFilenameBase(conversation) {
  if (conversation.title) {
    const slug = slugify(conversation.title);
    if (slug) {
      return slug;
    }
  }

  if (conversation.conversationId) {
    return conversation.conversationId;
  }

  if (conversation.id) {
    return conversation.id;
  }

  if (conversation.conversation_id) {
    return conversation.conversation_id;
  }

  return 'chatgpt-conversation';
}

function attachConversationMetadata(payload, conversationId) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (payload.conversationId === conversationId) {
    return payload;
  }

  return { ...payload, conversationId };
}
