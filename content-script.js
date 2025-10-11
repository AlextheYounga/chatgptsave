const DOWNLOAD_BUTTON_ID = 'chatgpt-save-download-button';
const STYLE_ELEMENT_ID = 'chatgpt-save-style';
const SHARE_BUTTON_SELECTOR = 'button[data-testid="share-chat-button"]';
const DROPDOWN_ID = 'chatgpt-save-download-dropdown';

let activeDropdown = null;
let activeAnchor = null;
let detachDocumentHandlers = null;

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

function handleDownloadSelection(option) {
  chrome.runtime.sendMessage({
    type: 'CHATGPT_SAVE_DOWNLOAD_REQUEST',
    payload: {
      format: option
    }
  });
}
