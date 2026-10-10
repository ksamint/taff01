/** Real demo content. This leaf has no validators, runtime services, or credentials. */
export type PrototypeOrg = "nw" | "qs" | "me";
export type PrototypeLocale = "zh-HK" | "zh-CN" | "en";
export type PrototypeText = Record<PrototypeLocale, string>;
export const prototypeText = (
  hk: string,
  en: string,
  cn = hk,
): PrototypeText => ({
  "zh-HK": hk,
  "zh-CN": cn,
  en,
});
const kinds = [
  "workspace",
  "project",
  "member",
  "task",
  "run",
  "event",
  "artifact",
  "permission",
  "grant",
  "inbox",
  "comment",
  "reviewItem",
] as const;
/** Fixed fixture namespace; UUIDs are identities, never authentication tokens. */
export function prototypeId(
  kind: (typeof kinds)[number],
  org: PrototypeOrg,
  key = 0,
): string {
  const value =
    (kinds.indexOf(kind) + 1) * 100000000 +
    (["nw", "qs", "me"].indexOf(org) + 1) * 1000000 +
    key;
  return `98b5ad17-8fe3-4fab-8673-${value.toString(16).padStart(12, "0")}`;
}
export const prototypePeople = [
  {
    key: "lx",
    number: 1,
    email: "alex@taff.local",
    name: prototypeText("林曉", "Lin Xiao", "林晓"),
    role: prototypeText("產品經理", "Product manager", "产品经理"),
  },
  {
    key: "cm",
    number: 2,
    email: "mei@taff.local",
    name: prototypeText("陳默", "Chen Mo", "陈默"),
    role: prototypeText("工程負責人", "Engineering lead", "工程负责人"),
  },
  {
    key: "wy",
    number: 3,
    email: "sam@taff.local",
    name: prototypeText("王悅", "Wang Yue", "王悦"),
    role: prototypeText("產品設計師", "Product designer", "产品设计师"),
  },
  {
    key: "zl",
    number: 4,
    email: "lin@taff.local",
    name: prototypeText("趙磊", "Zhao Lei", "赵磊"),
    role: prototypeText("後端工程師", "Backend engineer", "后端工程师"),
  },
  {
    key: "sq",
    number: 5,
    email: "jordan@taff.local",
    name: prototypeText("蘇晴", "Su Qing", "苏晴"),
    role: prototypeText("運維與品質", "Ops & QA", "运维与品质"),
  },
  {
    key: "zn",
    number: 6,
    email: "zhou.ning@taff.local",
    name: prototypeText("周寧", "Zhou Ning", "周宁"),
    role: prototypeText("視覺設計師", "Visual designer", "视觉设计师"),
  },
  {
    key: "hc",
    number: 7,
    email: "he.chuan@taff.local",
    name: prototypeText("何川", "He Chuan"),
    role: prototypeText("前端工程師", "Frontend engineer", "前端工程师"),
  },
] as const;
export const prototypeAgents = [
  {
    key: "ra",
    number: 11,
    name: prototypeText("調研智能體", "Research Agent", "调研智能体"),
  },
  {
    key: "ca",
    number: 12,
    name: prototypeText("代碼智能體", "Code Agent", "代码智能体"),
  },
  {
    key: "oa",
    number: 13,
    name: prototypeText("運維智能體", "Ops Agent", "运维智能体"),
  },
] as const;
export const prototypeOrgs = [
  {
    key: "nw",
    seedKey: "prototype-northwind-v1",
    name: prototypeText("北風科技", "Northwind", "北风科技"),
    project: prototypeText("結賬改版", "Checkout v2", "结账改版"),
    team: prototypeText("產品組", "Product", "产品组"),
    people: ["lx", "cm", "wy", "zl", "sq"],
    agents: ["ra", "ca", "oa"],
    supervisors: { ra: "lx", ca: "cm", oa: "sq" },
  },
  {
    key: "qs",
    seedKey: "prototype-qingshi-v1",
    name: prototypeText("青石設計工作室", "Qingshi Studio", "青石设计工作室"),
    project: prototypeText("品牌官網改版", "Website refresh", "品牌官网改版"),
    team: prototypeText("設計組", "Design", "设计组"),
    people: ["lx", "zn", "hc"],
    agents: ["ra", "ca"],
    supervisors: { ra: "lx", ca: "hc", oa: "lx" },
  },
  {
    key: "me",
    seedKey: "prototype-personal-v1",
    name: prototypeText("個人空間", "Personal", "个人空间"),
    project: prototypeText("個人事項", "Personal", "个人事项"),
    team: prototypeText("僅自己", "Just you", "仅自己"),
    people: ["lx"],
    agents: ["ra"],
    supervisors: { ra: "lx", ca: "lx", oa: "lx" },
  },
] as const;
export type PrototypeTask = {
  org: PrototypeOrg;
  number: number;
  title: PrototypeText;
  description: PrototypeText;
  owner: string;
  agent?: string;
  status: "todo" | "in_progress" | "needs_review" | "done";
  priority: number;
  due: number;
  parent?: number;
  progress?: number;
  calendar?: { day: number; start: number; duration: number };
};
const task = (
  org: PrototypeOrg,
  number: number,
  hk: string,
  en: string,
  cn: string,
  owner: string,
  status: PrototypeTask["status"],
  priority: number,
  due: number,
  description: PrototypeText,
  extra: Partial<PrototypeTask> = {},
): PrototypeTask => ({
  org,
  number,
  title: prototypeText(hk, en, cn),
  owner,
  status,
  priority,
  due,
  description,
  ...extra,
});
export const prototypeTasks: readonly PrototypeTask[] = [
  task(
    "nw",
    140,
    "結賬改版 v2.4 發佈",
    "Ship Checkout v2.4",
    "结账改版 v2.4 发布",
    "lx",
    "in_progress",
    1,
    15,
    prototypeText(
      "把結賬從 5 步減到 3 步，並修復支付回調問題。所有子任務完成後發佈。",
      "Cut checkout from five steps to three and fix the payment callback issue. Ships when every subtask is done.",
      "把结账从 5 步减到 3 步，并修复支付回调问题。所有子任务完成后发布。",
    ),
  ),
  task(
    "nw",
    141,
    "競品結賬流程調研",
    "Competitive checkout teardown",
    "竞品结账流程调研",
    "lx",
    "needs_review",
    2,
    8,
    prototypeText(
      "對比 6 家主流電商 App 的結賬步驟、支付方式與失敗處理，輸出可執行的改版建議。",
      "Compare checkout steps, payment methods and failure handling across six leading shopping apps, and recommend concrete changes.",
      "对比 6 家主流电商 App 的结账步骤、支付方式与失败处理，输出可执行的改版建议。",
    ),
    { agent: "ra", progress: 4 },
  ),
  task(
    "nw",
    142,
    "編寫 v2.4 回滾預案",
    "Write v2.4 rollback runbook",
    "编写 v2.4 回滚预案",
    "sq",
    "needs_review",
    2,
    8,
    prototypeText(
      "覆蓋資料庫回退、功能開關關閉順序與恢復驗證，目標 15 分鐘內恢復。",
      "Cover database revert, feature-flag shutdown order and recovery checks, targeting recovery within 15 minutes.",
      "覆盖数据库回退、功能开关关闭顺序与恢复验证，目标 15 分钟内恢复。",
    ),
    { agent: "oa", parent: 140, progress: 4 },
  ),
  task(
    "nw",
    138,
    "修復 Apple Pay 回調超時",
    "Fix Apple Pay callback timeout",
    "修复 Apple Pay 回调超时",
    "zl",
    "in_progress",
    1,
    9,
    prototypeText(
      "約 2% 的 Apple Pay 支付在回調階段超時，訂單狀態停留在「待支付」。",
      "About 2% of Apple Pay payments time out at the callback, leaving orders stuck in Pending payment.",
      "约 2% 的 Apple Pay 支付在回调阶段超时，订单状态停留在「待支付」。",
    ),
    {
      agent: "ca",
      parent: 140,
      progress: 2,
      calendar: { day: 8, start: 600, duration: 120 },
    },
  ),
  task(
    "nw",
    144,
    "預發環境資料庫遷移",
    "Staging database migration",
    "预发环境数据库迁移",
    "sq",
    "in_progress",
    1,
    9,
    prototypeText(
      "為訂單表新增 payment_attempts 字段，並回填近 90 天數據。",
      "Add a payment_attempts column to orders and backfill the last 90 days.",
      "为订单表新增 payment_attempts 字段，并回填近 90 天数据。",
    ),
    {
      agent: "oa",
      parent: 140,
      progress: 1,
      calendar: { day: 9, start: 1080, duration: 60 },
    },
  ),
  task(
    "nw",
    139,
    "設計支付失敗狀態",
    "Design payment-failure states",
    "设计支付失败状态",
    "wy",
    "in_progress",
    2,
    10,
    prototypeText(
      "覆蓋餘額不足、銀行拒絕、網絡中斷三種情況，並保留用戶已填寫的資訊。",
      "Cover insufficient funds, bank decline and network loss, keeping everything the user has entered.",
      "覆盖余额不足、银行拒绝、网络中断三种情况，并保留用户已填写的信息。",
    ),
    { parent: 140, calendar: { day: 8, start: 915, duration: 60 } },
  ),
  task(
    "nw",
    145,
    "撰寫 v2.4 發佈說明",
    "Draft v2.4 release notes",
    "撰写 v2.4 发布说明",
    "lx",
    "todo",
    2,
    9,
    prototypeText(
      "匯總本迭代合併的改動，按用戶可感知的影響分組，並附升級注意事項。",
      "Summarize the changes merged this sprint, grouped by user-visible impact, with upgrade notes.",
      "汇总本迭代合并的改动，按用户可感知的影响分组，并附升级注意事项。",
    ),
    { parent: 140 },
  ),
  task(
    "nw",
    146,
    "評審埋點方案",
    "Review analytics event spec",
    "评审埋点方案",
    "cm",
    "todo",
    3,
    12,
    prototypeText(
      "確認結賬漏斗 9 個事件的命名、屬性與觸發時機。",
      "Confirm names, properties and trigger points for the 9 checkout funnel events.",
      "确认结账漏斗 9 个事件的命名、属性与触发时机。",
    ),
    { calendar: { day: 12, start: 840, duration: 60 } },
  ),
  task(
    "nw",
    147,
    "地址表單無障礙檢查",
    "Address form accessibility audit",
    "地址表单无障碍检查",
    "wy",
    "todo",
    3,
    13,
    prototypeText(
      "檢查讀屏順序、錯誤提示與鍵盤操作。",
      "Check screen-reader order, error messages and keyboard support.",
      "检查读屏顺序、错误提示与键盘操作。",
    ),
  ),
  task(
    "nw",
    135,
    "優惠券 API 單元測試",
    "Coupon API unit tests",
    "优惠券 API 单元测试",
    "zl",
    "done",
    3,
    6,
    prototypeText(
      "為優惠券疊加與過期邏輯補充測試。",
      "Add tests for coupon stacking and expiry logic.",
      "为优惠券叠加与过期逻辑补充测试。",
    ),
    { agent: "ca", progress: 4 },
  ),
  task(
    "nw",
    133,
    "整理用戶訪談紀要",
    "Synthesize user interview notes",
    "整理用户访谈纪要",
    "lx",
    "done",
    3,
    5,
    prototypeText(
      "整理 8 場訪談，提煉結賬環節的主要阻力。",
      "Synthesize 8 interviews into the main points of friction in checkout.",
      "整理 8 场访谈，提炼结账环节的主要阻力。",
    ),
    { agent: "ra", progress: 4 },
  ),
  task(
    "nw",
    136,
    "結賬頁性能基線",
    "Checkout performance baseline",
    "结账页性能基线",
    "cm",
    "done",
    3,
    7,
    prototypeText(
      "記錄 P75 首屏與可交互時間。",
      "Record P75 first paint and time to interactive.",
      "记录 P75 首屏与可交互时间。",
    ),
  ),
  task(
    "qs",
    19,
    "新官網上線",
    "Launch the new website",
    "新官网上线",
    "lx",
    "in_progress",
    1,
    16,
    prototypeText(
      "首頁、案例與 CMS 遷移完成後上線。",
      "Goes live once the homepage, case studies and CMS migration are done.",
      "首页、案例与 CMS 迁移完成后上线。",
    ),
  ),
  task(
    "qs",
    22,
    "整理客戶訪談要點",
    "Summarize client interview notes",
    "整理客户访谈要点",
    "lx",
    "needs_review",
    2,
    8,
    prototypeText(
      "匯總 4 場客戶訪談，提煉對新官網的期望與顧慮。",
      "Summarize four client interviews into expectations and concerns for the new site.",
      "汇总 4 场客户访谈，提炼对新官网的期望与顾虑。",
    ),
    { agent: "ra", progress: 4 },
  ),
  task(
    "qs",
    23,
    "遷移 CMS 內容",
    "Migrate CMS content",
    "迁移 CMS 内容",
    "hc",
    "in_progress",
    2,
    10,
    prototypeText(
      "把舊站 86 篇案例遷移到新 CMS，並保留原有連結。",
      "Move 86 case studies from the old site to the new CMS, keeping existing URLs.",
      "把旧站 86 篇案例迁移到新 CMS，并保留原有链接。",
    ),
    { agent: "ca", parent: 19, progress: 1 },
  ),
  task(
    "qs",
    21,
    "首頁動效原型",
    "Homepage motion prototype",
    "首页动效原型",
    "zn",
    "in_progress",
    2,
    9,
    prototypeText(
      "三種首屏進場方式，各 2 秒以內。",
      "Three hero entrance options, each under two seconds.",
      "三种首屏进场方式，各 2 秒以内。",
    ),
    { parent: 19, calendar: { day: 8, start: 780, duration: 90 } },
  ),
  task(
    "qs",
    24,
    "核對字體授權",
    "Check font licensing",
    "核对字体授权",
    "lx",
    "todo",
    3,
    10,
    prototypeText(
      "確認網頁字體的商用授權範圍。",
      "Confirm the commercial licence scope for the web fonts.",
      "确认网页字体的商用授权范围。",
    ),
    { parent: 19 },
  ),
  task(
    "qs",
    20,
    "收集競品官網",
    "Collect competitor sites",
    "收集竞品官网",
    "lx",
    "done",
    3,
    6,
    prototypeText(
      "收集 12 個同類工作室官網。",
      "Collect 12 sites from comparable studios.",
      "收集 12 个同类工作室官网。",
    ),
    { agent: "ra", progress: 4 },
  ),
  task(
    "me",
    7,
    "預訂下週上海出差",
    "Book next week's Shanghai trip",
    "预订下周上海出差",
    "lx",
    "todo",
    2,
    9,
    prototypeText(
      "週二去、週四回，酒店靠近客戶辦公室。",
      "Out Tuesday, back Thursday; hotel near the client office.",
      "周二去、周四回，酒店靠近客户办公室。",
    ),
  ),
  task(
    "me",
    8,
    "整理 Q4 閱讀清單",
    "Compile a Q4 reading list",
    "整理 Q4 阅读清单",
    "lx",
    "in_progress",
    3,
    12,
    prototypeText(
      "產品與設計方向各 5 本。",
      "Five books each on product and design.",
      "产品与设计方向各 5 本。",
    ),
    { agent: "ra", progress: 2 },
  ),
  task(
    "me",
    6,
    "預約年度體檢",
    "Book annual checkup",
    "预约年度体检",
    "lx",
    "done",
    3,
    5,
    prototypeText("", "", ""),
  ),
];
export type PrototypeMeeting = {
  org: PrototypeOrg;
  number: number;
  title: PrototypeText;
  day: number;
  start: number;
  duration: number;
  owner: string;
  attendees: string[];
  rrule?: string;
};
const meeting = (
  org: PrototypeOrg,
  number: number,
  hk: string,
  en: string,
  cn: string,
  day: number,
  start: number,
  duration: number,
  attendees: string[],
  rrule?: string,
): PrototypeMeeting => ({
  org,
  number,
  title: prototypeText(hk, en, cn),
  day,
  start,
  duration,
  owner: attendees[0],
  attendees,
  rrule,
});
const all = ["lx", "cm", "wy", "zl", "sq"];
export const prototypeMeetings: readonly PrototypeMeeting[] = [
  meeting(
    "nw",
    1001,
    "每日站會",
    "Daily standup",
    "每日站会",
    5,
    570,
    15,
    all,
    "FREQ=WEEKLY;COUNT=10;BYDAY=MO,TU,WE,TH,FR",
  ),
  meeting(
    "nw",
    1002,
    "結賬改版設計評審",
    "Checkout v2 design review",
    "结账改版设计评审",
    8,
    840,
    60,
    ["lx", "wy", "cm"],
  ),
  meeting(
    "nw",
    1003,
    "1:1 林曉 / 陳默",
    "1:1 Lin Xiao / Chen Mo",
    "1:1 林晓 / 陈默",
    8,
    990,
    30,
    ["lx", "cm"],
  ),
  meeting(
    "nw",
    1004,
    "用戶訪談 × 3",
    "User interviews × 3",
    "用户访谈 × 3",
    9,
    600,
    90,
    ["lx", "wy"],
  ),
  meeting(
    "nw",
    1005,
    "發佈準備會",
    "Release readiness",
    "发布准备会",
    9,
    900,
    45,
    all,
  ),
  meeting(
    "nw",
    1006,
    "週例會",
    "Weekly sync",
    "周例会",
    19,
    660,
    60,
    all,
    "FREQ=WEEKLY;COUNT=2",
  ),
  meeting(
    "nw",
    1007,
    "架構評審",
    "Architecture review",
    "架构评审",
    6,
    900,
    60,
    ["cm", "zl", "sq"],
  ),
  meeting("nw", 1008, "設計走查", "Design QA", "设计走查", 7, 840, 60, [
    "wy",
    "lx",
  ]),
  meeting(
    "nw",
    1009,
    "迭代規劃",
    "Sprint planning",
    "迭代规划",
    12,
    600,
    90,
    all,
  ),
  meeting(
    "nw",
    1010,
    "v2.4 發佈",
    "v2.4 release",
    "v2.4 发布",
    15,
    600,
    60,
    all,
  ),
  meeting("nw", 1011, "用戶訪談", "User interview", "用户访谈", 20, 600, 60, [
    "lx",
    "wy",
  ]),
  meeting("nw", 1012, "迭代回顧", "Sprint retro", "迭代回顾", 23, 900, 60, all),
  meeting(
    "nw",
    1013,
    "季度規劃",
    "Quarterly planning",
    "季度规划",
    27,
    600,
    120,
    all,
  ),
  meeting("nw", 1014, "週例會", "Weekly sync", "周例会", 5, 660, 60, all),
  // The prototype has a short sync after sprint planning instead of that week's regular slot.
  meeting("nw", 1016, "週例會", "Weekly sync", "周例会", 12, 690, 30, all),
  meeting(
    "qs",
    1001,
    "客戶週會",
    "Client weekly",
    "客户周会",
    8,
    630,
    60,
    ["lx", "zn", "hc"],
    "FREQ=WEEKLY;COUNT=2",
  ),
  meeting(
    "qs",
    1002,
    "首頁設計評審",
    "Homepage design review",
    "首页设计评审",
    9,
    840,
    60,
    ["lx", "zn"],
  ),
  meeting("qs", 1003, "交付會", "Handoff", "交付会", 13, 960, 60, [
    "lx",
    "zn",
    "hc",
  ]),
  meeting("me", 1001, "健身", "Gym", "健身", 8, 1140, 60, ["lx"]),
  meeting(
    "me",
    1002,
    "牙醫複診",
    "Dentist follow-up",
    "牙医复诊",
    10,
    600,
    45,
    ["lx"],
  ),
];
export function prototypeMeetingDescription(
  row: PrototypeMeeting,
): PrototypeText {
  const names = (locale: PrototypeLocale) =>
    row.attendees
      .map(
        (key) =>
          prototypePeople.find((person) => person.key === key)?.name[locale] ??
          key,
      )
      .join(" / ");
  return prototypeText(
    `參與者：${names("zh-HK")}`,
    `Participants: ${names("en")}`,
    `参与者：${names("zh-CN")}`,
  );
}
function fieldText(
  id: string,
  field: "title" | "description" | "name" | "role" | "team",
): PrototypeText | undefined {
  for (const org of prototypeOrgs) {
    if (id === prototypeId("workspace", org.key))
      return field === "name"
        ? org.name
        : field === "team"
          ? org.team
          : undefined;
    if (id === prototypeId("project", org.key))
      return field === "name" ? org.project : undefined;
    for (const person of prototypePeople)
      if (id === prototypeId("member", org.key, person.number))
        return field === "name"
          ? person.name
          : field === "role"
            ? person.role
            : undefined;
    for (const agent of prototypeAgents)
      if (id === prototypeId("member", org.key, agent.number))
        return field === "name" ? agent.name : undefined;
  }
  for (const row of prototypeTasks)
    if (id === prototypeId("task", row.org, row.number))
      return field === "title"
        ? row.title
        : field === "description"
          ? row.description
          : undefined;
  for (const row of prototypeMeetings)
    if (id === prototypeId("task", row.org, row.number))
      return field === "title"
        ? row.title
        : field === "description"
          ? prototypeMeetingDescription(row)
          : undefined;
  return undefined;
}
/** Only canonical, untouched fixture content is translated. User content stays verbatim. */
export function presentPrototypeField(
  id: string,
  field: "title" | "description" | "name" | "role" | "team",
  current: string,
  locale: PrototypeLocale,
): string {
  const text = fieldText(id, field);
  return text && current === text["zh-HK"] ? text[locale] : current;
}
/** Human fixture reference is stable even when its title is edited. */
export function prototypeTaskReference(id: string): string | null {
  const row = prototypeTasks.find(
    (task) => prototypeId("task", task.org, task.number) === id,
  );
  return row ? `${row.org.toUpperCase()}-${row.number}` : null;
}
