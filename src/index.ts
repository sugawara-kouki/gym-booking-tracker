import app from './app'

/**
 * Cloudflare Workers Entry Point
 */
export default {
  fetch: app.fetch,
}
