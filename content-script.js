const DOWNLOAD_FORMATS = Object.freeze({
  json: 'json',
  markdown: 'markdown'
});

class DownloadUI {
  static SHARE_BUTTON_SELECTOR = 'button[data-testid="share-chat-button"]';
  static DOWNLOAD_BUTTON_ID = 'chatgpt-save-download-button';
  static STYLE_ID = 'chatgpt-save-style';
  static DROPDOWN_ID = 'chatgpt-save-download-dropdown';

  constructor(onFormatSelected) {
    this.onFormatSelected = onFormatSelected;
    this.dropdown = null;
    this.dropdownAnchor = null;
    this.detachDropdownListeners = null;
  }

  init() {
    this.injectStyles();
    this.attachDownloadButton();
    this.observeShareButton();
  }

  injectStyles() {
    if (document.getElementById(DownloadUI.STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = DownloadUI.STYLE_ID;
    style.textContent = `
      #${DownloadUI.DOWNLOAD_BUTTON_ID} svg {
        transform: rotate(180deg);
      }
    `;

    document.head.appendChild(style);
  }

  observeShareButton() {
    const observer = new MutationObserver(() => this.attachDownloadButton());

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  attachDownloadButton() {
    const shareButton = document.querySelector(DownloadUI.SHARE_BUTTON_SELECTOR);
    if (!shareButton) {
      return;
    }

    const parent = shareButton.parentElement;
    if (!parent || parent.querySelector(`#${DownloadUI.DOWNLOAD_BUTTON_ID}`)) {
      return;
    }

    const downloadButton = this.cloneShareButton(shareButton);
    parent.insertBefore(downloadButton, shareButton.nextSibling);
  }

  cloneShareButton(referenceButton) {
    const clone = referenceButton.cloneNode(true);
    clone.id = DownloadUI.DOWNLOAD_BUTTON_ID;
    clone.setAttribute('aria-label', 'Download conversation');
    clone.dataset.testid = 'download-chat-button';

    const label = clone.querySelector('.flex');
    if (label) {
      this.replaceLabel(label, 'Download');
    }

    const icon = clone.querySelector('svg');
    if (icon) {
      icon.setAttribute('aria-label', 'Download icon');
    }

    clone.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleDropdown(clone);
    });

    return clone;
  }

  replaceLabel(container, text) {
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

  toggleDropdown(anchor) {
    if (this.dropdown && this.dropdownAnchor === anchor) {
      this.closeDropdown();
      return;
    }

    this.openDropdown(anchor);
  }

  openDropdown(anchor) {
    const dropdown = this.ensureDropdown();
    dropdown.hidden = false;
    dropdown.style.visibility = 'hidden';
    this.positionDropdown(anchor, dropdown);
    dropdown.style.visibility = '';
    dropdown.setAttribute('data-state', 'open');

    this.dropdown = dropdown;
    this.dropdownAnchor = anchor;

    if (!this.detachDropdownListeners) {
      const handleDocumentClick = event => {
        if (!this.dropdown) {
          return;
        }

        if (this.dropdownAnchor?.contains(event.target) || this.dropdown.contains(event.target)) {
          return;
        }

        this.closeDropdown();
      };

      const handleEscape = event => {
        if (event.key === 'Escape') {
          this.closeDropdown();
        }
      };

      document.addEventListener('click', handleDocumentClick, true);
      document.addEventListener('keydown', handleEscape);

      this.detachDropdownListeners = () => {
        document.removeEventListener('click', handleDocumentClick, true);
        document.removeEventListener('keydown', handleEscape);
        this.detachDropdownListeners = null;
      };
    }
  }

  closeDropdown() {
    if (!this.dropdown) {
      return;
    }

    this.dropdown.hidden = true;
    this.dropdown.setAttribute('data-state', 'closed');
    this.dropdown = null;
    this.dropdownAnchor = null;

    if (this.detachDropdownListeners) {
      this.detachDropdownListeners();
    }
  }

  ensureDropdown() {
    let dropdown = document.getElementById(DownloadUI.DROPDOWN_ID);
    if (dropdown) {
      return dropdown;
    }

    dropdown = document.createElement('div');
    dropdown.id = DownloadUI.DROPDOWN_ID;
    dropdown.setAttribute('role', 'menu');
    dropdown.setAttribute('data-state', 'closed');
    dropdown.className = 'z-50 absolute rounded-2xl bg-token-main-surface-primary dark:bg-[#353535] shadow-long py-1.5 border border-token-border-light min-w-[180px] text-token-text-primary';
    dropdown.hidden = true;

    const group = document.createElement('div');
    group.setAttribute('role', 'group');
    group.className = 'flex flex-col gap-1';

    group.appendChild(this.createDropdownItem('JSON', DOWNLOAD_FORMATS.json));
    group.appendChild(this.createDropdownItem('Markdown', DOWNLOAD_FORMATS.markdown));

    dropdown.appendChild(group);
    document.body.appendChild(dropdown);

    return dropdown;
  }

  createDropdownItem(label, format) {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.dataset.option = format;
    item.className = '__menu-item flex w-full items-center gap-1.5 px-4 py-2 text-sm text-left hover:bg-token-main-surface-secondary rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-token-border-light';
    item.textContent = label;

    item.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.closeDropdown();
      this.onFormatSelected(format);
    });

    return item;
  }

  positionDropdown(anchor, dropdown) {
    const rect = anchor.getBoundingClientRect();
    const offsetY = window.scrollY || document.documentElement.scrollTop || 0;
    const offsetX = window.scrollX || document.documentElement.scrollLeft || 0;

    dropdown.style.top = `${rect.bottom + offsetY + 8}px`;
    dropdown.style.left = `${rect.right + offsetX - dropdown.offsetWidth}px`;
  }
}

class ConversationLocator {
  static currentConversationId() {
    const url = new URL(window.location.href);
    const segments = url.pathname.split('/').filter(Boolean);
    const deepLinkIndex = segments.indexOf('c');

    if (deepLinkIndex !== -1 && segments.length > deepLinkIndex + 1) {
      return segments[deepLinkIndex + 1];
    }

    if (segments.length) {
      const lastSegment = segments[segments.length - 1];
      if (ConversationLocator.isUuid(lastSegment)) {
        return lastSegment;
      }
    }

    return url.searchParams.get('conversationId') || url.searchParams.get('conversation_id');
  }

  static isUuid(value) {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }
}

class AuthManager {
  static SESSION_ENDPOINT = 'https://chatgpt.com/api/auth/session';

  constructor() {
    this.accessToken = null;
    this.pendingAccessToken = null;
  }

  async getAccessToken() {
    if (this.accessToken) {
      return this.accessToken;
    }

    if (!this.pendingAccessToken) {
      this.pendingAccessToken = this.requestAccessToken()
        .then(token => {
          this.accessToken = token;
          return token;
        })
        .catch(error => {
          this.pendingAccessToken = null;
          throw error;
        });
    }

    return this.pendingAccessToken;
  }

  async requestAccessToken() {
    const response = await fetch(AuthManager.SESSION_ENDPOINT, {
      method: 'GET',
      credentials: 'include',
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Session request failed: ${response.status}`);
    }

    const data = await response.json();
    const token = data?.accessToken;
    if (!token) {
      throw new Error('Session response missing access token.');
    }

    return token;
  }

  async getDeviceId() {
    const storageKeys = ['oai_device_id', 'oai-device-id', 'oai_deviceId', 'oaiDeviceId'];

    for (const key of storageKeys) {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        return stored;
      }
    }

    return this.readCookie('oai_device_id') || this.readCookie('oai-device-id');
  }

  readCookie(name) {
    const pattern = new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1')}=([^;]*)`);
    const match = document.cookie.match(pattern);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

class ConversationClient {
  static CONVERSATION_ENDPOINT = id => `https://chatgpt.com/backend-api/conversation/${id}`;

  constructor(authManager) {
    this.authManager = authManager;
  }

  async fetchConversation(conversationId) {
    const [accessToken, deviceId] = await Promise.all([
      this.authManager.getAccessToken(),
      this.authManager.getDeviceId()
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

    const response = await fetch(ConversationClient.CONVERSATION_ENDPOINT(conversationId), {
      method: 'GET',
      credentials: 'include',
      headers
    });

    if (!response.ok) {
      throw new Error(`Conversation request failed: ${response.status}`);
    }

    return response.json();
  }
}

class BackgroundBridge {
  static MESSAGE_TYPE = 'CHATGPT_SAVE_DOWNLOAD_REQUEST';

  requestDownload(format, conversation) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: BackgroundBridge.MESSAGE_TYPE,
          payload: { format, conversation }
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
    this.authManager = new AuthManager();
    this.conversationClient = new ConversationClient(this.authManager);
    this.bridge = new BackgroundBridge();
    this.ui = new DownloadUI(format => this.handleDownload(format));
  }

  init() {
    this.ui.init();
  }

  async handleDownload(format) {
    try {
      const conversationId = ConversationLocator.currentConversationId();
      if (!conversationId) {
        throw new Error('Unable to determine conversation id from URL.');
      }

      const conversation = await this.conversationClient.fetchConversation(conversationId);
      if (!conversation) {
        throw new Error('Conversation payload was empty.');
      }

      await this.bridge.requestDownload(format, conversation);
    } catch (error) {
      console.warn('ChatGPT Save: failed to prepare download.', error);
    }
  }
}

new ChatGPTSaveApp().init();
