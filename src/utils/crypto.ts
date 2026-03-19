/**
 * ユーティリティ: Web Crypto API を使用した AES-GCM 暗号化/復号
 */

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
}

async function getKey(secretStr: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    // 任意の長さの文字列から256bit(32byte)の固定長キーを生成するためにSHA-256でハッシュ化
    const keyMaterial = await crypto.subtle.digest('SHA-256', enc.encode(secretStr));
    return await crypto.subtle.importKey(
        'raw',
        keyMaterial,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptToken(text: string, secretStr: string): Promise<string> {
    const key = await getKey(secretStr);
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(text)
    );
    
    // IV (12bytes) と 暗号化データ を結合
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return arrayBufferToBase64(combined);
}

export async function decryptToken(encryptedBase64: string, secretStr: string): Promise<string> {
    const key = await getKey(secretStr);
    const combined = base64ToArrayBuffer(encryptedBase64);
    
    // 先頭12bytesをIVとして切り出し
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
    );
    
    const dec = new TextDecoder();
    return dec.decode(decrypted);
}
