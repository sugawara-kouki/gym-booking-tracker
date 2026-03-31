import { verify } from 'hono/jwt'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repositories } from '../repositories'
import { decryptToken } from '../utils/crypto'
import { type AuthService, createAuthService } from './auth'

describe('AuthService', () => {
  const encryptionKey = 'test_encryption_key_such_secure_wow'
  const jwtSecret = 'test_jwt_secret_very_secret_indeed'

  let mockRepos: {
    users: {
      findByProviderId: ReturnType<typeof vi.fn>
      upsert: ReturnType<typeof vi.fn>
    }
  }
  let authService: AuthService

  beforeEach(() => {
    mockRepos = {
      users: {
        findByProviderId: vi.fn(),
        upsert: vi.fn(),
      },
    }
    authService = createAuthService(mockRepos as unknown as Repositories, encryptionKey, jwtSecret)
  })

  describe('loginOrUpdateUser', () => {
    it('should create a new user with generated UUID and encrypt tokens', async () => {
      // Setup: Provider user doesn't exist yet
      mockRepos.users.findByProviderId.mockResolvedValue(null)

      const profile = {
        provider: 'google',
        id: 'google-sub-123',
        email: 'test@example.com',
        name: 'Test Setup User',
      }

      const tokens = {
        accessToken: 'access-token-456',
        refreshToken: 'refresh-token-789',
        expiresIn: 3600,
      }

      const result = await authService.loginOrUpdateUser(profile, tokens)

      // Verification
      expect(mockRepos.users.findByProviderId).toHaveBeenCalledWith('google', 'google-sub-123')
      expect(mockRepos.users.upsert).toHaveBeenCalled()

      // Should have generated an internal UUID since existing user was null
      expect(result.id).toBeDefined()
      expect(result.id.length).toBeGreaterThan(10) // Basic UUID check
      expect(result.provider).toBe('google')
      expect(result.provider_user_id).toBe('google-sub-123')
      expect(result.email).toBe('test@example.com')

      // Should have encrypted the tokens
      expect(result.access_token_encrypted).toBeDefined()
      expect(result.access_token_encrypted).not.toBe('access-token-456')
      expect(result.refresh_token_encrypted).toBeDefined()
      expect(result.refresh_token_encrypted).not.toBe('refresh-token-789')

      // Since we know the encryption key, we can actually decrypt and verify it's the right content
      const decryptedAccess = await decryptToken(result.access_token_encrypted, encryptionKey)
      expect(decryptedAccess).toBe('access-token-456')

      const decryptedRefresh = await decryptToken(
        result.refresh_token_encrypted as string,
        encryptionKey,
      )
      expect(decryptedRefresh).toBe('refresh-token-789')
    })

    it('should update existing user preserving internal ID and old refresh token if missing', async () => {
      // Setup: existing user
      mockRepos.users.findByProviderId.mockResolvedValue({
        id: 'existing-internal-uuid-000',
        refresh_token_encrypted: 'old_encrypted_refresh_token',
        access_token_expires_at: 1000000,
      })

      const profile = {
        provider: 'google',
        id: 'google-sub-123',
        email: 'test@example.com',
        name: 'Test Profile',
      }

      const tokens = {
        accessToken: 'new-access-token-999',
        // No refreshToken provided this time!
        expiresIn: 3600,
      }

      const result = await authService.loginOrUpdateUser(profile, tokens)

      expect(mockRepos.users.findByProviderId).toHaveBeenCalledWith('google', 'google-sub-123')
      expect(mockRepos.users.upsert).toHaveBeenCalled()

      // The internal ID should be preserved
      expect(result.id).toBe('existing-internal-uuid-000')

      // The old refresh token should be preserved because they didn't provide a new one
      expect(result.refresh_token_encrypted).toBe('old_encrypted_refresh_token')

      // But access token should be newly encrypted
      const decryptedAccess = await decryptToken(result.access_token_encrypted, encryptionKey)
      expect(decryptedAccess).toBe('new-access-token-999')
    })

    it('should handle missing tokens.expiresIn and missing refreshToken for new user', async () => {
      mockRepos.users.findByProviderId.mockResolvedValue(null)
      const profile = {
        provider: 'apple',
        id: 'apple-sub-1',
        email: 'test@apple.com',
        name: 'Apple User',
      }
      const tokens = { accessToken: 'access-111' } // no refreshToken, no expiresIn

      const result = await authService.loginOrUpdateUser(profile, tokens)

      expect(mockRepos.users.upsert).toHaveBeenCalled()
      expect(result.refresh_token_encrypted).toBeNull()
      expect(result.access_token_expires_at).toBe(0) // Fallback to 0
    })

    it('should handle missing tokens.expiresIn and use existing user expires_at', async () => {
      mockRepos.users.findByProviderId.mockResolvedValue({
        id: 'existing-id-2',
        refresh_token_encrypted: null,
        access_token_expires_at: 1234567890,
      })
      const profile = {
        provider: 'apple',
        id: 'apple-sub-1',
        email: 'test@apple.com',
        name: 'Apple User',
      }
      const tokens = { accessToken: 'access-222' }

      const result = await authService.loginOrUpdateUser(profile, tokens)

      expect(result.access_token_expires_at).toBe(1234567890) // Fallback to existing
    })
  })

  describe('createSessionToken', () => {
    it('should generate a valid JWT payload containing the user ID as subject', async () => {
      const user = {
        id: 'user-uuid-xyz',
        email: 'jwt@example.com',
      }

      const token = await authService.createSessionToken(user)
      expect(typeof token).toBe('string')
      expect(token.split('.').length).toBe(3) // Basic JWT format check

      // Verify the generated token using the same secret
      const payload = await verify(token, jwtSecret, 'HS256')

      expect(payload.sub).toBe('user-uuid-xyz')
      expect(payload.email).toBe('jwt@example.com')
      expect(payload.exp).toBeDefined()
    })
  })
})
