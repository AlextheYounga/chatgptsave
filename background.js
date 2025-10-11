const TARGET_URL_PATTERN = 'https://chatgpt.com/backend-api/conversation/*';
const requestEncodings = new Map();
const requestChunks = new Map();

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

    await storeConversationSnapshot(conversationId, payload);
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
