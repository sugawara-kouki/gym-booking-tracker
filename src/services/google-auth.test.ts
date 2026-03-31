import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGoogleAuthService, type GoogleAuthService } from './google-auth'

describe('GoogleAuthService', () => {
  const clientId = 'test_client_id'
  const clientSecret = 'test_client_secret'

  let service: GoogleAuthService

  beforeEach(() => {
    service = createGoogleAuthService(clientId, clientSecret)
    // Mock global fetch
    globalThis.fetch = vi.fn() as typeof fetch
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getAuthUrl', () => {
    it('should generate a valid Google OAuth URL with proper parameters', () => {
      const redirectUri = 'http://localhost:8787/auth/google/callback'
      const state = 'random_state_string_123'

      const urlString = service.getAuthUrl(redirectUri, state)

      // It should be a valid URL
      const url = new URL(urlString)

      expect(url.origin).toBe('https://accounts.google.com')
      expect(url.pathname).toBe('/o/oauth2/v2/auth')

      // Check search params
      expect(url.searchParams.get('client_id')).toBe(clientId)
      expect(url.searchParams.get('redirect_uri')).toBe(redirectUri)
      expect(url.searchParams.get('response_type')).toBe('code')
      expect(url.searchParams.get('scope')).toContain(
        'https://www.googleapis.com/auth/gmail.readonly',
      )
      expect(url.searchParams.get('access_type')).toBe('offline')
      expect(url.searchParams.get('prompt')).toBe('consent')
      expect(url.searchParams.get('state')).toBe(state)
    })
  })

  describe('exchangeCodeForTokens', () => {
    it('should exchange code for tokens successfully on 200 OK', async () => {
      const mockResponseData = {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expires_in: 3600,
        scope: 'openid profile email',
        token_type: 'Bearer',
        id_token: 'mock_id_token',
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseData,
      } as Response)

      const code = 'auth_code_xyz'
      const redirectUri = 'http://localhost/callback'

      const result = await service.exchangeCodeForTokens(code, redirectUri)

      // Verify fetch was called with right args
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      )

      // Verify body
      const callBody = vi.mocked(fetch).mock.calls[0][1]?.body as URLSearchParams
      expect(callBody.get('client_id')).toBe(clientId)
      expect(callBody.get('client_secret')).toBe(clientSecret)
      expect(callBody.get('code')).toBe(code)
      expect(callBody.get('redirect_uri')).toBe(redirectUri)
      expect(callBody.get('grant_type')).toBe('authorization_code')

      // Verify output matches schema parsing
      expect(result.access_token).toBe('mock_access_token')
      expect(result.refresh_token).toBe('mock_refresh_token')
      expect(result.expires_in).toBe(3600)
    })

    it('should throw an error on non-OK response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        text: async () => 'invalid_grant',
      } as Response)

      await expect(service.exchangeCodeForTokens('bad_code', 'http://localhost')).rejects.toThrow(
        'Failed to exchange token: invalid_grant',
      )
    })
  })

  describe('fetchUserInfo', () => {
    it('should fetch user info successfully on 200 OK', async () => {
      const mockResponseData = {
        id: '1234567890',
        email: 'test@example.com',
        verified_email: true,
        name: 'Test Setup User',
        given_name: 'Test',
        family_name: 'User',
        picture: 'https://example.com/photo.jpg',
        locale: 'ja',
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseData,
      } as Response)

      const result = await service.fetchUserInfo('valid_access_token_123')

      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer valid_access_token_123',
          },
        }),
      )

      expect(result.id).toBe('1234567890')
      expect(result.email).toBe('test@example.com')
      expect(result.name).toBe('Test Setup User')
    })

    it('should throw an error on non-OK response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        text: async () => 'Unauthorized',
      } as Response)

      await expect(service.fetchUserInfo('invalid_token')).rejects.toThrow(
        'Failed to fetch user info: Unauthorized',
      )
    })
  })
})
