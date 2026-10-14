# Prototype v2 strings

`strings.csv` maps every user-facing string in prototype v2 to an app i18n key
(M11 item 4 of `docs/frontend-v2-plan.md`). It is UTF-8, LF, no BOM, RFC 4180
quoting. `scripts/ui/strings-csv.test.ts` checks it on every `pnpm test`.

## Columns

| Column | Meaning |
| --- | --- |
| `prototype_key` | `S.<key>` (`Team Tasks.dc.html`), `T.<key>` (Module Plan), `TR.<key>` (Module Relations `T`), `inline.<file>.<line>[.<n>]` (`tasks`, `plan`, `relations`, `store`; `.n` orders several strings on one line) |
| `app_key` | Dotted path in `apps/web/locales/*/common.json` when reused; `new:<path>` is a proposed key |
| `zh-HK` | Prototype Traditional string after the fixes below |
| `en` | App value when reused and the meaning matches; otherwise the prototype English, fixed |
| `zh-CN` | App value when the reused key's zh-HK matches; otherwise derived from zh-HK |
| `source` | `file:line` in `docs/ui/prototype-v2/` |

## Counts

- **646 rows:** `S` 296, `T` 120, `TR` 57, inline 173.
- **Inline (173):**
  - 115 conditional strings (`zh ? … : …`, `lang === 'zh'`): tasks 99, plan 14, relations 1, store 1.
  - 58 constant `{ zh, en }` UI pairs: tasks 48 (priorities, PERMS, review checks, MCP scopes, tool descriptions, search pages, run steps), store 10 (CRM roles, "just now").
- **Reused:** 185 rows map to 154 existing keys. **New:** 461 rows propose 425 `new:` keys.
- **Traditional fixes:** 16 occurrences in 15 rows (搜寻 5, 周 4, 注冊 2, 復制 2, 資讯 1, 合並 1, 標簽 1).
  The other listed variants (内, 准備, 標准, 重復, 帐戶) only occur in seed data, which is not extracted.
- **D5 vocabulary:** 8 rows changed. **Mismatched pairs:** 4 fixed.
- **Dropped:** 2, the LLM prompt language hint (`plan:633`) and an avatar initial (`plan:671`).

The `S` table has 296 keys, not the ~299 the plan estimated: 275 in the main literal and 21 in `Object.assign`.

## Rules applied

1. **Traditional fixes (§2.4 item 13).** In zh-HK: 搜寻→搜尋, 資讯→資訊, 注冊→註冊, 復制→複製, 合並→合併,
   内→內, 准備→準備, 標准→標準, 重復→重複, 帐戶→帳戶, 標簽→標籤, 周→週.
2. **D5 vocabulary.** Status and request wording is 待確認 / "To confirm" and 請求確認 / "requests confirmation".
   - Rows on `status.needs_review` and `run.status.needs_review` override the app's 待審核 / "Needs review". Port them as value changes.
   - Review-workspace nouns (審核清單, 審核策略, Reviews tab) stay 審核 / "Review".
3. **Pairs.**
   - `S.relV` is now 關係圖 / "Relations" (was 關係 / "Graph"). `T.optA` and `T.showGraph` follow it.
   - `S.startAgent` is now 啟動智能體 / "Start agent" (was 開始).
4. **One value per key.** Rows sharing an `app_key` take the first row's values.
   This applies to 4 conflicts: `status.todo` 待處理→待辦, `status.done` 完成→已完成, and "People and agents"→"People & agents".
   `T.undo` 復原 is set to 撤銷, the toast wording (§2.4 item 7).
5. **Placeholders.** Concatenations and template literals become i18next `{{name}}` placeholders; `T`'s `{n}` becomes
   `{{count}}`. The ¥ prefix in run meta is removed (§2.4 item 11: format currency with `Intl`).
6. **Reuse.** A key is reused only when it names the same UI slot in the same feature, or is a generic top-level key
   (`owner`, `agent`, `email`). Where the v2 text says more than the app value (search placeholder, syntax hint, MCP
   intro), the prototype English is kept, so porting those rows changes the app value.
7. **zh-CN.** Converted character by character, then mainland terms: 設定→设置, 伺服器→服务器, 權杖→令牌, 檔案→文件,
   登入→登录, 登出→退出登录, 建立→创建, 搜尋→搜索, 電郵→邮箱, 資訊→信息, 預設→默认, 甚麼→什么, 早晨→早上好,
   回饋→反馈, 資料庫→数据库; 「」 become “”. Review before shipping, as the plan requires.

## Namespaces for proposed keys

- **Ported:** `actions`, `crm`, `brief`, `ask`, `timeline`, `relations`, `mind`, `finance`, `risk`, `home`, `toast`, `format`, plus existing feature namespaces.
- **Not for porting as-is:**
  - `new:prototype.*` is prototype chrome (frame labels, clickable flows, reset demo, home canvas toggle) and 跳過首頁 (D3).
  - `new:seed.*` is demo content or fake intelligence (§2.4 item 12), such as the static mind-map summary and the canned Ask answers.
