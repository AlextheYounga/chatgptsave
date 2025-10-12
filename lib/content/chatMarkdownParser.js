import TurndownService from 'turndown';

const ARTICLES_SELECTOR = '#thread article';

export default class ChatMarkdownParser {
	static parse() {
		const messages = {};
		const turndownService = new TurndownService();
		const articles = document.querySelectorAll(ARTICLES_SELECTOR);
		if (!articles || articles.length === 0) return '';

		for (const article of articles) {
			const messageId = article.getAttribute('data-turn-id');
			if (!messageId) continue;
			const htmlContent = article.innerHTML;
			const markdownContent = turndownService.turndown(htmlContent);
			if (!markdownContent) continue;
			messages[messageId] = markdownContent;
		}

		return messages;
	}
}
