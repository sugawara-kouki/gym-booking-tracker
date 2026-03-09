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
     * メッセージ一覧を取得する
     */
    async listMessages(maxResults: number = 10): Promise<GmailMessageListResponse> {
        const accessToken = await this.getAccessToken();

        const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
        url.searchParams.set('maxResults', maxResults.toString());
        // 必要に応じて、ここで「体育館」関連のキーワードで検索フィルタを入れることも可能
        // url.searchParams.set('q', '体育館');

        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to fetch messages: ${error}`);
        }

        return await response.json() as GmailMessageListResponse;
    }
}
