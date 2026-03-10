export interface GmailMessage {
    id: string;
    threadId: string;
}

export interface GmailMessageListResponse {
    messages?: GmailMessage[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
}

export class GmailService {
    private clientId: string;
    private clientSecret: string;
    private refreshToken: string;

    constructor(env: { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; GOOGLE_REFRESH_TOKEN: string }) {
        this.clientId = env.GOOGLE_CLIENT_ID;
        this.clientSecret = env.GOOGLE_CLIENT_SECRET;
        this.refreshToken = env.GOOGLE_REFRESH_TOKEN;
    }

    /**
     * リフレッシュトークンを使用してアクセストークンを取得する
     */
    private async getAccessToken(): Promise<string> {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: this.refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gmail API Error Response:', errorText);
            throw new Error(`Failed to refresh access token: ${response.status} ${errorText}`);
        }

        const data = await response.json() as { access_token: string };
        return data.access_token;
    }

    /**
     * メッセージ一覧を取得する（クエリ指定可能）
     */
    async listMessages(maxResults: number = 10, query: string = ''): Promise<GmailMessage[]> {
        const accessToken = await this.getAccessToken();

        const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
        url.searchParams.set('maxResults', maxResults.toString());
        if (query) {
            url.searchParams.set('q', query);
        }

        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to fetch messages: ${error}`);
        }

        const data = await response.json() as GmailMessageListResponse;
        return data.messages || [];
    }

    /**
     * メッセージの詳細（本文を含む）を取得する
     */
    async getMessage(messageId: string): Promise<{ id: string; snippet: string; body?: string }> {
        const accessToken = await this.getAccessToken();

        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`;
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to fetch message ${messageId}: ${error}`);
        }

        const data = await response.json() as any;

        // Base64UrlをデコードしてUTF-8文字列に変換
        const decodeBase64 = (base64Url: string) => {
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const binString = atob(base64);
            const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
            return new TextDecoder().decode(bytes);
        };

        let body = data.snippet;
        if (data.payload && data.payload.parts) {
            // text/plain の部分を探す
            const part = data.payload.parts.find((p: any) => p.mimeType === 'text/plain');
            if (part && part.body && part.body.data) {
                body = decodeBase64(part.body.data);
            }
        } else if (data.payload && data.payload.body && data.payload.body.data) {
            body = decodeBase64(data.payload.body.data);
        }

        return {
            id: data.id,
            snippet: data.snippet,
            body: body
        };
    }
}
