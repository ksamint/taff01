// Taff's assessment against the project-management catalog of the func-map
// skill (.claude/skills/func-map/catalogs/project-management.ts). One mark per
// catalog function. Every `where` id is an object of the OMV model
// (architecture/omv.json), so a claim cannot outlive the code it points at.
import type { Assessment } from "../../.claude/skills/func-map/scripts/func-map.ts";

export const ASSESSMENT: Assessment = {
  subject: "Taff",
  evidence: "objects of Taff's own OMV model, checked against the code",
  marks: {
    "organization-boundary-data-permission": {
      status: "yes",
      where: ["concept:organization", "module:orgs"],
    },
    "teams-inside-organization-settings": {
      status: "no",
      note: "Members belong to the organization directly.",
    },
    "level-above-organization": {
      status: "no",
      where: ["concept:org_group"],
      note: "Marked not modelled. Search and the brief can read across organizations.",
    },
    "goals-measure-target": {
      status: "no",
      note: "Sector indicators are named but carry no values.",
    },
    "initiatives-efforts-advance-goals": { status: "no" },
    "portfolios-projects-managed-reported": {
      status: "partial",
      where: ["concept:brief", "concept:exported_image"],
      note: "The brief and the organization export show all projects; there is no portfolio object.",
    },
    projects: { status: "yes", where: ["concept:project", "module:projects"] },
    "phases-sections-inside-project": {
      status: "no",
      where: ["concept:subproject"],
      note: "Marked not modelled. Open decision.",
    },
    "milestones-checkpoints": {
      status: "yes",
      where: ["concept:milestone", "module:planning"],
    },
    "tasks-subtasks": {
      status: "yes",
      where: ["concept:task", "concept:subtask"],
      note: "No limit on subtask depth.",
    },
    "task-several-projects": {
      status: "no",
      note: "A task has at most one project.",
    },
    labels: { status: "yes", where: ["concept:label"] },
    "custom-fields": { status: "no" },
    "views-regroup-work-template": {
      status: "yes",
      where: ["concept:sectors", "module:sectors"],
      note: "Six fixed sector labels.",
    },
    "project-templates-blueprints": {
      status: "no",
      note: "The operation template regroups tasks; it does not create a project.",
    },
    "dependencies-between-tasks-milestones": {
      status: "yes",
      where: ["concept:dependency"],
    },
    "other-task-links-related": { status: "no" },
    "due-dates": { status: "yes", where: ["concept:due_date"] },
    "calendar-blocks-repeat": {
      status: "yes",
      where: ["concept:schedule_block", "module:calendar"],
    },
    "gantt-dependencies-critical-path": {
      status: "yes",
      where: ["concept:plan", "concept:gantt", "module:planning"],
    },
    "forecast-finish-lateness": {
      status: "yes",
      where: ["concept:gantt", "concept:completion"],
    },
    "saved-baseline-variance-against": { status: "no" },
    "timeline-across-several-projects": {
      status: "no",
      note: "The timeline is per project.",
    },
    "cycles-sprints-iterations": { status: "no" },
    "appetite-fix-time-vary": {
      status: "partial",
      where: ["concept:agent"],
      note: "Only agent runs have a fixed limit of time and cost.",
    },
    "hill-chart-figuring-it": { status: "no" },
    "workload-capacity-planning": {
      status: "partial",
      where: ["module:assistant"],
      note: "The brief answers who carries the most; nothing plans capacity.",
    },
    "if-scenarios-before-committing": { status: "no" },
    "board-list-today-view": {
      status: "yes",
      where: ["concept:board", "module:tasks"],
    },
    "fixed-set-task-states": {
      status: "yes",
      where: ["concept:task"],
      note: "To do, in progress, waiting for review, done.",
    },
    "configurable-states-team-project": { status: "no" },
    "rules-state-change-who": {
      status: "partial",
      where: [
        "function:task:status",
        "function:task:finish",
        "function:task:review",
      ],
      note: "The rules exist in the permission function and are not configurable.",
    },
    automations: { status: "no" },
    "request-forms-intake-queues": { status: "no" },
    "quick-capture-plain-language": {
      status: "yes",
      where: ["module:tasks"],
      note: "Quick Add reads date, priority, project and label.",
    },
    "personal-inbox-needs-me": {
      status: "yes",
      where: ["concept:inbox_item", "module:inbox"],
    },
    "comments-mentions": { status: "yes", where: ["concept:comment"] },
    "search-across-organization": { status: "yes", where: ["module:tasks"] },
    "documents-beside-work": { status: "no" },
    "map-ideas-evidence-sources": {
      status: "yes",
      where: ["concept:mind_node", "concept:source", "module:mind"],
    },
    "review-deliverable-approve-request": {
      status: "partial",
      where: ["concept:review", "concept:deliverable"],
      note: "For agent deliverables. Work by people has no review step.",
    },
    "admin-member-guest": {
      status: "yes",
      where: ["concept:role", "module:orgs"],
    },
    "roles-towards-thing-owner": {
      status: "yes",
      where: ["role:owner", "role:worker", "role:person_in_charge"],
    },
    "table-who-may-do": { status: "yes", where: ["module:access"] },
    "audit-log": {
      status: "yes",
      where: ["concept:audit_record", "module:audit"],
    },
    "email-username-phone-sign": {
      status: "yes",
      where: ["concept:user", "module:identity"],
    },
    "single-sign-user-provisioning": { status: "no" },
    "agents-members-given-work": {
      status: "yes",
      where: ["concept:agent", "role:agent"],
    },
    "run-step-log-deliverables": {
      status: "yes",
      where: ["concept:run", "concept:run_event", "concept:deliverable"],
    },
    "agent-may-do-allow": { status: "yes", where: ["concept:capability"] },
    "request-waits-person-expiry": { status: "yes", where: ["concept:grant"] },
    "person-accepts-result-agent": {
      status: "yes",
      where: ["concept:review", "function:task:finish"],
    },
    "acceptance-criteria-stated-task": {
      status: "partial",
      where: ["concept:review"],
      note: "Three fixed review checks; a task has no criteria field.",
    },
    "cost-time-limit-agent": {
      status: "yes",
      where: ["concept:run", "concept:agent"],
    },
    "cost-result-including-failed": {
      status: "no",
      note: "Run cost is not added up per task or project.",
    },
    "agents-any-provider-through": {
      status: "yes",
      where: ["concept:token", "module:access"],
      note: "MCP with OAuth; the same permission function as a person.",
    },
    "log-agent-call": { status: "yes", where: ["concept:tool_call"] },
    "agent-memory-carries-across": { status: "no" },
    "building-agents-triggers-without": { status: "no" },
    "daily-brief-questions-about": {
      status: "yes",
      where: ["concept:brief", "module:assistant"],
    },
    "suggestions-person-applies-undoes": {
      status: "yes",
      where: ["concept:suggestion"],
    },
    "person-s-health-update": {
      status: "no",
      note: "Risk is computed; nobody states it.",
    },
    "risk-computed-plan": {
      status: "yes",
      where: ["concept:completion", "module:planning"],
    },
    "dashboards-across-projects": {
      status: "partial",
      where: ["concept:brief"],
      note: "The brief shows totals; there is no configurable dashboard.",
    },
    "personal-daily-digest": { status: "yes", where: ["concept:digest"] },
    "scheduled-summaries-stakeholders-share": {
      status: "yes",
      where: [
        "concept:summary",
        "concept:audience",
        "concept:share_link",
        "module:summaries",
      ],
    },
    "view-exported-image": {
      status: "yes",
      where: ["concept:exported_image", "module:export"],
    },
    "notification-choices-quiet-hours": {
      status: "yes",
      where: ["concept:notification_setting"],
    },
    "graph-people-work-companies": {
      status: "yes",
      where: ["concept:relations_graph", "module:relations"],
    },
    "client-companies-contacts": {
      status: "yes",
      where: ["concept:company", "concept:contact", "module:crm"],
    },
    "named-outside-roles-project": {
      status: "yes",
      where: ["concept:stakeholder"],
    },
    "commercial-stage-lead-closed": {
      status: "yes",
      where: ["concept:project"],
    },
    "contract-amount-payments-received": {
      status: "yes",
      where: ["concept:contract", "concept:payment"],
    },
    "budget-against-actual-cost": { status: "no" },
    "time-tracking": { status: "no" },
    "staffing-utilization-forecast": { status: "no" },
    "profit-margin-project": {
      status: "no",
      note: "Money in is known; money out is not.",
    },
    invoicing: { status: "no" },
    "deciding-which-work-fund": { status: "no" },
    "rest-interface": { status: "yes", where: ["module:kernel"] },
    "tool-interface-agents": { status: "yes", where: ["module:access"] },
    "live-updates-open-screen": { status: "yes", where: ["module:audit"] },
    "installable-web-app-three": {
      status: "yes",
      note: "English, Simplified and Traditional Chinese.",
    },
    "native-phone-apps": { status: "no" },
    "ready-made-integrations": {
      status: "partial",
      note: "E-mail, SMS and a private WeChat approval bridge.",
    },
    "self-hosted-open-licence": { status: "yes", note: "MIT licence." },
  },
};
