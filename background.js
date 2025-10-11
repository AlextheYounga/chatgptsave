importScripts('conversation-parser.js');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return undefined;
  }

  if (message.type === 'CHATGPT_SAVE_DOWNLOAD_REQUEST') {
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
  const conversation = payload?.conversation;

  if (!conversation || typeof conversation !== 'object') {
    throw new Error('Missing conversation payload.');
  }

  const filenameBase = deriveFilenameBase(conversation);

  if (format === 'markdown') {
    const markdown = await convertConversationToMarkdown(conversation);
    const filename = `${filenameBase}.md`;
    await triggerDownload(filename, markdown, 'text/markdown');
    return { format: 'markdown', filename };
  }

  const json = JSON.stringify(conversation, null, 2);
  const filename = `${filenameBase}.json`;
  await triggerDownload(filename, json, 'application/json');
  return { format: 'json', filename };
}

async function convertConversationToMarkdown(conversation) {
  if (typeof conversationParser === 'undefined') {
    throw new Error('Markdown parser unavailable.');
  }

  const markdown = conversationParser.conversationToMarkdown(conversation, { role: null });
  return markdown || '';
}

async function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const dataUrl = await blobToDataUrl(blob);

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

async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }

  const base64 = btoa(binary);
  return `data:${blob.type};base64,${base64}`;
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

  if (conversation.id) {
    const slug = slugify(conversation.id);
    if (slug) {
      return slug;
    }
  }

  if (conversation.conversation_id) {
    const slug = slugify(conversation.conversation_id);
    if (slug) {
      return slug;
    }
  }

  return 'chatgpt-conversation';
}
