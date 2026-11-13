// Operation templates (spec: docs/spec/operation-templates.md). A template is
// data: applying it creates one project per sector and one task per indicator.
import {
  type infer as Infer,
  number,
  strictObject,
  enum as zodEnum,
} from "zod/mini";

export type OperationIndicator = {
  /** Task label naming the indicator kind. */
  label: string;
  /** Bilingual indicator text, used in the task title. */
  name: string;
};
export type OperationSector = {
  /** Project name: Chinese then English, at most 100 characters. */
  project: string;
  /** Task label tagging every task of this sector, at most 40 characters. */
  label: string;
  leading: OperationIndicator;
  result: OperationIndicator;
};

const LEADING = "領先指標";
const RESULT = "結果指標";
const sector = (
  label: string,
  english: string,
  leading: string,
  result: string,
): OperationSector => ({
  project: `${label} ${english}`,
  label,
  leading: { label: LEADING, name: leading },
  result: { label: RESULT, name: result },
});

/** 通用營運模板 / Generic operation template: the six recommended sectors. */
export const GENERIC_OPERATION_SECTORS: readonly OperationSector[] = [
  sector(
    "財務與現金",
    "Finance & Cash",
    "逾期應收 Overdue receivables",
    "收入與毛利對預算 Revenue and margin vs budget",
  ),
  sector(
    "客戶與市場",
    "Customers & Market",
    "新增合格商機 New qualified pipeline",
    "留存或複購率 Retention or repeat rate",
  ),
  sector(
    "營運與交付",
    "Operations & Delivery",
    "工作量對產能 Workload vs capacity",
    "準時交付與品質投訴 On-time delivery and complaints",
  ),
  sector(
    "人才與組織",
    "People & Organization",
    "關鍵職缺空缺天數 Days critical roles open",
    "關鍵人才流失 Key people lost",
  ),
  sector(
    "風險與安全",
    "Risk & Security",
    "逾期整改事項 Overdue remediation items",
    "事件數 Incidents",
  ),
  sector(
    "未來",
    "Future (strategy, product, succession)",
    "戰略里程碑 Strategic milestones",
    "新業務收入占比 Revenue share from new lines",
  ),
];

export const operationTemplateKeySchema = zodEnum(["generic-operation"]);
export type OperationTemplateKey = Infer<typeof operationTemplateKeySchema>;
export const OPERATION_TEMPLATES: Record<
  OperationTemplateKey,
  readonly OperationSector[]
> = { "generic-operation": GENERIC_OPERATION_SECTORS };

/** Title of an indicator task: `領先指標：逾期應收 Overdue receivables`. */
export const indicatorTaskTitle = (indicator: OperationIndicator) =>
  `${indicator.label}：${indicator.name}`;

export const operationTemplateResultSchema = strictObject({
  template: operationTemplateKeySchema,
  createdProjects: number(),
  createdTasks: number(),
});
export type OperationTemplateResult = Infer<
  typeof operationTemplateResultSchema
>;
