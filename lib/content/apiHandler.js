export default class AuthManager {
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

class ApiHandler {
	static CONVERSATION_ENDPOINT = id => `https://chatgpt.com/backend-api/conversation/${id}`;

	constructor() {
		this.authManager = new AuthManager();;
	}

	async fetchConversation() {
		const conversationId = this.currentConversationId();
		if (!conversationId) {
			throw new Error('Unable to determine conversation id from URL.');
		}

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

	// AI slop code for extracting conversation ID from URL.
	// Could probably just directly regex a uuid structure from the URL.
	currentConversationId() {
		const url = new URL(window.location.href);
		const segments = url.pathname.split('/').filter(Boolean);
		const deepLinkIndex = segments.indexOf('c');

		if (deepLinkIndex !== -1 && segments.length > deepLinkIndex + 1) {
			return segments[deepLinkIndex + 1];
		}

		if (segments.length) {
			const lastSegment = segments[segments.length - 1];
			if (this.isUuid(lastSegment)) {
				return lastSegment;
			}
		}

		return url.searchParams.get('conversationId') || url.searchParams.get('conversation_id');
	}

	isUuid(value) {
		return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
	}
}

