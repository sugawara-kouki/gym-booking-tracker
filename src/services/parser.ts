import type { EmailParserProvider, ParsedBooking } from './parsers/base'
import { createSapporoParser } from './parsers/sapporo'

/**
 * 複数のパーサー・プロバイダーを管理するメイン・パーサー・ロジック
 */
const createEmailParser = (initialProviders: EmailParserProvider[] = []) => {
  const providers = [...initialProviders]

  return {
    /**
     * テキスト内容を解析して予約情報を抽出する
     */
    parse(body: string, subject?: string): ParsedBooking | null {
      for (const provider of providers) {
        if (provider.canParse(body, subject)) {
          const result = provider.parse(body, subject)
          if (result) return result
        }
      }
      return null
    },

    /**
     * 新しいプロバイダーを追加登録する
     */
    registerProvider(provider: EmailParserProvider) {
      providers.push(provider)
    },
  }
}

// 札幌市用パーサーを初期状態で構成したシングルトン
export const EmailParser = createEmailParser([createSapporoParser()])

export type { BookingStatus } from '../constants/status'
// 型と定数の再エクスポート
export { BOOKING_STATUS } from '../constants/status'
export type { ParsedBooking } from './parsers/base'
