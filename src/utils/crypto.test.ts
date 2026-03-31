import { describe, expect, it } from 'vitest'
import { decryptToken, encryptToken } from './crypto'

describe('crypto utils', () => {
  const secret = 'test_secret_key_used_for_encryption_tests'
  const wrongSecret = 'wrong_secret_key_used_for_encryption_tests'

  describe('encryptToken and decryptToken', () => {
    it('should encrypt and decrypt a string successfully', async () => {
      const originalText = 'my-sensitive-token-123'
      const encrypted = await encryptToken(originalText, secret)

      expect(encrypted).not.toBe(originalText)
      expect(encrypted.length).toBeGreaterThan(0)

      const decrypted = await decryptToken(encrypted, secret)
      expect(decrypted).toBe(originalText)
    })

    it('should produce different encrypted strings for the same input due to random IV', async () => {
      const text = 'same-input-string'
      const encrypted1 = await encryptToken(text, secret)
      const encrypted2 = await encryptToken(text, secret)

      expect(encrypted1).not.toBe(encrypted2)

      // Both should decrypt back to the original text
      expect(await decryptToken(encrypted1, secret)).toBe(text)
      expect(await decryptToken(encrypted2, secret)).toBe(text)
    })

    it('should fail to decrypt with an incorrect secret key', async () => {
      const originalText = 'secret-message'
      const encrypted = await encryptToken(originalText, secret)

      // Web Crypto API throws an error when decryption fails
      await expect(decryptToken(encrypted, wrongSecret)).rejects.toThrow()
    })

    it('should fail to decrypt if the ciphertext is tampered with', async () => {
      const originalText = 'secret-message'
      const encrypted = await encryptToken(originalText, secret)

      // Modify the base64 string slightly
      // We just truncate it or change the last character to break the authentication tag
      const tampered =
        encrypted.substring(0, encrypted.length - 1) + (encrypted.endsWith('a') ? 'b' : 'a')

      await expect(decryptToken(tampered, secret)).rejects.toThrow()
    })
  })
})
