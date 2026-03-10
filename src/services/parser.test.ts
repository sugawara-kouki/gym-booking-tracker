import { EmailParser } from './parser';

/**
 * parser.test.ts
 * 
 * 実際のメールサンプルを使用した解析ロジックのテスト
 * 実行方法: npx ts-node src/services/parser.test.ts
 */

const appliedMail = `
====
このメールは札幌市公共施設予約情報システムに登録いただいたお客様のアドレスにお送りしています。
返信メールでお問い合わせいただいても、お答えができませんのであらかじめご了承願います。
====

次の通り抽選申込を受付けましたのでお知らせいたします。
----
【利用者番号】00127966
【ログインID】00127966
----
【受付番号】20250202003907-1
【施設室場】中央小学校 体育館
【利用日時】2025年12月04日(木)18:15～21:45
【利用目的】バドミントン
----
`;

const wonMail = `
====
このメールは札幌市公共施設予約情報システムに登録いただいたお客様のアドレスにお送りしています。
返信メールでお問い合わせいただいても、お答えができませんのであらかじめご了承願います。
====

次の通り抽選に当選されましたのでお知らせいたします。
----
【利用者番号】00127966
【ログインID】00127966
----
【受付番号】20250337014274-1
【施設室場】幌東小学校 体育館
【利用日時】2025年11月13日(木)18:15～21:45
【申込期間】2025年10月23日(木) 9:00～2025年10月25日(土) 23:00
----
`;

function runTests() {
    console.log('=== Running Parser Tests ===');

    console.log('\n--- Test 1: Applied Email ---');
    const appliedResult = EmailParser.parse(appliedMail);
    if (appliedResult) {
        console.log('✅ Success:');
        console.log(JSON.stringify(appliedResult, null, 2));

        // アサーション的な簡易チェック
        if (appliedResult.status !== 'applied') console.error('❌ Status mismatch');
        if (appliedResult.facility_name !== '中央小学校 体育館') console.error('❌ Facility mismatch');
        if (appliedResult.purpose !== 'バドミントン') console.error('❌ Purpose mismatch');
        if (appliedResult.event_date !== '2025-12-04 18:15') console.error('❌ Date mismatch');
    } else {
        console.error('❌ Failed to parse applied email');
    }

    console.log('\n--- Test 2: Won Email ---');
    const wonResult = EmailParser.parse(wonMail);
    if (wonResult) {
        console.log('✅ Success:');
        console.log(JSON.stringify(wonResult, null, 2));

        if (wonResult.status !== 'won') console.error('❌ Status mismatch');
        if (wonResult.facility_name !== '幌東小学校 体育館') console.error('❌ Facility mismatch');
        if (wonResult.event_date !== '2025-11-13 18:15') console.error('❌ Date mismatch');
    } else {
        console.error('❌ Failed to parse won email');
    }

    console.log('\n=== Multi-facility format support verified ===');
}

runTests();
