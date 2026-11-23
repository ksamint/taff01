//! Timeline read model. Tasks span whole days and milestones mark the end of a day.

use crate::TaskStatus;
use chrono::{Datelike, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};

impl TaskStatus {
    fn progress(self) -> f64 {
        match self {
            Self::Todo => 0.0,
            Self::InProgress => 50.0,
            Self::NeedsReview => 90.0,
            Self::Done => 100.0,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPlan {
    pub start_date: NaiveDate,
    pub duration_days: i32,
    pub version: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanTask {
    pub id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub status: TaskStatus,
    pub priority: i32,
    pub due_date: Option<NaiveDate>,
    pub plan: Option<TaskPlan>,
    pub owner_id: String,
    pub worker_id: Option<String>,
    pub worker_is_agent: bool,
    pub blocked: bool,
    pub version: i32,
}

#[derive(Debug, Deserialize)]
pub struct PlanMilestone {
    pub id: String,
    pub name: String,
    pub date: NaiveDate,
    pub version: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EndKind {
    Task,
    Milestone,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PlanEnd {
    pub kind: EndKind,
    pub id: String,
}

#[derive(Debug, Deserialize)]
pub struct PlanDependency {
    pub id: String,
    pub from: PlanEnd,
    pub to: PlanEnd,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanFinance {
    pub contract_amount: Option<String>,
    pub currency: Option<String>,
    pub collected: String,
}

#[derive(Debug, Deserialize)]
pub struct PlanInput {
    pub today: NaiveDate,
    pub tasks: Vec<PlanTask>,
    pub milestones: Vec<PlanMilestone>,
    pub dependencies: Vec<PlanDependency>,
    pub finance: Option<PlanFinance>,
}

struct Node {
    start: i32,
    end: i32,
    progress: f64,
    blocked: bool,
    parent: Option<usize>,
    children: Vec<usize>,
}

impl Node {
    fn duration(&self) -> i32 {
        self.end - self.start
    }
}

const EPOCH: i32 = 719_163;

fn day(date: NaiveDate) -> i32 {
    date.num_days_from_ce() - EPOCH
}

fn civil(day: i32) -> String {
    NaiveDate::from_num_days_from_ce_opt(day + EPOCH)
        .expect("forecast day fits the civil calendar")
        .to_string()
}

fn last_day(point: f64) -> String {
    civil((point - 1e-9).ceil() as i32 - 1)
}

fn resolve(
    index: usize,
    tasks: &[PlanTask],
    children: &[Vec<usize>],
    resolved: &mut [bool],
    nodes: &mut [Option<Node>],
) {
    if resolved[index] {
        return;
    }
    resolved[index] = true;
    let task = &tasks[index];
    let mut active = Vec::new();
    for &child in &children[index] {
        resolve(child, tasks, children, resolved, nodes);
        if nodes[child].is_some() {
            active.push(child);
        }
    }
    let (start, end, progress, blocked) = if active.is_empty() {
        let (start, end) = if let Some(plan) = &task.plan {
            let start = day(plan.start_date);
            (start, start + plan.duration_days)
        } else if let Some(due) = task.due_date {
            let end = day(due) + 1;
            (end - if task.priority == 1 { 3 } else { 2 }, end)
        } else {
            return;
        };
        (start, end, task.status.progress(), task.blocked)
    } else {
        let (mut start, mut end, mut duration, mut completed, mut blocked) =
            (i32::MAX, i32::MIN, 0.0, 0.0, task.blocked);
        for &child in &active {
            let node = nodes[child].as_mut().expect("resolved child");
            start = start.min(node.start);
            end = end.max(node.end);
            duration += f64::from(node.duration());
            completed += node.progress * f64::from(node.duration());
            blocked |= node.blocked;
            node.parent = Some(index);
        }
        (start, end, completed / duration.max(1.0), blocked)
    };
    nodes[index] = Some(Node {
        start,
        end,
        progress,
        blocked,
        parent: None,
        children: active,
    });
}

fn visit(index: usize, depth: usize, nodes: &[Option<Node>], ordered: &mut Vec<(usize, usize)>) {
    ordered.push((index, depth));
    let mut children = nodes[index]
        .as_ref()
        .expect("visible node")
        .children
        .clone();
    children.sort_by_key(|&child| (nodes[child].as_ref().expect("visible child").start, child));
    for child in children {
        visit(child, depth + 1, nodes, ordered);
    }
}

fn behind(task: Option<&PlanTask>, node: &Node, today: i32) -> f64 {
    let Some(task) = task else { return 0.0 };
    if node.progress >= 100.0 {
        return 0.0;
    }
    let duration = f64::from(node.duration());
    let expected = (f64::from(today - node.start) / duration.max(1.0)).clamp(0.0, 1.0) * 100.0;
    let late = ((expected - node.progress) / 100.0 * duration).max(0.0);
    if task.blocked { late.max(2.0) } else { late }
}

struct Forecast<'a> {
    tasks: &'a [PlanTask],
    nodes: &'a [Option<Node>],
    predecessors: &'a [Vec<usize>],
    today: i32,
    visiting: HashSet<usize>,
    ends: Vec<Option<f64>>,
}

impl Forecast<'_> {
    fn end(&mut self, index: usize) -> f64 {
        if let Some(value) = self.ends[index] {
            return value;
        }
        let node = self.nodes[index].as_ref().expect("visible node");
        let end = f64::from(node.end);
        if !self.visiting.insert(index) {
            return end;
        }
        let mut after: f64 = 0.0;
        for &prev in self.predecessors[index].iter().chain(&node.children) {
            after = after.max(self.end(prev));
        }
        let duration = f64::from(node.duration());
        let value = if index >= self.tasks.len() || !node.children.is_empty() {
            end.max(after)
        } else if node.progress >= 100.0 {
            end
        } else if node.start < self.today {
            (end + behind(self.tasks.get(index), node, self.today))
                .max(after + duration * (1.0 - node.progress / 100.0))
        } else {
            f64::from(node.start).max(after) + duration
        };
        self.visiting.remove(&index);
        self.ends[index] = Some(value);
        value
    }
}

pub fn build_plan_model(input: &PlanInput) -> Value {
    let task_count = input.tasks.len();
    let mut milestones: Vec<_> = input.milestones.iter().collect();
    milestones.sort_by_key(|milestone| (milestone.date, milestone.id.as_str()));
    let size = task_count + milestones.len();
    let today = day(input.today);
    let mut nodes: Vec<Option<Node>> = (0..size).map(|_| None).collect();
    let mut children = vec![Vec::new(); task_count];
    let mut index = HashMap::new();
    for (i, task) in input.tasks.iter().enumerate() {
        index.insert((EndKind::Task, task.id.as_str()), i);
    }
    for (i, task) in input.tasks.iter().enumerate() {
        if let Some(parent) = task
            .parent_id
            .as_deref()
            .and_then(|id| index.get(&(EndKind::Task, id)))
        {
            children[*parent].push(i);
        }
    }
    let mut resolved = vec![false; task_count];
    for i in 0..task_count {
        resolve(i, &input.tasks, &children, &mut resolved, &mut nodes);
    }
    for (i, milestone) in milestones.iter().enumerate() {
        let position = task_count + i;
        let point = day(milestone.date) + 1;
        index.insert((EndKind::Milestone, milestone.id.as_str()), position);
        nodes[position] = Some(Node {
            start: point,
            end: point,
            progress: 0.0,
            blocked: false,
            parent: None,
            children: Vec::new(),
        });
    }
    let node_at = |i: usize| nodes[i].as_ref().expect("visible node");
    let mut top: Vec<_> = (0..task_count)
        .filter(|&i| nodes[i].as_ref().is_some_and(|node| node.parent.is_none()))
        .collect();
    top.sort_by_key(|&i| (node_at(i).start, i));
    let mut ordered = Vec::new();
    for &i in &top {
        visit(i, 0, &nodes, &mut ordered);
    }
    top.extend(task_count..size);
    ordered.extend((task_count..size).map(|i| (i, 0)));
    let mut previous = vec![Vec::new(); size];
    let mut dependencies = Vec::new();
    let mut conflict_id = None;
    for dependency in &input.dependencies {
        let lookup = |end: &PlanEnd| {
            index
                .get(&(end.kind, end.id.as_str()))
                .copied()
                .filter(|&i| nodes[i].is_some())
        };
        if let (Some(from), Some(to)) = (lookup(&dependency.from), lookup(&dependency.to)) {
            previous[to].push(from);
            let conflict = node_at(to).start < node_at(from).end;
            if conflict {
                conflict_id.get_or_insert(&dependency.id);
            }
            dependencies.push(json!({
                "id": dependency.id, "from": dependency.from, "to": dependency.to, "conflict": conflict,
            }));
        }
    }
    let mut critical = HashSet::new();
    let mut next = top.iter().copied().max_by_key(|&i| node_at(i).end);
    while let Some(i) = next {
        if !critical.insert(i) {
            break;
        }
        next = previous[i]
            .iter()
            .rev()
            .copied()
            .max_by_key(|&prev| node_at(prev).end);
    }
    let mut forecast = Forecast {
        tasks: &input.tasks,
        nodes: &nodes,
        predecessors: &previous,
        today,
        visiting: HashSet::new(),
        ends: vec![None; size],
    };
    let mut items = Vec::new();
    for &(i, depth) in &ordered {
        let task = input.tasks.get(i);
        let milestone = i.checked_sub(task_count).map(|m| milestones[m]);
        let node = node_at(i);
        let kind = if task.is_some() {
            EndKind::Task
        } else {
            EndKind::Milestone
        };
        let title = task
            .map(|task| &task.title)
            .or(milestone.map(|milestone| &milestone.name));
        let id = task
            .map(|task| &task.id)
            .or(milestone.map(|milestone| &milestone.id));
        let version = task
            .and_then(|task| task.plan.as_ref().map(|plan| plan.version))
            .or(milestone.map(|milestone| milestone.version));
        items.push(json!({
            "kind": kind, "id": id, "title": title,
            "parentId": node.parent.map(|parent| &input.tasks[parent].id), "depth": depth,
            "start": civil(node.start - i32::from(task.is_none())), "end": civil(node.end - 1),
            "durationDays": node.duration(), "planned": task.is_some_and(|task| task.plan.is_some()),
            "progress": node.progress.round() as i32, "status": task.map(|task| task.status),
            "ownerId": task.map(|task| &task.owner_id), "workerId": task.and_then(|task| task.worker_id.as_ref()),
            "workerIsAgent": task.is_some_and(|task| task.worker_is_agent),
            "blocked": node.blocked, "hasChildren": !node.children.is_empty(),
            "behindDays": (behind(task, node, today) - 1e-9).ceil().max(0.0) as i32,
            "forecastEnd": last_day(forecast.end(i)), "critical": critical.contains(&i),
            "version": version, "taskVersion": task.map(|task| task.version),
        }));
    }
    let finance = input.finance.as_ref().map(|finance| {
        let collected_percent = finance
            .contract_amount
            .as_deref()
            .and_then(|value| value.parse::<f64>().ok())
            .filter(|amount| *amount > 0.0)
            .map(|amount| {
                (finance.collected.parse::<f64>().unwrap_or_default() / amount * 100.0).round()
                    as i64
            });
        json!({
            "contractAmount": finance.contract_amount, "collectedAmount": finance.collected,
            "currency": finance.currency, "collectedPercent": collected_percent,
        })
    });
    let (mut work, mut completed) = (0.0, 0.0);
    let (mut blocked, mut driver, mut worst) = (None, None, 0.5);
    for &(i, _) in ordered.iter().filter(|(i, _)| *i < task_count) {
        let task = &input.tasks[i];
        let node = node_at(i);
        if node.children.is_empty() {
            work += f64::from(node.duration());
            completed += node.progress * f64::from(node.duration());
            if node.blocked {
                blocked.get_or_insert(&task.id);
            } else {
                let late = behind(Some(task), node, today);
                if late > worst {
                    worst = late;
                    driver = Some(&task.id);
                }
            }
        }
    }
    let delivery_percent = if work > 0.0 {
        (completed / work).round() as i32
    } else {
        0
    };
    let end = top.iter().map(|&i| node_at(i).end).max();
    let slip = end.map_or(0, |end| {
        let point = ordered
            .iter()
            .map(|&(i, _)| forecast.end(i))
            .fold(f64::NEG_INFINITY, f64::max);
        (point - f64::from(end)).round().max(0.0) as i32
    });
    let mut reasons = Vec::new();
    if conflict_id.is_some() {
        reasons.push("dependency_conflict");
    }
    if slip >= 1 {
        reasons.push("slip");
    }
    if blocked.is_some() {
        reasons.push("blocked");
    }
    if driver.is_some() {
        reasons.push("behind");
    }
    let level = if conflict_id.is_some() || slip >= 3 {
        "high"
    } else if reasons.is_empty() {
        "low"
    } else {
        "medium"
    };
    json!({
        "today": input.today, "items": items, "dependencies": dependencies,
        "risk": {
            "level": level, "reasons": reasons,
            "start": ordered.iter().map(|&(i, _)| node_at(i).start - i32::from(i >= task_count)).min().map(civil),
            "plannedEnd": end.map(|value| civil(value - 1)), "forecastEnd": end.map(|value| civil(value + slip - 1)),
            "slipDays": slip, "deliveryPercent": delivery_percent, "driverTaskId": driver, "blockedTaskId": blocked,
            "conflictDependencyId": conflict_id, "lastMilestoneId": milestones.last().map(|milestone| &milestone.id),
            "finance": finance,
        },
    })
}
