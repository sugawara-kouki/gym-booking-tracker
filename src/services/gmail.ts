import { z } from 'zod';

/**
 * Gmail APIのメッセージ（概要）を定義するスキーマ
 */
const GmailMessageSchema = z.object({
    id: z.string(),
    threadId: z.string(),
});

/**
 * Gmail APIのメッセージ一覧レスポンス（messages.list）を定義するスキーマ
 */
const GmailMessageListResponseSchema = z.object({
    messages: z.array(GmailMessageSchema).optional(),
    nextPageToken: z.string().optional(),
    resultSizeEstimate: z.number().optional(),
});

/**
 * Gmail APIのメッセージ詳細（messages.get）を定義するスキーマ
 * 本文のパースに必要な最小限の構造を定義
 */
const GmailDetailsSchema = z.object({
    id: z.string(),
    snippet: z.string(),
    payload: z.object({
        // Gmailのメール本文はパーツに分かれている場合（multipart）と
        // 直接bodyに含まれる場合があるため、両方に対応
        parts: z.array(z.object({
            mimeType: z.string(),
            body: z.object({
                data: z.string().optional(),
            }).optional(),
        })).optional(),
        body: z.object({
            data: z.string().optional(),
        }).optional(),
    }).optional(),
});

export type GmailMessage = z.infer<typeof GmailMessageSchema>;

/**
 * Gmail APIへのアクセスを提供するサービス
 * 
 * @see https://developers.google.com/gmail/api/reference/rest
 */
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
     * OAuth2 リフレッシュトークンを使用してアクセストークンを更新する
     * 
     * @returns 新しいアクセストークン
     * @throws トークンの更新に失敗した場合
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

        const data = await response.json();
        const result = z.object({ access_token: z.string() }).parse(data);
        return result.access_token;
    }

    /**
     * 条件に一致するメッセージの一覧を取得する
     * 
     * @param maxResults 最大取得件数
     * @param query 検索クエリ (Gmailの検索窓と同じ形式、例: "subject:Important")
     * @returns メッセージ概要の配列
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

        const data = await response.json();
        const parsed = GmailMessageListResponseSchema.parse(data);
        return parsed.messages || [];
    }

    /**
     * メッセージの詳細情報を取得し、本文を解析する
     * 
     * Gmail APIのレスポンスから、プレーンテキスト形式の本文を優先的に抽出して返します。
     * 
     * @param messageId メッセージID
     * @returns ID、スニペット、および（存在すれば）デコード済みの本文
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

        const json = await response.json();
        const data = GmailDetailsSchema.parse(json);

        /**
         * APIから返されるBase64Url形式の文字列をデコードする
         * 標準的なatobがデコードできない文字（-や_）を置換してから処理
         */
        const decodeBase64 = (base64Url: string) => {
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const binString = atob(base64);
            const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
            return new TextDecoder().decode(bytes);
        };

        let body = data.snippet;
        if (data.payload && data.payload.parts) {
            // マルチパート形式の場合、解析のしやすさから 'text/plain' のパーツを優先的に探す
            const part = data.payload.parts.find((p) => p.mimeType === 'text/plain');
            if (part && part.body && part.body.data) {
                body = decodeBase64(part.body.data);
            }
        } else if (data.payload && data.payload.body && data.payload.body.data) {
            // シングルパートの場合
            body = decodeBase64(data.payload.body.data);
        }

        return {
            id: data.id,
            snippet: data.snippet,
            body: body
        };
    }
}
