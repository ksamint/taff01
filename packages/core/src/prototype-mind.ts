import {
  mindEdges,
  mindNodeSources,
  mindNodes,
  mindSources,
  type Transaction,
} from "@taff/db";
import { prototypeId } from "@taff/schemas/prototype-data";
import { eq } from "drizzle-orm";
import { type Actor, can } from "./permissions";

/*
 * Northwind's demo mind map (M18), ported as concept from prototype v2
 * (Team Tasks Module Plan.dc.html: MIND_LAYERS, MIND, SOURCES, NODE_SRC,
 * MIND_E). Every text is a person's research note with its sources, stored
 * in `note`; nothing here is, or is labelled as, model output (plan §2.4
 * item 12). Strength maps the prototype's 50–84 score onto 1–5 and momentum
 * up/flat/down onto 1/0/−1.
 */
type Momentum = "up" | "flat" | "down";
const N: [
  key: string,
  layer: number,
  angle: number,
  score: number,
  momentum: Momentum,
  title: string,
  note: string,
][] = [
  ["u1", 0, 315, 84, "up", "歸屬感", "「被認得」的感覺比折扣更能帶來回頭客。"],
  [
    "u2",
    0,
    45,
    78,
    "up",
    "確定感",
    "經濟前景不明朗時，消費者偏好可預期的價格與品質。",
  ],
  ["u4", 0, 135, 74, "up", "療癒", "食物被視為自我照顧，而不只是填飽肚子。"],
  ["u3", 0, 225, 70, "flat", "自我表達", "餐桌成為展示品味與身份的舞台。"],
  ["c6", 1, 20, 80, "up", "性價比理性", "「值得」取代「便宜」成為選擇標準。"],
  ["c3", 1, 62, 61, "up", "食材溯源", "產地、批次與處理方式成為信任的依據。"],
  ["c4", 1, 108, 66, "up", "輕養生", "少油少鹽，但不犧牲味道。"],
  ["c2", 1, 175, 69, "up", "一人食", "獨自用餐不再尷尬，而是主動的選擇。"],
  [
    "c5",
    1,
    255,
    58,
    "down",
    "打卡社交",
    "熱度仍在，但只靠「好看」的新鮮感正在下降。",
  ],
  [
    "c1",
    1,
    315,
    72,
    "up",
    "懷舊港味",
    "茶餐廳與冰室元素正被年輕一代重新詮釋。",
  ],
  ["g2", 2, 32, 74, "flat", "雙職家庭", "決策快，重視孩子吃進肚裏的食材。"],
  [
    "g5",
    2,
    128,
    77,
    "flat",
    "商務白領",
    "午飯時間有限，願意為健康與效率付溢價。",
  ],
  [
    "g1",
    2,
    210,
    68,
    "up",
    "都市獨居人士",
    "五分一住戶獨居，增長主要來自 45 歲以上。重視合適份量與個人空間。",
  ],
  ["g4", 2, 282, 62, "flat", "Z 世代學生", "對復古元素有好感，但對價格敏感。"],
  [
    "g3",
    2,
    342,
    55,
    "up",
    "銀髮新食客",
    "單身長者住戶十年增加 58%。有時間、有預算，重視熟悉味道與衛生。",
  ],
  [
    "s2",
    3,
    40,
    72,
    "flat",
    "週末家庭聚餐",
    "設兒童份量及開放式廚房，回應食材安全的顧慮。",
  ],
  ["s3", 3, 100, 81, "flat", "午市快餐", "15 分鐘內出餐的輕養生套餐。"],
  ["s6", 3, 158, 64, "up", "健康外賣", "營養標示清晰的單人外賣盒。"],
  ["s1", 3, 212, 59, "up", "深夜一人餐", "深夜時段增設吧枱座位及一人份套餐。"],
  [
    "s5",
    3,
    272,
    50,
    "down",
    "打卡下午茶",
    "由「好看」轉向「好味而且有故事」的懷舊茶點。",
  ],
  [
    "s4",
    3,
    332,
    70,
    "flat",
    "節慶團圓",
    "推出可預訂的節慶家庭套餐，並標示食材來源。",
  ],
];
const S: [key: string, title: string, url: string, note: string][] = [
  [
    "troisi",
    "Troisi & Gabriel (2011). Psychological Science, 22(6), 747–753",
    "https://doi.org/10.1177/0956797611407931",
    "兩項實驗顯示，「安慰食物」會自動喚起與人際關係相關的概念，並能減輕孤獨感。",
  ],
  [
    "ong",
    "Ong, IJzerman & Leung (2015). Frontiers in Psychology, 6, 314",
    "https://doi.org/10.3389/fpsyg.2015.00314",
    "在美國、荷蘭與新加坡共 649 人的重複實驗中，減輕孤獨感的效果只在美國樣本重現。應用到香港前需要本地驗證。",
  ],
  [
    "loveland",
    "Loveland, Smeesters & Mandel (2010). Journal of Consumer Research, 37(3), 393–408",
    "https://doi.org/10.1086/653043",
    "歸屬需求被喚起時，消費者更偏好懷舊產品；實際消費懷舊產品（而非只是看到或選擇）能滿足這種需求。",
  ],
  [
    "euro25",
    "Euromonitor International, Top Global Consumer Trends 2025",
    "https://www.euromonitor.com/press/press-releases/november-2024/euromonitor-international-reveals-top-global-consumer-trends-for-2025",
    "「Wiser Wallets」：只有 18% 受訪者表示 2024 年經常衝動消費；72% 擔心日常開支上升。品質、功能、便利與價格是主要購買因素。",
  ],
  [
    "euroTime",
    "Euromonitor International, Top Global Consumer Trends 2025 (time)",
    "https://licensinginternational.org/news/key-consumer-trends-in-2025/",
    "50% 消費者願意為節省時間付更多錢。",
  ],
  [
    "mck",
    "McKinsey, Future of Wellness survey 2025",
    "https://www.mckinsey.com/industries/consumer-packaged-goods/our-insights/future-of-wellness-trends",
    "84% 美國消費者視健康為「首要」或「重要」優先事項，中國為 94%。約半數美國、英國、德國消費者過去一年買過功能性營養產品。",
  ],
  [
    "mintel",
    "Mintel, Global Food & Drink Trends 2025",
    "https://www.mintel.com/press-centre/mintel-announces-global-food-and-drink-trends-for-2025/",
    "「Chain Reaction」：供應鏈受干擾時，品牌需要讓消費者信任新的產地與食材；食物在情緒健康管理中的角色會增加。",
  ],
  [
    "census",
    "香港政府統計處，2021 年人口普查：單人住戶",
    "https://www.census2021.gov.hk/doc/pub/21c-One-Person-Households.pdf",
    "2021 年全港有 538,324 個單人住戶，佔家庭住戶 20%，較 2011 年增加 33%。增長主要來自 45 歲及以上人士，25–44 歲單人住戶輕微下降。",
  ],
  [
    "censusOld",
    "香港政府統計處，2021 年人口普查：家庭住戶",
    "https://www.census2021.gov.hk/doc/pub/21C_Articles_Household.pdf",
    "單身長者住戶由 2011 年的 119,376 戶增至 2021 年的 188,569 戶，增幅 58%。",
  ],
  [
    "koponen",
    "Koponen & Mustonen (2022). Journal of Consumer Culture, 22(2)",
    "https://doi.org/10.1177/1469540520955219",
    "獨自用餐被視為更專注享受食物的方式，也是一種與志趣相投者「匿名同桌」的新型共餐。",
  ],
  [
    "herseo",
    "Her & Seo (2018). International Journal of Hospitality Management, 70, 16–24",
    "https://www.sciencedirect.com/science/article/abs/pii/S0278431916304431",
    "其他食客是否同樣獨自用餐，是獨食意願的主要預測因素；作用經由預期孤獨感與被他人負面評價的擔憂。",
  ],
  [
    "huang",
    "Huang, Feng & Wong (2025). International Journal of Hospitality Management, 130, 104226",
    "https://doi.org/10.1016/j.ijhm.2025.104226",
    "獨食研究的系統性文獻回顧，整理了動機、體驗與餐廳設計的研究結果。",
  ],
];
const NODE_SOURCES: Record<string, string[]> = {
  u1: ["troisi", "loveland"],
  u2: ["euro25", "loveland"],
  u4: ["troisi", "ong", "mintel", "mck"],
  c6: ["euro25"],
  c3: ["mintel"],
  c4: ["mck", "mintel"],
  c2: ["koponen", "huang", "census"],
  c1: ["loveland"],
  g1: ["census"],
  g3: ["censusOld", "census"],
  s3: ["euroTime", "mck"],
  s6: ["mck", "euroTime"],
  s1: ["herseo", "koponen"],
  s4: ["loveland"],
};
const E: [string, string][] = [
  ["u1", "c1"],
  ["u1", "c5"],
  ["u2", "c6"],
  ["u2", "c3"],
  ["u2", "c4"],
  ["u4", "c4"],
  ["u4", "c2"],
  ["u3", "c2"],
  ["u3", "c5"],
  ["c1", "g3"],
  ["c1", "g4"],
  ["c3", "g3"],
  ["c3", "g2"],
  ["c6", "g2"],
  ["c4", "g5"],
  ["c2", "g5"],
  ["c2", "g1"],
  ["c5", "g1"],
  ["c5", "g4"],
  ["g2", "s2"],
  ["g3", "s2"],
  ["g2", "s4"],
  ["g3", "s4"],
  ["g5", "s3"],
  ["g5", "s6"],
  ["g1", "s6"],
  ["g1", "s1"],
  ["g4", "s5"],
  ["g1", "s5"],
];
export const prototypeMindCounts = {
  nodes: N.length,
  sources: S.length,
  edges: E.length,
  nodeSources: Object.values(NODE_SOURCES).flat().length,
};
const MOMENTUM: Record<Momentum, number> = { up: 1, flat: 0, down: -1 };
/** The prototype's 50–84 score on a 1–5 scale. */
export const mindStrength = (score: number) =>
  Math.min(5, Math.max(1, Math.round((score - 45) / 8)));

/** Seeds once per workspace: later edits and removed links stay as they are. */
export async function seedMindMap(
  tx: Transaction,
  workspaceId: string,
  owner: Actor,
) {
  if (!can(owner, "mind:write", { workspaceId }))
    throw new Error("Prototype mind map permission required");
  const node = (key: string) =>
    prototypeId("mindNode", "nw", N.findIndex((row) => row[0] === key) + 1);
  const source = (key: string) =>
    prototypeId("mindSource", "nw", S.findIndex((row) => row[0] === key) + 1);
  if (
    (
      await tx
        .select({ id: mindNodes.id })
        .from(mindNodes)
        .where(eq(mindNodes.id, node("u1")))
    ).length
  )
    return;
  for (const [key, layer, angle, score, momentum, title, note] of N)
    await tx.insert(mindNodes).values({
      id: node(key),
      workspaceId,
      title,
      layer,
      angle: angle.toFixed(2),
      strength: mindStrength(score),
      momentum: MOMENTUM[momentum],
      note,
    });
  for (const [key, title, url, note] of S)
    await tx
      .insert(mindSources)
      .values({ id: source(key), workspaceId, title, url, note });
  let link = 0;
  for (const [key, keys] of Object.entries(NODE_SOURCES))
    for (const sourceKey of keys)
      await tx.insert(mindNodeSources).values({
        id: prototypeId("mindNodeSource", "nw", ++link),
        workspaceId,
        nodeId: node(key),
        sourceId: source(sourceKey),
      });
  for (const [index, [from, to]] of E.entries())
    await tx.insert(mindEdges).values({
      id: prototypeId("mindEdge", "nw", index + 1),
      workspaceId,
      fromNodeId: node(from),
      toNodeId: node(to),
      kind: "relates",
    });
}
