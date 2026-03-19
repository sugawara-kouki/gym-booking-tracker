import { UserRepository, UserRow } from '../types';

export class D1UserRepository implements UserRepository {
    constructor(private db: D1Database) { }

    async findById(id: string): Promise<UserRow | null> {
        return await this.db.prepare('SELECT * FROM users WHERE id = ?')
            .bind(id)
            .first<UserRow>();
    }

    async upsert(user: Omit<UserRow, 'created_at' | 'updated_at'>): Promise<void> {
        await this.db.prepare(`
            INSERT INTO users (id, email, name, refresh_token_encrypted, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, unixepoch(), unixepoch())
            ON CONFLICT(id) DO UPDATE SET
                email = excluded.email,
                name = excluded.name,
                refresh_token_encrypted = excluded.refresh_token_encrypted,
                updated_at = unixepoch()
        `).bind(
            user.id,
            user.email,
            user.name,
            user.refresh_token_encrypted
        ).run();
    }
}
