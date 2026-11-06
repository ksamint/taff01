//! image-2: the designed summary layout (ADR 0029 amendment 1).
//!
//! Every string arrives localized and formatted from TypeScript
//! (`buildSummaryLayout`); this module only measures, wraps and places it.
//! Colours are the TABLE AI tokens from `apps/web/src/styles/tokens.css`.

use serde::Deserialize;
use std::collections::HashMap;

use crate::{escape, fonts};

pub const WIDTH: f32 = 1080.0;
const MARGIN: f32 = 56.0;
const CONTENT: f32 = WIDTH - 2.0 * MARGIN;
const CARD_PAD: f32 = 32.0;
pub const MAX_HEIGHT: f32 = 16000.0;

// TABLE AI tokens (never a second palette).
const INK: &str = "#1b1b1d";
const INK_VARIANT: &str = "#44474c";
const SURFACE: &str = "#fbf9fa";
const CONTAINER_LOW: &str = "#f5f3f4";
const CONTAINER_HIGH: &str = "#eae7e9";
const OUTLINE: &str = "#e4e2e3";
const CARD: &str = "#ffffff";
const GOLD: &str = "#a88b52";
const GOLD_DEEP: &str = "#785f2a";
const GOLD_MIST: &str = "#efe8dc";
const SUCCESS: &str = "#2f5d4e";
const SUCCESS_CONTAINER: &str = "#e3eee9";
const WARNING: &str = "#8a5a12";
const WARNING_CONTAINER: &str = "#f6ebd7";
const ERROR: &str = "#ba1a1a";
const ERROR_CONTAINER: &str = "#ffdad6";

#[derive(Deserialize)]
pub struct Input {
    pub layout: Layout,
    pub watermark: Watermark,
    #[serde(rename = "contentHash")]
    pub content_hash: String,
}
#[derive(Deserialize)]
pub struct Watermark {
    pub text: String,
    #[serde(rename = "contentHash")]
    pub content_hash: String,
}
#[derive(Deserialize)]
pub struct Layout {
    pub locale: String,
    header: Header,
    kpis: Vec<Kpi>,
    projects: Vec<Project>,
    #[serde(rename = "moreProjects")]
    more_projects: Option<String>,
    pub footer: Footer,
}
#[derive(Deserialize)]
struct Header {
    title: String,
    audience: String,
    workspace: String,
    date: String,
}
#[derive(Deserialize)]
struct Kpi {
    label: String,
    value: String,
    tone: String,
}
#[derive(Deserialize)]
struct Project {
    name: String,
    stage: Option<String>,
    risk: Risk,
    meta: Vec<String>,
    progress: Bar,
    finance: Option<Finance>,
    #[serde(rename = "agentRuns")]
    agent_runs: Option<String>,
    sections: Vec<Section>,
}
#[derive(Deserialize)]
struct Risk {
    level: String,
    label: String,
    reasons: Vec<String>,
}
#[derive(Deserialize)]
struct Bar {
    percent: u8,
    label: String,
}
#[derive(Deserialize)]
struct Finance {
    percent: Option<u8>,
    label: String,
}
#[derive(Deserialize)]
struct Section {
    title: String,
    count: String,
    items: Vec<Item>,
    more: Option<String>,
}
#[derive(Deserialize)]
struct Item {
    number: String,
    title: String,
    detail: String,
    overdue: bool,
}
#[derive(Deserialize)]
pub struct Footer {
    generated: String,
    watermark: String,
    #[serde(rename = "hashLabel")]
    hash_label: String,
    #[serde(rename = "hashShort")]
    hash_short: String,
    #[serde(rename = "hashFull")]
    pub hash_full: String,
}

fn is_wide(ch: char) -> bool {
    matches!(ch as u32,
        0x1100..=0x115f | 0x2e80..=0xa4cf | 0xac00..=0xd7af | 0xf900..=0xfaff
        | 0xfe10..=0xfe6f | 0xff00..=0xff60 | 0x1f000..=0x1ffff)
}

/// Shaped text measurement through usvg's own layout (rustybuzz inside), with
/// the same font database the final render uses.
struct Painter {
    family: &'static str,
    widths: HashMap<(String, u32, u16), f32>,
    body: String,
}

impl Painter {
    fn measure(&mut self, text: &str, size: f32, weight: u16) -> f32 {
        let key = (text.to_string(), size.to_bits(), weight);
        if let Some(width) = self.widths.get(&key) {
            return *width;
        }
        let svg = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="200"><text x="0" y="100" font-family="{}" font-size="{size}" font-weight="{weight}">{}</text></svg>"#,
            self.family,
            escape(text)
        );
        let options = usvg::Options {
            fontdb: fonts(),
            ..Default::default()
        };
        let width = usvg::Tree::from_str(&svg, &options)
            .map(|tree| tree.root().abs_bounding_box().right())
            .unwrap_or(0.0);
        self.widths.insert(key, width);
        width
    }

    /// Breaks after spaces and around full-width characters; an overlong word
    /// breaks by character; lines beyond `max_lines` end with an ellipsis.
    fn wrap(
        &mut self,
        text: &str,
        size: f32,
        weight: u16,
        width: f32,
        max_lines: usize,
    ) -> Vec<String> {
        // A token is a word with its trailing spaces, or one full-width character.
        let mut tokens: Vec<String> = Vec::new();
        let mut current = String::new();
        for ch in text.chars() {
            if is_wide(ch) {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
                tokens.push(ch.to_string());
                continue;
            }
            if ch != ' ' && current.ends_with(' ') {
                tokens.push(std::mem::take(&mut current));
            }
            current.push(ch);
        }
        if !current.is_empty() {
            tokens.push(current);
        }
        let mut lines: Vec<String> = Vec::new();
        let mut line = String::new();
        for token in tokens {
            let candidate = format!("{line}{token}");
            if line.is_empty() || self.measure(candidate.trim_end(), size, weight) <= width {
                line = candidate;
                if self.measure(line.trim_end(), size, weight) > width {
                    // A single token wider than the line: break by character.
                    let mut part = String::new();
                    for ch in line.chars() {
                        let next = format!("{part}{ch}");
                        if !part.is_empty() && self.measure(&next, size, weight) > width {
                            lines.push(part);
                            part = ch.to_string();
                        } else {
                            part = next;
                        }
                    }
                    line = part;
                }
            } else {
                lines.push(line.trim_end().to_string());
                line = token.trim_start().to_string();
            }
        }
        if !line.trim().is_empty() {
            lines.push(line.trim_end().to_string());
        }
        if lines.len() > max_lines {
            lines.truncate(max_lines);
            let last = lines.last_mut().unwrap();
            while !last.is_empty() && self.measure(&format!("{last}…"), size, weight) > width {
                last.pop();
            }
            *last = format!("{}…", last.trim_end());
        }
        lines
    }

    #[allow(clippy::too_many_arguments)]
    fn text(
        &mut self,
        x: f32,
        y: f32,
        text: &str,
        size: f32,
        weight: u16,
        fill: &str,
        anchor: &str,
    ) {
        // The bundled subsets are single-weight; a hairline stroke in the
        // fill colour gives semibold and bold their weight.
        let stroke = match weight {
            700.. => format!(
                r#" stroke="{fill}" stroke-width="{:.2}" stroke-linejoin="round""#,
                size * 0.034
            ),
            600..=699 => format!(
                r#" stroke="{fill}" stroke-width="{:.2}" stroke-linejoin="round""#,
                size * 0.022
            ),
            _ => String::new(),
        };
        self.body.push_str(&format!(
            r#"<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{stroke}>{}</text>"#,
            escape(text)
        ));
    }

    #[allow(clippy::too_many_arguments)]
    fn rect(&mut self, x: f32, y: f32, w: f32, h: f32, r: f32, fill: &str, stroke: Option<&str>) {
        let stroke = stroke
            .map(|color| format!(r#" stroke="{color}" stroke-width="1""#))
            .unwrap_or_default();
        self.body.push_str(&format!(
            r#"<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"{stroke}/>"#
        ));
    }

    /// Wrapped paragraph; returns the height used.
    #[allow(clippy::too_many_arguments)]
    fn paragraph(
        &mut self,
        x: f32,
        top: f32,
        text: &str,
        size: f32,
        weight: u16,
        fill: &str,
        width: f32,
        line_height: f32,
        max_lines: usize,
    ) -> f32 {
        let lines = self.wrap(text, size, weight, width, max_lines);
        for (index, line) in lines.iter().enumerate() {
            let baseline = top + line_height * index as f32 + line_height * 0.72;
            self.text(x, baseline, line, size, weight, fill, "start");
        }
        line_height * lines.len() as f32
    }

    fn bar(&mut self, x: f32, y: f32, width: f32, percent: Option<u8>, fill: &str) {
        self.rect(x, y, width, 10.0, 5.0, CONTAINER_HIGH, None);
        if let Some(percent) = percent.filter(|p| *p > 0) {
            let filled = (width * f32::from(percent.min(100)) / 100.0).max(10.0);
            self.rect(x, y, filled, 10.0, 5.0, fill, None);
        }
    }
}

fn risk_colors(level: &str) -> (&'static str, &'static str) {
    match level {
        "high" => (ERROR, ERROR_CONTAINER),
        "medium" => (WARNING, WARNING_CONTAINER),
        _ => (SUCCESS, SUCCESS_CONTAINER),
    }
}

/// Builds the SVG document and returns it with its height in pixels.
pub fn layout_svg(input: &Input) -> Result<(String, f32), &'static str> {
    let layout = &input.layout;
    let family = if layout.locale == "zh-CN" {
        "Manrope, Noto Sans SC, Noto Sans TC"
    } else {
        "Manrope, Noto Sans TC, Noto Sans SC"
    };
    let reason_join = if layout.locale == "en" { ", " } else { "、" };
    let mut p = Painter {
        family,
        widths: HashMap::new(),
        body: String::new(),
    };

    // Header band.
    let mut y = 64.0;
    let title_h = p.paragraph(
        MARGIN,
        y,
        &layout.header.title,
        42.0,
        700,
        INK,
        CONTENT,
        54.0,
        2,
    );
    y += title_h + 14.0;
    let chip_w = p
        .measure(&layout.header.audience, 22.0, 600)
        .min(CONTENT - 32.0)
        + 32.0;
    let chip = p.wrap(&layout.header.audience, 22.0, 600, CONTENT - 32.0, 1);
    p.rect(MARGIN, y, chip_w, 42.0, 21.0, GOLD_MIST, None);
    p.text(
        MARGIN + 16.0,
        y + 29.0,
        &chip[0],
        22.0,
        600,
        GOLD_DEEP,
        "start",
    );
    y += 42.0 + 16.0;
    let place = format!("{} · {}", layout.header.workspace, layout.header.date);
    y += p.paragraph(MARGIN, y, &place, 24.0, 400, INK_VARIANT, CONTENT, 34.0, 2);
    y += 36.0;
    let band = y;
    y += 28.0;

    // KPI tiles, four per row.
    let gap = 16.0;
    let tile_w = (CONTENT - 3.0 * gap) / 4.0;
    let tile_h = 116.0;
    for (index, kpi) in layout.kpis.iter().enumerate() {
        let column = (index % 4) as f32;
        let row = (index / 4) as f32;
        let x = MARGIN + column * (tile_w + gap);
        let top = y + row * (tile_h + gap);
        let (tone, background) = match kpi.tone.as_str() {
            "danger" => (ERROR, ERROR_CONTAINER),
            "warning" => (WARNING, WARNING_CONTAINER),
            _ => (INK, CARD),
        };
        p.rect(x, top, tile_w, tile_h, 14.0, background, Some(OUTLINE));
        p.text(x + 18.0, top + 52.0, &kpi.value, 40.0, 700, tone, "start");
        p.paragraph(
            x + 18.0,
            top + 62.0,
            &kpi.label,
            19.0,
            500,
            INK_VARIANT,
            tile_w - 36.0,
            24.0,
            2,
        );
    }
    let rows = layout.kpis.len().div_ceil(4) as f32;
    y += rows * tile_h + (rows - 1.0).max(0.0) * gap + 32.0;

    // Project cards: paint into a scratch body first to learn each card's height.
    let inner = CONTENT - 2.0 * CARD_PAD;
    for project in &layout.projects {
        let outer = std::mem::take(&mut p.body);
        let top = y;
        let mut cy = top + CARD_PAD;
        let x = MARGIN + CARD_PAD;
        let (risk_fg, risk_bg) = risk_colors(&project.risk.level);
        let badge_w = p.measure(&project.risk.label, 19.0, 700) + 28.0;
        p.rect(
            MARGIN + CONTENT - CARD_PAD - badge_w,
            cy,
            badge_w,
            36.0,
            18.0,
            risk_bg,
            None,
        );
        p.text(
            MARGIN + CONTENT - CARD_PAD - badge_w / 2.0,
            cy + 25.0,
            &project.risk.label,
            19.0,
            700,
            risk_fg,
            "middle",
        );
        cy += p.paragraph(
            x,
            cy,
            &project.name,
            30.0,
            700,
            INK,
            inner - badge_w - 20.0,
            40.0,
            2,
        );
        let meta: Vec<&str> = project
            .stage
            .iter()
            .map(String::as_str)
            .chain(project.meta.iter().map(String::as_str))
            .collect();
        if !meta.is_empty() {
            cy += 4.0
                + p.paragraph(
                    x,
                    cy + 4.0,
                    &meta.join(" · "),
                    21.0,
                    400,
                    INK_VARIANT,
                    inner,
                    30.0,
                    2,
                );
        }
        if !project.risk.reasons.is_empty() {
            cy += 4.0
                + p.paragraph(
                    x,
                    cy + 4.0,
                    &project.risk.reasons.join(reason_join),
                    19.0,
                    600,
                    risk_fg,
                    inner,
                    28.0,
                    2,
                );
        }
        cy += 20.0;
        p.text(
            x,
            cy + 20.0,
            &project.progress.label,
            20.0,
            600,
            INK,
            "start",
        );
        p.bar(x, cy + 34.0, inner, Some(project.progress.percent), GOLD);
        cy += 64.0;
        if let Some(finance) = &project.finance {
            let label = p.wrap(&finance.label, 20.0, 600, inner, 1);
            p.text(x, cy + 20.0, &label[0], 20.0, 600, INK, "start");
            p.bar(x, cy + 34.0, inner, finance.percent, SUCCESS);
            cy += 64.0;
        }
        if let Some(runs) = &project.agent_runs {
            cy += p.paragraph(x, cy, runs, 20.0, 400, INK_VARIANT, inner, 30.0, 2) + 4.0;
        }
        for section in &project.sections {
            cy += 16.0;
            p.rect(x, cy, inner, 1.0, 0.0, OUTLINE, None);
            cy += 20.0;
            p.text(x, cy + 24.0, &section.title, 22.0, 700, INK, "start");
            let title_w = p.measure(&section.title, 22.0, 700);
            let pill_w = p.measure(&section.count, 18.0, 700) + 20.0;
            p.rect(
                x + title_w + 12.0,
                cy + 4.0,
                pill_w,
                28.0,
                14.0,
                CONTAINER_HIGH,
                None,
            );
            p.text(
                x + title_w + 12.0 + pill_w / 2.0,
                cy + 24.0,
                &section.count,
                18.0,
                700,
                INK_VARIANT,
                "middle",
            );
            cy += 44.0;
            for item in &section.items {
                p.text(x, cy + 22.0, &item.number, 19.0, 600, INK_VARIANT, "start");
                let text_x = x + 84.0;
                cy += p.paragraph(
                    text_x,
                    cy,
                    &item.title,
                    21.0,
                    500,
                    INK,
                    inner - 84.0,
                    30.0,
                    2,
                );
                if !item.detail.is_empty() {
                    let color = if item.overdue { ERROR } else { INK_VARIANT };
                    cy += p.paragraph(
                        text_x,
                        cy,
                        &item.detail,
                        18.0,
                        400,
                        color,
                        inner - 84.0,
                        26.0,
                        1,
                    );
                }
                cy += 10.0;
            }
            if let Some(more) = &section.more {
                cy += p.paragraph(
                    x + 84.0,
                    cy,
                    more,
                    19.0,
                    600,
                    GOLD_DEEP,
                    inner - 84.0,
                    30.0,
                    1,
                );
            }
        }
        cy += CARD_PAD;
        let content = std::mem::replace(&mut p.body, outer);
        p.rect(MARGIN, top, CONTENT, cy - top, 18.0, CARD, Some(OUTLINE));
        p.body.push_str(&content);
        y = cy + 24.0;
        if y > MAX_HEIGHT {
            return Err("render_too_large");
        }
    }
    if let Some(more) = &layout.more_projects {
        y += p.paragraph(MARGIN, y, more, 21.0, 600, GOLD_DEEP, CONTENT, 34.0, 1) + 16.0;
    }

    // Footer.
    y += 8.0;
    p.rect(MARGIN, y, CONTENT, 1.0, 0.0, OUTLINE, None);
    y += 20.0;
    y += p.paragraph(
        MARGIN,
        y,
        &layout.footer.generated,
        19.0,
        400,
        INK_VARIANT,
        CONTENT,
        28.0,
        2,
    );
    y += p.paragraph(
        MARGIN,
        y,
        &layout.footer.watermark,
        19.0,
        400,
        INK_VARIANT,
        CONTENT,
        28.0,
        2,
    );
    let hash = format!("{} {}", layout.footer.hash_label, layout.footer.hash_short);
    y += p.paragraph(MARGIN, y, &hash, 19.0, 600, INK_VARIANT, CONTENT, 28.0, 1);
    let height = (y + 48.0).ceil();
    if height > MAX_HEIGHT {
        return Err("render_too_large");
    }

    let mut svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{height}"><rect width="{WIDTH}" height="{height}" fill="{SURFACE}"/><rect width="{WIDTH}" height="{band}" fill="{CONTAINER_LOW}"/><rect width="{WIDTH}" height="8" fill="{GOLD}"/><g font-family="{family}">"#
    );
    svg.push_str(&p.body);
    svg.push_str("</g>");
    let mark = escape(&input.watermark.text);
    let mut row = 0;
    let mut wy = 220.0;
    while wy < height {
        for wx in [-180.0, 360.0, 900.0] {
            let wx = wx + if row % 2 == 0 { 0.0 } else { 270.0 };
            svg.push_str(&format!(
                r#"<text x="{wx}" y="{wy}" transform="rotate(-24 {wx} {wy})" fill="{INK}" opacity="0.07" font-size="22" font-family="{family}">{mark}</text>"#
            ));
        }
        wy += 300.0;
        row += 1;
    }
    svg.push_str("</svg>");
    Ok((svg, height))
}
