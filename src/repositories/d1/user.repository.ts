import { UserRepository, UserRow } from '../types';

export class D1UserRepository implements UserRepository {
    constructor(private db: D1Database) { }

    async findById(id: string): Promise<UserRow | null> {
        return await this.db.prepare('SELECT * FROM users WHERE id = ?')
            .bind(id)
            .first<UserRow>();
    }

    async findByProviderId(provider: string, providerUserId: string): Promise<UserRow | null> {
        return await this.db.prepare('SELECT * FROM users WHERE provider = ? AND provider_user_id = ?')
            .bind(provider, providerUserId)
            .first<UserRow>();
    }

    async upsert(user: Omit<UserRow, 'created_at' | 'updated_at'>): Promise<void> {
        await this.db.prepare(`
            INSERT INTO users (
                id, provider, provider_user_id, email, name, 
                refresh_token_encrypted, access_token_encrypted, access_token_expires_at, 
                created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, unixepoch(), unixepoch())
            ON CONFLICT(provider, provider_user_id) DO UPDATE SET
                email = excluded.email,
                name = excluded.name,
                refresh_token_encrypted = COALESCE(excluded.refresh_token_encrypted, users.refresh_token_encrypted),
                access_token_encrypted = COALESCE(excluded.access_token_encrypted, users.access_token_encrypted),
                access_token_expires_at = COALESCE(excluded.access_token_expires_at, users.access_token_expires_at),
                updated_at = unixepoch()
        `).bind(
            user.id,
            user.provider,
            user.provider_user_id,
            user.email,
            user.name,
            user.refresh_token_encrypted,
            user.access_token_encrypted,
            user.access_token_expires_at
        ).run();
    }
}
