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
        headers: z.array(z.object({
            name: z.string(),
            value: z.string(),
        })).optional(),
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
    threadId: z.string(),
});

export type GmailMessage = z.infer<typeof GmailMessageSchema>;

/**
 * Gmail APIから取得したメッセージ詳細の基本情報
 */
export interface GmailMessageInfo {
    id: string;
    threadId: string;
    subject: string;
    snippet: string;
    body: string;
}

/**
 * Gmail APIへのアクセスを提供するサービス
 * 
 * OAuth2認証を使用してメッセージの取得や詳細の解析を行います。
 * @see https://developers.google.com/gmail/api/reference/rest
 */
export class GmailService {
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly refreshToken: string;
    private accessToken: string | null;
    private expiresAt: number | null;
    private onTokenRefresh?: (accessToken: string, expiresAt: number) => Promise<void>;

    constructor(
        env: { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; GOOGLE_REFRESH_TOKEN: string },
        cache?: { accessToken: string | null; expiresAt: number | null; onTokenRefresh: (accessToken: string, expiresAt: number) => Promise<void> }
    ) {
        this.clientId = env.GOOGLE_CLIENT_ID;
        this.clientSecret = env.GOOGLE_CLIENT_SECRET;
        this.refreshToken = env.GOOGLE_REFRESH_TOKEN;
        this.accessToken = cache?.accessToken || null;
        this.expiresAt = cache?.expiresAt || null;
        this.onTokenRefresh = cache?.onTokenRefresh;
    }

    /**
     * OAuth2 リフレッシュトークンを使用してアクセストークンを更新する
     */
    private async getAccessToken(): Promise<string> {
        // キャッシュされたトークンがあり、まだ有効であればそれを返す (5分のバッファを持たせる)
        const now = Math.floor(Date.now() / 1000);
        if (this.accessToken && this.expiresAt && this.expiresAt > now + 300) {
            return this.accessToken;
        }

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
            throw new Error(`Failed to refresh access token: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const { access_token, expires_in } = z.object({ 
            access_token: z.string(),
            expires_in: z.number()
        }).parse(data);
        
        const newExpiresAt = Math.floor(Date.now() / 1000) + expires_in;
        this.accessToken = access_token;
        this.expiresAt = newExpiresAt;

        // コールバックがあれば新しく取得したトークンを永続化（DB保存など）する
        if (this.onTokenRefresh) {
            await this.onTokenRefresh(access_token, newExpiresAt);
        }

        return access_token;
    }

    /**
     * 条件に一致するメッセージの一覧を取得する
     * 
     * @param maxResults 1ページあたりの取得件数
     * @param query 検索クエリ
     * @param pageToken ページング用トークン
     */
    async listMessages(maxResults: number = 10, query: string = '', pageToken?: string): Promise<{ messages: GmailMessage[]; nextPageToken?: string }> {
        const accessToken = await this.getAccessToken();
        const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');

        url.searchParams.set('maxResults', maxResults.toString());
        if (query) url.searchParams.set('q', query);
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        const response = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to fetch messages: ${error}`);
        }

        const data = await response.json();
        const parsed = GmailMessageListResponseSchema.parse(data);

        return {
            messages: parsed.messages || [],
            nextPageToken: parsed.nextPageToken
        };
    }

    /**
     * メッセージの詳細情報を取得し、本文と件名を抽出する
     * 
     * @param messageId メッセージID
     */
    async getMessage(messageId: string): Promise<GmailMessageInfo> {
        const accessToken = await this.getAccessToken();
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`;

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to fetch message ${messageId}: ${error}`);
        }

        const json = await response.json();
        const data = GmailDetailsSchema.parse(json);

        // 本文の抽出（プレーンテキストを優先）
        const body = this.extractBody(data);

        // ヘッダーから件名を抽出
        const headers = data.payload?.headers || [];
        const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '(No Subject)';

        return {
            id: data.id,
            threadId: data.threadId,
            subject,
            snippet: data.snippet,
            body
        };
    }

    /**
     * Gmailペイロードから本文をデコードして抽出する
     */
    private extractBody(data: z.infer<typeof GmailDetailsSchema>): string {
        const { payload, snippet } = data;
        if (!payload) return snippet;

        // マルチパートの場合 'text/plain' を探す
        if (payload.parts) {
            const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
            if (textPart?.body?.data) {
                return this.decodeBase64Url(textPart.body.data);
            }
        }

        // シングルパートの場合
        if (payload.body?.data) {
            return this.decodeBase64Url(payload.body.data);
        }

        return snippet;
    }

    /**
     * Gmail API固有の Base64Url 形式を文字列にデコードする
     */
    private decodeBase64Url(base64Url: string): string {
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const binString = atob(base64);
        const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
        return new TextDecoder().decode(bytes);
    }
}
