import TurndownService from 'turndown';

const ARTICLES_SELECTOR = '#thread article';

export default class ChatMarkdownParser {
	constructor() {
		this.turndown = new TurndownService({
			bulletListMarker: '-',
			codeBlockStyle: 'fenced',
		});
	}

	parse() {
		const messages = {};

		const articles = document.querySelectorAll(ARTICLES_SELECTOR);
		if (!articles || articles.length === 0) return '';

		for (const article of articles) {
			const messageId = article.getAttribute('data-turn-id');
			if (!messageId) continue;
			const htmlContent = article.innerHTML;
			const normalizedHtml = this.normalizePreCode(htmlContent);
			const markdownContent = this.turndown.turndown(normalizedHtml);
			if (!markdownContent) continue;
			messages[messageId] = markdownContent;
		}

		return messages;
	}

	normalizePreCode(html) {
		const container = document.createElement('div');
		container.innerHTML = html;
		
		container.querySelectorAll('pre').forEach(pre => {
			const codes = pre.querySelectorAll('code');
			if (!codes.length) return; // nothing to fix

			const code = codes[0];

			// Hoist <code> to be a direct child of <pre>
			if (code.parentElement !== pre) {
				pre.insertBefore(code, pre.firstChild);
			}

			// Strict mode: remove everything else inside <pre>
			Array.from(pre.childNodes).forEach(n => {
				if (n !== code) n.remove();
			});

			// Preserve language hint if it’s on either node (e.g., Prism/HLJS)
			const langFrom =
				(code.className.match(/(^|\s)(language-[^\s]+)/)?.[2]) ||
				(pre.className?.match(/(^|\s)(language-[^\s]+)/)?.[2]);
			if (langFrom && !code.className.includes(langFrom)) {
				code.classList.add(langFrom);
			}
		});

		return container.innerHTML;
	}
}
