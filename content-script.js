const DOWNLOAD_BUTTON_ID = 'chatgpt-save-download-button';
const STYLE_ELEMENT_ID = 'chatgpt-save-style';
const SHARE_BUTTON_SELECTOR = 'button[data-testid="share-chat-button"]';
const DROPDOWN_ID = 'chatgpt-save-download-dropdown';

let activeDropdown = null;
let activeAnchor = null;
let detachDocumentHandlers = null;
let accessTokenCache = null;
let accessTokenPromise = null;

init();

function init() {
  injectStyles();
  ensureDownloadButton();
  observeShareButton();
}

function injectStyles() {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = `
    #${DOWNLOAD_BUTTON_ID} svg {
      transform: rotate(180deg);
    }
  `;

  document.head.appendChild(style);
}

function observeShareButton() {
  const observer = new MutationObserver(() => {
    ensureDownloadButton();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function ensureDownloadButton() {
  const shareButton = document.querySelector(SHARE_BUTTON_SELECTOR);
  if (!shareButton) {
    return;
  }

  const parent = shareButton.parentElement;
  if (!parent) {
    return;
  }

  if (parent.querySelector(`#${DOWNLOAD_BUTTON_ID}`)) {
    return;
  }

  const downloadButton = cloneShareButton(shareButton);
  parent.insertBefore(downloadButton, shareButton.nextSibling);
}

function cloneShareButton(shareButton) {
  const downloadButton = shareButton.cloneNode(true);
  downloadButton.id = DOWNLOAD_BUTTON_ID;
  downloadButton.setAttribute('aria-label', 'Download');
  downloadButton.dataset.testid = 'download-chat-button';

  const labelContainer = downloadButton.querySelector('.flex');
  if (labelContainer) {
    replaceLabelText(labelContainer, 'Download');
  }

  const icon = downloadButton.querySelector('svg');
  if (icon) {
    icon.setAttribute('aria-label', 'Download icon');
  }

  downloadButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    toggleDropdown(downloadButton);
  });

  return downloadButton;
}

function replaceLabelText(container, text) {
  let replaced = false;

  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = text;
      replaced = true;
    }
  }

  if (!replaced) {
    container.appendChild(document.createTextNode(text));
  }
}

function toggleDropdown(anchor) {
  if (activeDropdown && activeAnchor === anchor) {
    closeDropdown();
    return;
  }

  openDropdown(anchor);
}

function openDropdown(anchor) {
  const dropdown = getDropdownElement();
  dropdown.hidden = false;
  dropdown.style.visibility = 'hidden';
  positionDropdown(anchor, dropdown);
  dropdown.style.visibility = '';
  dropdown.setAttribute('data-state', 'open');

  activeDropdown = dropdown;
  activeAnchor = anchor;

  if (!detachDocumentHandlers) {
    const handleDocumentClick = event => {
      if (!activeDropdown) {
        return;
      }

      if (activeAnchor?.contains(event.target) || activeDropdown.contains(event.target)) {
        return;
      }

      closeDropdown();
    };

    const handleKeydown = event => {
      if (event.key === 'Escape') {
        closeDropdown();
      }
    };

    document.addEventListener('click', handleDocumentClick, true);
    document.addEventListener('keydown', handleKeydown);

    detachDocumentHandlers = () => {
      document.removeEventListener('click', handleDocumentClick, true);
      document.removeEventListener('keydown', handleKeydown);
      detachDocumentHandlers = null;
    };
  }
}

function closeDropdown() {
  if (!activeDropdown) {
    return;
  }

  activeDropdown.hidden = true;
  activeDropdown.setAttribute('data-state', 'closed');
  activeDropdown = null;
  activeAnchor = null;

  if (detachDocumentHandlers) {
    detachDocumentHandlers();
  }
}

function getDropdownElement() {
  let dropdown = document.getElementById(DROPDOWN_ID);
  if (dropdown) {
    return dropdown;
  }

  dropdown = buildDropdownElement();
  document.body.appendChild(dropdown);
  return dropdown;
}

function buildDropdownElement() {
  const dropdown = document.createElement('div');
  dropdown.id = DROPDOWN_ID;
  dropdown.setAttribute('role', 'menu');
  dropdown.setAttribute('data-state', 'closed');
  dropdown.className = 'z-50 absolute rounded-2xl bg-token-main-surface-primary dark:bg-[#353535] shadow-long py-1.5 border border-token-border-light min-w-[180px] text-token-text-primary';
  dropdown.hidden = true;

  const container = document.createElement('div');
  container.setAttribute('role', 'group');
  container.className = 'flex flex-col gap-1';
  dropdown.appendChild(container);

  container.appendChild(createMenuItem('JSON'));
  container.appendChild(createMenuItem('Markdown'));

  return dropdown;
}

function createMenuItem(label) {
  const item = document.createElement('button');
  item.type = 'button';
  item.setAttribute('role', 'menuitem');
  item.dataset.option = label.toLowerCase();
  item.className = '__menu-item flex w-full items-center gap-1.5 px-4 py-2 text-sm text-left hover:bg-token-main-surface-secondary rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-token-border-light';
  item.textContent = label;

  item.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    closeDropdown();
    handleDownloadSelection(item.dataset.option);
  });

  return item;
}

function positionDropdown(anchor, dropdown) {
  const rect = anchor.getBoundingClientRect();
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;

  dropdown.style.top = `${rect.bottom + scrollY + 8}px`;
  dropdown.style.left = `${rect.right + scrollX - dropdown.offsetWidth}px`;
}

async function handleDownloadSelection(format) {
  try {
    const conversationId = extractConversationIdFromLocation();
    if (!conversationId) {
      throw new Error('Unable to determine conversation id from URL.');
    }

    const conversation = await fetchConversation(conversationId);
    if (!conversation || typeof conversation !== 'object') {
      throw new Error('Conversation payload was empty.');
    }

    chrome.runtime.sendMessage(
      {
        type: 'CHATGPT_SAVE_DOWNLOAD_REQUEST',
        payload: {
          format,
          conversation
        }
      },
      response => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          console.warn('ChatGPT Save: download request error.', runtimeError.message);
          return;
        }

        if (!response?.ok) {
          console.warn('ChatGPT Save: download failed.', response?.error);
        }
      }
    );
  } catch (error) {
    console.warn('ChatGPT Save: failed to prepare download.', error);
  }
}

function extractConversationIdFromLocation() {
  const url = new URL(window.location.href);

  // Typical path: /c/<conversationId>
  const segments = url.pathname.split('/').filter(Boolean);
  const conversationIndex = segments.indexOf('c');
  if (conversationIndex !== -1 && segments.length > conversationIndex + 1) {
    return segments[conversationIndex + 1];
  }

  if (segments.length >= 1) {
    const candidate = segments[segments.length - 1];
    if (isUuid(candidate)) {
      return candidate;
    }
  }

  const searchParams = url.searchParams;
  const queryConversation = searchParams.get('conversationId') || searchParams.get('conversation_id');
  if (queryConversation) {
    return queryConversation;
  }

  return null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function fetchConversation(conversationId) {
  const endpoint = `https://chatgpt.com/backend-api/conversation/${conversationId}`;
  const [accessToken, deviceId] = await Promise.all([
    getAccessToken(),
    getDeviceId()
  ]);

  if (!accessToken) {
    throw new Error('Missing access token. Please ensure you are logged in.');
  }

  const headers = new Headers({
    accept: 'application/json',
    authorization: `Bearer ${accessToken}`,
    'x-openai-assistant-app-id': 'chat.openai.com'
  });

  if (deviceId) {
    headers.set('oai-device-id', deviceId);
  }

  const response = await fetch(endpoint, {
    method: 'GET',
    credentials: 'include',
    headers
  });

  if (!response.ok) {
    throw new Error(`Conversation request failed: ${response.status}`);
  }

  return response.json();
}

async function getAccessToken() {
  if (accessTokenCache) {
    return accessTokenCache;
  }

  if (!accessTokenPromise) {
    accessTokenPromise = fetch('https://chatgpt.com/api/auth/session', {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'application/json'
      }
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Session request failed: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        const token = data?.accessToken || null;
        if (!token) {
          throw new Error('Session response missing access token.');
        }
        accessTokenCache = token;
        return token;
      })
      .catch(error => {
        accessTokenPromise = null;
        throw error;
      });
  }

  return accessTokenPromise;
}

async function getDeviceId() {
  const storageKeys = [
    'oai_device_id',
    'oai-device-id',
    'oai_deviceId',
    'oaiDeviceId'
  ];

  for (const key of storageKeys) {
    const value = window.localStorage.getItem(key);
    if (value) {
      return value;
    }
  }

  const cookieDeviceId = readCookie('oai_device_id') || readCookie('oai-device-id');
  if (cookieDeviceId) {
    return cookieDeviceId;
  }

  return null;
}

function readCookie(name) {
  const matcher = new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1')}=([^;]*)`);
  const match = document.cookie.match(matcher);
  return match ? decodeURIComponent(match[1]) : null;
}
