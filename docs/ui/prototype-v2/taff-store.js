/* taff shared data layer
   ---------------------------------------------------------------------------
   One copy of organisations, projects, people, tasks, plan fields, dependencies,
   milestones, the value chain and AI suggestions, shared by Team Tasks,
   Team Tasks Module Plan and Team Tasks Module Relations.

   Production: every call below maps to the Postgres tables in db/schema.sql
   (via the API or PostgREST). Change notifications come from LISTEN/NOTIFY
   pushed over a websocket. Prototype: rows live in localStorage under KEY, and
   other open tabs are notified through the `storage` event.
   Day numbers follow Team Tasks: 1 = 1 Oct 2026, <=0 = September, >31 = November.
   Today is day 8 (Thursday 8 October 2026).                                   */
(function () {
  if (window.TaffStore) return;
  const KEY = 'taff.db.v1', VER = 1, TODAY = 8;
  const clone = o => JSON.parse(JSON.stringify(o));

  const ORGS = {
    nw: { zh: '北風科技', en: 'Northwind', prefix: 'NW' },
    qs: { zh: '青石設計工作室', en: 'Qingshi Studio', prefix: 'QS' },
    me: { zh: '個人空間', en: 'Personal', prefix: 'ME' },
  };
  const PROJECTS = [
    { id: 'chk', org: 'nw', zh: '結賬改版', en: 'Checkout v2', code: 'CK' },
    { id: 'web', org: 'qs', zh: '品牌官網改版', en: 'Website refresh', code: 'WB' },
    { id: 'me', org: 'me', zh: '個人事項', en: 'Personal', code: 'ME' },
  ];
  // Contract value and fees collected per project (HKD). Delivery % is computed from task progress.
  const FINANCE = { chk: { amount: 1280000, collected: 512000 }, web: { amount: 360000, collected: 180000 } };
  const money = (v, lang) => { if (v == null) return '—'; if (lang === 'zh') return v >= 10000 ? 'HK$' + (v / 10000).toFixed(v % 10000 ? 1 : 0) + ' 萬' : 'HK$' + v.toLocaleString('en'); return v >= 1e6 ? 'HK$' + (v / 1e6).toFixed(2) + 'M' : 'HK$' + Math.round(v / 1000) + 'K'; };
  const PEOPLE = {
    lx: { zh: '林曉', en: 'Lin Xiao', ini: '林', iniEn: 'LX', role: { zh: '產品經理', en: 'Product manager' } },
    cm: { zh: '陳默', en: 'Chen Mo', ini: '陳', iniEn: 'CM', role: { zh: '工程負責人', en: 'Engineering lead' } },
    wy: { zh: '王悅', en: 'Wang Yue', ini: '王', iniEn: 'WY', role: { zh: '產品設計師', en: 'Product designer' } },
    zl: { zh: '趙磊', en: 'Zhao Lei', ini: '趙', iniEn: 'ZL', role: { zh: '後端工程師', en: 'Backend engineer' } },
    sq: { zh: '蘇晴', en: 'Su Qing', ini: '蘇', iniEn: 'SQ', role: { zh: '運維與品質', en: 'Ops & QA' } },
    zn: { zh: '周寧', en: 'Zhou Ning', ini: '周', iniEn: 'ZN', role: { zh: '視覺設計師', en: 'Visual designer' } },
    hc: { zh: '何川', en: 'He Chuan', ini: '何', iniEn: 'HC', role: { zh: '前端工程師', en: 'Frontend engineer' } },
    ra: { zh: '調研智能體', en: 'Research Agent', agent: true, role: { zh: '競品分析與訪談整理', en: 'Research & synthesis' } },
    ca: { zh: '代碼智能體', en: 'Code Agent', agent: true, role: { zh: '修復缺陷與測試', en: 'Fixes & tests' } },
    oa: { zh: '運維智能體', en: 'Ops Agent', agent: true, role: { zh: '部署與資料庫遷移', en: 'Deploys & migrations' } },
  };
  const T = (zh, en) => ({ zh, en });
  // Core task rows. Team Tasks owns the full records (description, activity, outputs)
  // and overwrites these on first save; this copy lets taff run before Team Tasks has.
  const CORE = {
    nw: [
      { id: 'NW-140', title: T('結賬改版 v2.4 發佈', 'Ship Checkout v2.4'), status: 'doing', owner: 'lx', agent: null, agentState: null, due: 15, pri: 1, proj: 'chk', parent: null },
      { id: 'NW-141', title: T('競品結賬流程調研', 'Competitive checkout teardown'), status: 'review', owner: 'lx', agent: 'ra', agentState: 'review', progress: 4, due: 8, pri: 2, proj: 'chk', parent: 'NW-140' },
      { id: 'NW-142', title: T('編寫 v2.4 回滾預案', 'Write v2.4 rollback runbook'), status: 'review', owner: 'sq', agent: 'oa', agentState: 'review', progress: 4, due: 8, pri: 2, proj: 'chk', parent: 'NW-140' },
      { id: 'NW-138', title: T('修復 Apple Pay 回調超時', 'Fix Apple Pay callback timeout'), status: 'doing', owner: 'zl', agent: 'ca', agentState: 'working', progress: 2, due: 9, pri: 1, proj: 'chk', parent: 'NW-140' },
      { id: 'NW-144', title: T('預發環境資料庫遷移', 'Staging database migration'), status: 'doing', owner: 'sq', agent: 'oa', agentState: 'blocked', progress: 1, due: 9, pri: 1, proj: 'chk', parent: 'NW-140', needs: 'staging.write', blocker: T('需要預發資料庫寫權限，當前權杖為只讀。', 'Needs write access to the staging database; the current token is read-only.') },
      { id: 'NW-139', title: T('設計支付失敗狀態', 'Design payment-failure states'), status: 'doing', owner: 'wy', agent: null, agentState: null, due: 10, pri: 2, proj: 'chk', parent: 'NW-140' },
      { id: 'NW-145', title: T('撰寫 v2.4 發佈說明', 'Draft v2.4 release notes'), status: 'todo', owner: 'lx', agent: null, agentState: null, due: 9, pri: 2, proj: 'chk', parent: 'NW-140' },
      { id: 'NW-146', title: T('評審埋點方案', 'Review analytics event spec'), status: 'todo', owner: 'cm', agent: null, agentState: null, due: 12, pri: 3, proj: 'chk', parent: null },
      { id: 'NW-147', title: T('地址表單無障礙檢查', 'Address form accessibility audit'), status: 'todo', owner: 'wy', agent: null, agentState: null, due: 13, pri: 3, proj: 'chk', parent: null },
      { id: 'NW-135', title: T('優惠券 API 單元測試', 'Coupon API unit tests'), status: 'done', owner: 'zl', agent: 'ca', agentState: 'done', progress: 4, due: 6, pri: 3, proj: 'chk', parent: null },
      { id: 'NW-133', title: T('整理用戶訪談紀要', 'Synthesize user interview notes'), status: 'done', owner: 'lx', agent: 'ra', agentState: 'done', progress: 4, due: 5, pri: 3, proj: 'chk', parent: null },
      { id: 'NW-136', title: T('結賬頁性能基線', 'Checkout performance baseline'), status: 'done', owner: 'cm', agent: null, agentState: null, due: 7, pri: 3, proj: 'chk', parent: null },
    ],
    qs: [
      { id: 'QS-19', title: T('新官網上線', 'Launch the new website'), status: 'doing', owner: 'lx', agent: null, agentState: null, due: 16, pri: 1, proj: 'web', parent: null },
      { id: 'QS-22', title: T('整理客戶訪談要點', 'Summarize client interview notes'), status: 'review', owner: 'lx', agent: 'ra', agentState: 'review', progress: 4, due: 8, pri: 2, proj: 'web', parent: null },
      { id: 'QS-23', title: T('遷移 CMS 内容', 'Migrate CMS content'), status: 'doing', owner: 'hc', agent: 'ca', agentState: 'working', progress: 1, due: 10, pri: 2, proj: 'web', parent: 'QS-19' },
      { id: 'QS-21', title: T('首頁動效原型', 'Homepage motion prototype'), status: 'doing', owner: 'zn', agent: null, agentState: null, due: 9, pri: 2, proj: 'web', parent: 'QS-19' },
      { id: 'QS-24', title: T('核對字體授權', 'Check font licensing'), status: 'todo', owner: 'lx', agent: null, agentState: null, due: 10, pri: 3, proj: 'web', parent: 'QS-19' },
      { id: 'QS-20', title: T('收集競品官網', 'Collect competitor sites'), status: 'done', owner: 'lx', agent: 'ra', agentState: 'done', progress: 4, due: 6, pri: 3, proj: 'web', parent: null },
    ],
    me: [
      { id: 'ME-7', title: T('預訂下週上海出差', 'Book next week\'s Shanghai trip'), status: 'todo', owner: 'lx', agent: null, agentState: null, due: 9, pri: 2, proj: 'me', parent: null },
      { id: 'ME-8', title: T('整理 Q4 閱讀清單', 'Compile a Q4 reading list'), status: 'doing', owner: 'lx', agent: 'ra', agentState: 'working', progress: 2, due: 12, pri: 3, proj: 'me', parent: null },
      { id: 'ME-6', title: T('預約年度體檢', 'Book annual checkup'), status: 'done', owner: 'lx', agent: null, agentState: null, due: 5, pri: 3, proj: 'me', parent: null },
    ],
  };
  // Plan fields taff adds to each task: duration in days (start = due - dur + 1).
  const PLAN = {
    'NW-141': { dur: 3 }, 'NW-142': { dur: 2 }, 'NW-138': { dur: 3 }, 'NW-144': { dur: 4 }, 'NW-139': { dur: 3 }, 'NW-145': { dur: 1 },
    'NW-146': { dur: 1 }, 'NW-147': { dur: 2 }, 'NW-135': { dur: 4 }, 'NW-133': { dur: 5 }, 'NW-136': { dur: 3 },
    'QS-22': { dur: 2 }, 'QS-23': { dur: 6 }, 'QS-21': { dur: 3 }, 'QS-24': { dur: 1 }, 'QS-20': { dur: 4 },
    'ME-7': { dur: 1 }, 'ME-8': { dur: 5 }, 'ME-6': { dur: 1 },
  };
  const DEPS = [['NW-133', 'NW-139'], ['NW-139', 'NW-147'], ['NW-136', 'NW-146'], ['NW-144', 'NW-146'], ['NW-147', 'ms-v24'], ['NW-146', 'ms-v24'], ['NW-140', 'ms-v24'], ['QS-20', 'QS-21'], ['QS-20', 'QS-22'], ['QS-19', 'ms-web'], ['QS-22', 'QS-24']];
  const MILESTONES = [{ id: 'ms-v24', proj: 'chk', zh: 'v2.4 發佈', en: 'v2.4 release', day: 15 }, { id: 'ms-web', proj: 'web', zh: '新官網上線', en: 'New site live', day: 17 }];
  const SERVICES = { s1: T('支付網關', 'Payment gateway'), s2: T('用戶研究', 'User research'), s3: T('行為分析管道', 'Analytics pipeline') };
  const DATA = { d1: T('結賬漏斗事件', 'Checkout funnel events'), d2: T('支付回調日誌', 'Payment callback logs'), d3: T('客戶與用戶訪談', 'Client & user interviews') };
  const VALUES = { v1: { ...T('結賬轉化率', 'Checkout conversion'), m: T('結賬步驟由 5 步減到 3 步', 'Checkout from 5 steps to 3') }, v2: { ...T('支付成功率', 'Payment success rate'), m: T('回調超時由 2% 降至接近 0', 'Callback timeouts from 2% to near zero') }, v3: { ...T('品牌信任', 'Brand trust'), m: T('首頁直接展示案例', 'Case studies on the homepage') } };
  const CHAIN = [['s3', 'd1', 'FEEDS'], ['s1', 'd2', 'FEEDS'], ['s2', 'd3', 'FEEDS'], ['d1', 'v1', 'YIELDS'], ['d2', 'v2', 'YIELDS'], ['d3', 'v1', 'YIELDS'], ['d3', 'v3', 'YIELDS'], ['v1', 'chk', 'DELIVERS'], ['v2', 'chk', 'DELIVERS'], ['v3', 'web', 'DELIVERS']];

  const act = (zh, en) => ({ who: 'lx', kind: 'event', zh, en, at: { zh: '剛剛', en: 'Just now' } });
  const findTask = (db, id) => { for (const org in db.tasks) { const t = db.tasks[org].find(x => x.id === id); if (t) return t; } return null; };
  const orgOf = (db, id) => Object.keys(db.tasks).find(org => db.tasks[org].some(x => x.id === id));
  const setTask = (db, id, patch, a) => { const org = orgOf(db, id); if (!org) return; db.tasks[org] = db.tasks[org].map(t => t.id === id ? { ...t, ...patch, activity: a ? [...(t.activity || []), a] : (t.activity || []) } : t); };
  function nextId(db, org) { const pre = ORGS[org] ? ORGS[org].prefix : org.toUpperCase(); let mx = 0; (db.tasks[org] || []).forEach(t => { const n = parseInt(String(t.id).split('-')[1], 10); if (n > mx) mx = n; }); return pre + '-' + (mx + 1); }
  function addTask(db, org, row, plan) { const id = row.id || nextId(db, org); db.tasks[org] = [...(db.tasks[org] || []), { agent: null, agentState: null, pri: 3, parent: null, desc: null, activity: [], ...row, id }]; if (plan) db.plan[id] = plan; return id; }

  // AI suggestions. Each one is only offered while its condition holds, so an
  // approval made in Team Tasks retires the matching suggestion in taff.
  const SUGG = [
    { id: 'sg-141', by: 'ra', proj: 'chk', task: 'NW-141', zh: '批准調研智能體交付：競品結賬流程調研', en: 'Approve Research Agent’s work: Competitive checkout teardown', wzh: '報告已提交審核：6 家中有 4 家在支付失敗後保留購物車，平均 3.2 步。批准後任務標記為完成。', wen: 'Submitted for review: 4 of 6 apps keep the cart after a failed payment; the average flow is 3.2 steps. Approving marks the task done.',
      applies: db => { const t = findTask(db, 'NW-141'); return !!t && t.status === 'review'; },
      apply: db => setTask(db, 'NW-141', { status: 'done', agentState: 'done', progress: 4 }, act('經 taff 批准了交付', 'approved the work via taff')) },
    { id: 'sg-144', by: 'oa', proj: 'chk', task: 'NW-144', zh: '授予運維智能體預發資料庫寫權限（僅此任務 · 24 小時）', en: 'Grant Ops Agent staging DB write access (this task only · 24 hours)', wzh: '遷移腳本已就緒，只差寫權限。解除阻礙後，「評審埋點方案」可按原定 10月12日 開始。', wen: 'The migration script is ready and only needs write access. Unblocking it keeps Review analytics event spec on 12 October.',
      applies: db => { const t = findTask(db, 'NW-144'); return !!t && t.agentState === 'blocked'; },
      apply: db => setTask(db, 'NW-144', { agentState: 'working', blocker: null, needs: null }, act('經 taff 授予運維智能體預發資料庫寫權限（僅本任務 · 24 小時）', 'granted Ops Agent staging write access via taff (this task only · 24 hours)')) },
    { id: 'sg-qs22', by: 'ra', proj: 'web', task: 'QS-22', zh: '批准調研智能體交付：客戶訪談要點', en: 'Approve Research Agent’s work: Client interview notes', wzh: '4 位客戶中有 3 位希望首頁直接展示案例。批准後「核對字體授權」可以開始。', wen: '3 of 4 clients want case studies on the homepage. Approving unblocks Check font licensing.',
      applies: db => { const t = findTask(db, 'QS-22'); return !!t && t.status === 'review'; },
      apply: db => setTask(db, 'QS-22', { status: 'done', agentState: 'done', progress: 4 }, act('經 taff 批准了交付', 'approved the work via taff')) },
    { id: 'sg-147', by: 'ra', proj: 'chk', task: 'NW-147', zh: '把「地址表單無障礙檢查」拆成 3 個子任務', en: 'Split Address form accessibility audit into 3 subtasks', wzh: '讀屏順序、錯誤提示、鍵盤操作分開檢查，王悅可以先處理最常見的錯誤提示。', wen: 'Screen-reader order, error messages and keyboard support are checked separately, so Wang Yue can start with error messages.',
      applies: db => !!findTask(db, 'NW-147') && !Object.values(db.tasks).some(ts => ts.some(t => t.parent === 'NW-147')),
      apply: db => {
        [[T('讀屏順序', 'Screen-reader order'), 12, 1], [T('錯誤提示', 'Error messages'), 12, 1], [T('鍵盤操作', 'Keyboard support'), 13, 1]].forEach(([title, due, dur]) =>
          addTask(db, 'nw', { title, status: 'todo', owner: 'wy', due, pri: 3, proj: 'chk', parent: 'NW-147', activity: [{ who: 'ra', kind: 'event', zh: '經 taff 拆分建立', en: 'created by a split in taff', at: { zh: '剛剛', en: 'Just now' } }] }, { dur }));
        setTask(db, 'NW-147', {}, act('經 taff 拆分為 3 個子任務', 'split into 3 subtasks via taff'));
      } },
  ];


  // Companies and contacts (CRM) ---------------------------------------------
  // One contact record per person; projects, companies and tasks only hold links
  // (contact id + roles), so a name or company change shows up everywhere at once.
  // Rules (mirrored by constraints/triggers in db/schema.sql):
  //  1. A role may only be used where its scope allows (company / project / task).
  //  2. Exclusive roles (董事長 per company, 驗收人 per project or task) have one holder;
  //     assigning it moves it from the previous holder.
  //  3. A task contact is always a stakeholder of the task's project (added automatically).
  //  4. Removing a project stakeholder also removes their links on that project's tasks.
  //  5. Moving a contact to another company drops their roles at the old company.
  //  6. Deleting a contact deletes all of their links.
  const ROLES = [
    { k: 'decider', zh: '決策者', en: 'Decision maker', scopes: ['company', 'project', 'task'] },
    { k: 'chair', zh: '董事長', en: 'Chairman', scopes: ['company'], exclusive: true },
    { k: 'ops', zh: '運營負責人', en: 'Operations lead', scopes: ['company', 'project', 'task'] },
    { k: 'broker', zh: '項目中間人', en: 'Intermediary', scopes: ['project'] },
    { k: 'tech', zh: '技術對接人', en: 'Technical contact', scopes: ['project', 'task'] },
    { k: 'finance', zh: '財務聯繫人', en: 'Finance contact', scopes: ['company', 'project'] },
    { k: 'signoff', zh: '驗收人', en: 'Sign-off', scopes: ['project', 'task'], exclusive: true },
  ];
  const CRM_SEED = {
    seq: 20,
    companies: [
      { id: 'co1', org: 'nw', name: T('北風零售集團', 'Northwind Retail Group'), industry: T('零售', 'Retail') },
      { id: 'co2', org: 'nw', name: T('匯通支付', 'HuiTong Pay'), industry: T('支付', 'Payments') },
      { id: 'co3', org: 'nw', name: T('青藍顧問', 'Qinglan Advisory'), industry: T('顧問', 'Advisory') },
      { id: 'co4', org: 'qs', name: T('石川地產', 'Shikawa Properties'), industry: T('地產', 'Property') },
    ],
    contacts: [
      { id: 'ct1', org: 'nw', company: 'co1', name: T('黃志明', 'Wong Chi-ming'), title: T('董事長', 'Chairman'), phone: '+852 9123 4501', email: 'cm.wong@nwretail.hk' },
      { id: 'ct2', org: 'nw', company: 'co1', name: T('李佩欣', 'Lee Pui-yan'), title: T('營運總監', 'Operations director'), phone: '+852 9123 4502', email: 'py.lee@nwretail.hk' },
      { id: 'ct3', org: 'nw', company: 'co1', name: T('陳嘉豪', 'Chan Ka-ho'), title: T('數碼產品經理', 'Digital product manager'), phone: '+852 9123 4503', email: 'kh.chan@nwretail.hk' },
      { id: 'ct4', org: 'nw', company: 'co2', name: T('張穎', 'Cheung Wing'), title: T('商戶整合經理', 'Merchant integration manager'), phone: '+852 9876 1100', email: 'wing.cheung@htpay.hk' },
      { id: 'ct5', org: 'nw', company: 'co3', name: T('吳家樂', 'Ng Ka-lok'), title: T('合夥人', 'Partner'), phone: '+852 6234 7788', email: 'kalok@qinglan.hk' },
      { id: 'ct6', org: 'qs', company: 'co4', name: T('梁詠詩', 'Leung Wing-sze'), title: T('市場總監', 'Marketing director'), phone: '+852 6655 2201', email: 'ws.leung@shikawa.hk' },
    ],
    clients: { chk: 'co1', web: 'co4' },
    links: [
      { c: 'ct1', t: 'company', id: 'co1', roles: ['chair', 'decider'] },
      { c: 'ct2', t: 'company', id: 'co1', roles: ['ops'] },
      { c: 'ct1', t: 'project', id: 'chk', roles: ['decider'] },
      { c: 'ct2', t: 'project', id: 'chk', roles: ['ops', 'signoff'] },
      { c: 'ct3', t: 'project', id: 'chk', roles: ['tech'] },
      { c: 'ct4', t: 'project', id: 'chk', roles: ['tech'] },
      { c: 'ct5', t: 'project', id: 'chk', roles: ['broker'] },
      { c: 'ct2', t: 'task', id: 'NW-140', proj: 'chk', roles: ['signoff'] },
      { c: 'ct4', t: 'task', id: 'NW-138', proj: 'chk', roles: ['tech'] },
      { c: 'ct6', t: 'company', id: 'co4', roles: ['decider'] },
      { c: 'ct6', t: 'project', id: 'web', roles: ['decider', 'signoff'] },
    ],
  };
  // Integrity sweep, run whenever stored data is loaded. Repairs instead of failing so
  // older or hand-edited data can never leave dangling links. Returns what it fixed.
  function crmRepair(c) {
    const fixed = [];
    if (!Array.isArray(c.companies)) { c.companies = []; fixed.push('companies'); }
    if (!Array.isArray(c.contacts)) { c.contacts = []; fixed.push('contacts'); }
    if (!c.clients || typeof c.clients !== 'object') c.clients = {};
    if (typeof c.seq !== 'number') c.seq = 100;
    const coBy = {}; c.companies.forEach(x => { coBy[x.id] = x; });
    c.contacts.forEach(k => { if (k.company && (!coBy[k.company] || coBy[k.company].org !== k.org)) { fixed.push('company:' + k.id); k.company = null; } });
    Object.keys(c.clients).forEach(p => { if (c.clients[p] && !coBy[c.clients[p]]) { fixed.push('client:' + p); c.clients[p] = null; } });
    const ctBy = {}; c.contacts.forEach(k => { ctBy[k.id] = k; });
    const seen = new Set(), held = new Set(), out = [];
    c.links.forEach(l => {
      const k = ctBy[l.c], key = l.c + '|' + l.t + '|' + l.id;
      if (!k || !['company', 'project', 'task'].includes(l.t) || seen.has(key)) { fixed.push('link:' + key); return; }
      if (l.t === 'company' && k.company !== l.id) { fixed.push('link:' + key); return; }
      if (l.t === 'task' && !l.proj) { fixed.push('link:' + key); return; }
      const roles = [...new Set((l.roles || []).filter(r => roleOk(r, l.t)))].filter(r => { const R = ROLES.find(x => x.k === r); if (!R.exclusive) return true; const h = l.t + '|' + l.id + '|' + r; if (held.has(h)) return false; held.add(h); return true; });
      if (roles.length !== (l.roles || []).length) fixed.push('roles:' + key);
      seen.add(key); out.push({ ...l, roles });
    });
    out.filter(l => l.t === 'task').forEach(l => { const pk = l.c + '|project|' + l.proj; if (!seen.has(pk)) { seen.add(pk); out.push({ c: l.c, t: 'project', id: l.proj, roles: [] }); fixed.push('stake:' + pk); } });
    c.links = out; return fixed;
  }
  const crm = db => { if (!db.crm || !Array.isArray(db.crm.links)) db.crm = clone(CRM_SEED); return db.crm; };
  const roleOk = (k, t) => { const r = ROLES.find(x => x.k === k); return !!r && r.scopes.includes(t); };
  const linkOf = (c, t, id, cid) => c.links.find(l => l.t === t && l.id === id && l.c === cid);
  const projOfTask = (db, c, id, proj) => proj || (findTask(db, id) || {}).proj || ((c.links.find(l => l.t === 'task' && l.id === id) || {}).proj) || null;
  // Returns { replaced: [{ role, prev }], autoProject: bool }
  function crmSetRoles(db, t, id, cid, roles, opt) {
    const c = crm(db), out = { replaced: [], autoProject: false };
    roles = [...new Set((roles || []).filter(k => roleOk(k, t)))];
    let l = linkOf(c, t, id, cid);
    if (!l) { l = { c: cid, t, id, roles: [] }; if (t === 'task') l.proj = projOfTask(db, c, id, opt && opt.proj); c.links.push(l); }
    roles.forEach(k => { const r = ROLES.find(x => x.k === k); if (!r.exclusive) return; c.links.forEach(o => { if (o !== l && o.t === t && o.id === id && o.roles.includes(k)) { o.roles = o.roles.filter(x => x !== k); out.replaced.push({ role: k, prev: o.c }); } }); });
    l.roles = roles;
    if (t === 'task' && l.proj && !linkOf(c, 'project', l.proj, cid)) { c.links.push({ c: cid, t: 'project', id: l.proj, roles: [] }); out.autoProject = true; }
    return out;
  }
  const crmLink = (db, t, id, cid, roles, opt) => crmSetRoles(db, t, id, cid, roles || (linkOf(crm(db), t, id, cid) || {}).roles || [], opt);
  // Returns { cascade: number of task links removed }
  function crmUnlink(db, t, id, cid) {
    const c = crm(db); let cascade = 0;
    c.links = c.links.filter(l => { if (l.c !== cid) return true; if (l.t === t && l.id === id) return false; if (t === 'project' && l.t === 'task' && l.proj === id) { cascade++; return false; } return true; });
    return { cascade };
  }
  function crmAddCompany(db, org, row) { const c = crm(db); const id = 'co' + (++c.seq); c.companies.push({ id, org, name: row.name, industry: row.industry || T('', '') }); return id; }
  function crmAddContact(db, org, row) { const c = crm(db); const id = 'ct' + (++c.seq); c.contacts.push({ id, org, company: row.company || null, name: row.name, title: row.title || T('', ''), phone: row.phone || '', email: row.email || '' }); return id; }
  // Returns { dropped: number of company-level links removed }
  function crmSetCompany(db, cid, co) {
    const c = crm(db), k = c.contacts.find(x => x.id === cid); if (!k || k.company === co) return { dropped: 0 };
    const old = k.company, before = c.links.length; k.company = co || null;
    c.links = c.links.filter(l => !(l.c === cid && l.t === 'company' && l.id === old)); return { dropped: before - c.links.length };
  }
  function crmDeleteContact(db, cid) { const c = crm(db); const n = c.links.filter(l => l.c === cid).length; c.contacts = c.contacts.filter(x => x.id !== cid); c.links = c.links.filter(l => l.c !== cid); return { links: n }; }
  function crmSetClient(db, pid, co) { const c = crm(db); c.clients[pid] = co || null; }
  function seed() { return { v: VER, rev: 0, by: 'seed', seeded: { nw: 1, qs: 1, me: 1 }, finance: clone(FINANCE), tasks: clone(CORE), plan: clone(PLAN), deps: clone(DEPS), milestones: clone(MILESTONES), sugg: {}, crm: clone(CRM_SEED) }; }
  const validTask = t => t && typeof t.id === 'string' && t.title && typeof t.title.zh === 'string' && ['todo', 'doing', 'review', 'done'].includes(t.status);
  function valid(db) { return db && db.v === VER && db.tasks && typeof db.tasks === 'object' && Object.values(db.tasks).every(a => Array.isArray(a) && a.every(validTask)) && db.plan && Array.isArray(db.deps) && Array.isArray(db.milestones); }

  try { if (/[?&]reset\b/.test(location.search) || /reset/.test(location.hash)) localStorage.removeItem(KEY); } catch (e) {}
  let cache = null, cacheStr = null; const subs = new Set();
  function get() {
    let s = null; try { s = localStorage.getItem(KEY); } catch (e) {}
    if (s && s === cacheStr && cache) return cache;
    if (s) { try { const db = JSON.parse(s); if (valid(db)) { const fx = crmRepair(crm(db)); if (fx.length) console.info('[taff] repaired ' + fx.length + ' CRM records', fx); cache = db; cacheStr = s; return db; } } catch (e) {} try { localStorage.removeItem(KEY); } catch (e) {} }
    if (!cache) cache = seed(); return cache;
  }
  const body = db => JSON.stringify({ ...db, rev: 0, by: '' });
  function save(db, by) {
    const prev = get(); if (cacheStr && body(db) === body(prev)) return false;
    db.rev = (prev.rev || 0) + 1; db.by = by || 'app'; const s = JSON.stringify(db);
    try { localStorage.setItem(KEY, s); } catch (e) {}
    cache = db; cacheStr = s; subs.forEach(fn => { try { fn(db, db.by); } catch (e) { console.error(e); } }); return true;
  }
  function update(fn, by) { const db = clone(get()); fn(db); return save(db, by); }
  window.addEventListener('storage', e => { if (e.key !== KEY) return; cacheStr = null; cache = null; const db = get(); subs.forEach(fn => { try { fn(db, db.by); } catch (er) { console.error(er); } }); });

  // Team Tasks bridge -------------------------------------------------------
  const MUT = ['title', 'status', 'owner', 'agent', 'agentState', 'progress', 'due', 'pri', 'proj', 'parent', 'blocker', 'needs', 'sched'];
  function overlay(org, local) {
    const db = get(), remote = db.tasks[org]; if (!remote || !Array.isArray(local)) return local;
    const seeded = db.seeded && db.seeded[org], by = {}; remote.forEach(r => { by[r.id] = r; });
    const out = local.map(t => {
      const r = by[t.id]; if (!r) return t; const n = { ...t };
      MUT.forEach(k => { if (k in r) n[k] = r[k]; });
      if (seeded) { if ((r.activity || []).length) n.activity = [...(t.activity || []), ...r.activity]; }
      else if ((r.activity || []).length > (t.activity || []).length) n.activity = r.activity;
      return n;
    });
    const have = new Set(local.map(t => t.id));
    remote.forEach(r => { if (!have.has(r.id)) out.push({ desc: null, agent: null, agentState: null, parent: null, ...r, activity: Array.isArray(r.activity) ? r.activity : [] }); });
    return out;
  }
  function putOrgTasks(map, by) {
    return update(db => { Object.keys(map).forEach(org => { if (!Array.isArray(map[org])) return; db.tasks[org] = map[org].map(t => { const c = { ...t }; delete c.run; return c; }); if (db.seeded) db.seeded[org] = 0; }); }, by || 'teamtasks');
  }
  function maxSeq(org) { let mx = 0; (get().tasks[org] || []).forEach(t => { const n = parseInt(String(t.id).split('-')[1], 10); if (n > mx) mx = n; }); return mx; }

  // Shared progress model ---------------------------------------------------
  // Index days from 28 Sep 2026 (idx 0); Team Tasks day d -> idx d + 2.
  const IDX = 2, TODAY_IDX = TODAY + IDX;
  const pctOf = t => t.status === 'done' ? 100 : t.status === 'review' ? 90 : t.status === 'doing' ? (t.agent && t.progress != null ? 15 + t.progress * 15 : 50) : 0;
  const defDur = t => t.pri === 1 ? 3 : 2;
  function model(db, pv) {
    const m = {}, kids = {}, raw = {};
    Object.keys(db.tasks).forEach(org => db.tasks[org].forEach(t => { raw[t.id] = { t, org }; }));
    Object.values(raw).forEach(({ t, org }) => {
      if (t.due == null) return;
      const plan = db.plan[t.id] || {}; let dur = plan.dur || defDur(t), due = t.due;
      if (pv && pv.sh && (pv.id === t.id || pv.id === t.parent)) due += pv.sh;
      let start = due - dur + 1;
      if (pv && pv.id === t.id && pv.dd != null) { start = t.due - dur + 1; dur = pv.dd; }
      m[t.id] = { id: t.id, org, p: t.proj, parent: t.parent || null, zh: t.title.zh, en: t.title.en, s: start + IDX, d: dur, o: t.agent || t.owner, owner: t.owner, agent: t.agent, pr: pctOf(t), status: t.status, blocked: t.agentState === 'blocked', blocker: t.blocker || null };
    });
    (db.milestones || []).forEach(ms => { let day = ms.day; if (pv && pv.sh && pv.id === ms.id) day += pv.sh; m[ms.id] = { id: ms.id, p: ms.proj, ms: true, zh: ms.zh, en: ms.en, s: day + IDX, d: 0, parent: null, pr: 0 }; });
    Object.values(m).forEach(x => { if (x.parent && m[x.parent]) (kids[x.parent] = kids[x.parent] || []).push(x); });
    Object.keys(kids).forEach(pid => { const p = m[pid], ks = kids[pid]; const s = Math.min(...ks.map(k => k.s)), e = Math.max(...ks.map(k => k.s + k.d)); p.s = s; p.d = e - s; const tot = ks.reduce((a, k) => a + k.d, 0) || 1; p.pr = Math.round(ks.reduce((a, k) => a + k.pr * k.d, 0) / tot); p.hasKids = true; p.blockedKid = ks.some(k => k.blocked); });
    const top = Object.values(m).filter(x => !x.parent || !m[x.parent]);
    const order = id => { const r = raw[id]; return r ? Object.keys(raw).indexOf(id) : 1e6; };
    top.sort((a, b) => (a.ms - b.ms) || (a.s - b.s) || (order(a.id) - order(b.id)));
    const preds = {}; (db.deps || []).forEach(([a, b]) => { if (m[a] && m[b]) (preds[b] = preds[b] || []).push(a); });
    const endOf = t => t.ms ? t.s : t.s + t.d;
    const expOf = t => Math.max(0, Math.min(1, (TODAY_IDX - t.s) / (t.d || 1))) * 100;
    const behind = t => { if (t.ms || t.pr >= 100) return 0; const b = t.s >= TODAY_IDX ? 0 : Math.max(0, (expOf(t) - t.pr) / 100 * t.d); return t.blocked ? Math.max(b, 2) : b; };
    const fe = {}, vis = {};
    const fEnd = id => {
      if (fe[id] != null) return fe[id]; const t = m[id]; if (!t) return 0; if (vis[id]) return endOf(t); vis[id] = 1;
      let mp = 0; (preds[id] || []).forEach(p => { mp = Math.max(mp, fEnd(p)); }); (kids[id] || []).forEach(k => { mp = Math.max(mp, fEnd(k.id)); });
      let v; if (t.ms || t.hasKids) v = Math.max(endOf(t), mp); else if (t.pr >= 100) v = t.s + t.d; else if (t.s < TODAY_IDX) v = Math.max(t.s + t.d + behind(t), mp + t.d * (1 - t.pr / 100)); else v = Math.max(t.s, mp) + t.d;
      return (fe[id] = v);
    };
    const conflicts = new Set((db.deps || []).filter(([a, b]) => m[a] && m[b] && m[b].s < endOf(m[a])).map(([a, b]) => a + '>' + b));
    const crit = new Set(), risks = {};
    PROJECTS.forEach(p => {
      const all = Object.values(m).filter(x => x.p === p.id), its = top.filter(x => x.p === p.id); if (!its.length) return;
      const pe = Math.max(...its.map(endOf)), fc0 = Math.max(...all.map(x => fEnd(x.id)));
      const slip = Math.max(0, Math.round(fc0 - pe));
      const leaves = all.filter(x => !x.hasKids && !x.ms);
      const blockedT = leaves.find(x => x.blocked);
      let drv = null, bd = 0.5; leaves.forEach(x => { const b = behind(x); if (b > bd && !x.blocked) { bd = b; drv = x; } });
      const conf = (db.deps || []).find(([a, b]) => m[b] && m[b].p === p.id && conflicts.has(a + '>' + b));
      const level = (conf || slip >= 3) ? 'high' : (slip >= 1 || blockedT || drv) ? 'med' : 'low';
      const work = all.filter(x => !x.ms && !x.hasKids), tot = work.reduce((a, x) => a + x.d, 0) || 1;
      const prog = Math.round(work.reduce((a, x) => a + x.pr * x.d, 0) / tot);
      let cur = its.reduce((a, x) => endOf(x) >= endOf(a) ? x : a, its[0]), g = 0;
      while (cur && g++ < 40) { crit.add(cur.id); const ps = (preds[cur.id] || []).map(i => m[i]).filter(Boolean); if (!ps.length) break; cur = ps.reduce((a, b) => endOf(b) > endOf(a) ? b : a); }
      const lastMs = its.filter(x => x.ms).pop();
      const fin = (db.finance || FINANCE)[p.id] || null;
      risks[p.id] = { p, amount: fin ? fin.amount : null, collected: fin ? fin.collected : null, collectedPct: fin && fin.amount ? Math.round(fin.collected / fin.amount * 100) : null, pe, fc: pe + slip, slip, drv, drvPct: drv ? Math.round(expOf(drv) - drv.pr) : 0, blockedT, conf, level, prog, start: Math.min(...all.map(x => x.s)), lastMs };
    });
    const leavesAll = Object.values(m).filter(x => !x.ms && !x.hasKids);
    const live = leavesAll.filter(x => x.s <= TODAY_IDX && TODAY_IDX < x.s + x.d && x.pr < 100);
    const working = leavesAll.filter(x => x.agent && raw[x.id] && raw[x.id].t.agentState === 'working');
    const agentsActive = new Set(working.map(x => x.agent)).size;
    const review = leavesAll.filter(x => x.status === 'review');
    const unscheduled = Object.values(raw).filter(r => r.t.due == null).map(r => r.t);
    return { m, kids, top, preds, endOf, behind, conflicts, crit, risks, live, working, agentsActive, review, unscheduled, raw };
  }

  // Mutations used by taff --------------------------------------------------
  function shiftTask(id, sh, by) {
    return update(db => {
      const ms = db.milestones.find(x => x.id === id); if (ms) { ms.day += sh; return; }
      Object.keys(db.tasks).forEach(org => { db.tasks[org] = db.tasks[org].map(t => (t.id === id || t.parent === id) && t.due != null ? { ...t, due: t.due + sh } : t); });
    }, by || 'taff');
  }
  function resizeTask(id, dur, by) {
    return update(db => { const t = findTask(db, id); if (!t || t.due == null) return; const old = (db.plan[id] && db.plan[id].dur) || defDur(t); const start = t.due - old + 1; db.plan[id] = { ...(db.plan[id] || {}), dur }; setTask(db, id, { due: start + dur - 1 }); }, by || 'taff');
  }
  function snapshot() { return clone(get()); }
  function restore(snap, keys, by) { return update(db => { (keys || ['tasks', 'plan', 'deps', 'milestones']).forEach(k => { db[k] = clone(snap[k]); }); }, by || 'taff'); }
  function applySugg(id, by) {
    const s = SUGG.find(x => x.id === id); if (!s) return;
    update(db => {
      const before = clone(db.tasks), beforePlan = clone(db.plan); s.apply(db);
      const prev = [], added = [];
      Object.keys(db.tasks).forEach(org => db.tasks[org].forEach(t => { const b = (before[org] || []).find(x => x.id === t.id); if (!b) added.push(t.id); else if (JSON.stringify(b) !== JSON.stringify(t)) prev.push(b); }));
      db.sugg[id] = { st: 'applied', prev, added, plan: beforePlan };
    }, by || 'taff');
  }
  function dismissSugg(id, by) { update(db => { db.sugg[id] = { st: 'dismissed' }; }, by || 'taff'); }
  function undoSugg(id, by) {
    update(db => {
      const rec = db.sugg[id]; if (!rec) return;
      if (rec.st === 'applied') {
        Object.keys(db.tasks).forEach(org => { db.tasks[org] = db.tasks[org].filter(t => !(rec.added || []).includes(t.id)).map(t => (rec.prev || []).find(p => p.id === t.id) || t); });
        (rec.added || []).forEach(a => { delete db.plan[a]; });
      }
      delete db.sugg[id];
    }, by || 'taff');
  }
  function suggestions(db) { return SUGG.map(s => ({ ...s, state: db.sugg[s.id] ? db.sugg[s.id].st : (s.applies(db) ? 'pending' : 'elsewhere') })); }

  window.TaffStore = {
    KEY, TODAY, TODAY_IDX, IDX, ORGS, PROJECTS, PEOPLE, FINANCE, money, SERVICES, DATA, VALUES, CHAIN,
    get, update, save, subscribe: fn => { subs.add(fn); return () => subs.delete(fn); },
    overlay, putOrgTasks, maxSeq, model, pctOf, findTask, orgOf, nextId, addTask, setTask,
    shiftTask, resizeTask, snapshot, restore, applySugg, dismissSugg, undoSugg, suggestions,
    ROLES, crm, crmRepair, crmAudit: db => crmRepair(clone(crm(db))), crmSetRoles, crmLink, crmUnlink, crmAddCompany, crmAddContact, crmSetCompany, crmDeleteContact, crmSetClient,
    reset() { try { localStorage.removeItem(KEY); } catch (e) {} cache = seed(); cacheStr = null; subs.forEach(fn => fn(cache, 'reset')); },
  };
})();
