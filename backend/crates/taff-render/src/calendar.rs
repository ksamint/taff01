use crate::{escape, palette_svg};
use serde::Deserialize;
use serde_json::Value;
use std::sync::OnceLock;

pub const VERSION: &str = "calendar-1";
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Item {
    title: String,
    detail: String,
    y: f64,
    all_day: bool,
    continues_before: bool,
    continues_after: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Cell {
    x: f64,
    y: f64,
    height: f64,
    date_label: String,
    in_month: bool,
    timed_y: f64,
    items: Vec<Item>,
    more: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Footer {
    text: String,
    hash_full: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Layout {
    locale: String,
    mode: String,
    height: u32,
    title: String,
    subtitle: String,
    all_day_label: String,
    weekdays: Vec<String>,
    cells: Vec<Cell>,
    source_truncated_note: Option<String>,
    footer: Footer,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Watermark {
    text: String,
    content_hash: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    layout: Layout,
    watermark: Watermark,
    content_hash: String,
}

fn text(svg: &mut String, x: f64, y: f64, size: u32, value: &str) {
    svg.push_str(&format!(
        r#"<text x="{x}" y="{y}" font-size="{size}">{}</text>"#,
        escape(value)
    ));
}
fn clipped(value: &str, units: usize) -> String {
    let mut out = String::new();
    let mut used = 0;
    for ch in value.chars() {
        used += if ch.is_ascii() && !"WMwm@#%&".contains(ch) {
            1
        } else {
            2
        };
        if used > units {
            out.push('…');
            break;
        }
        out.push(ch);
    }
    out
}

pub fn render_calendar(input: &Value) -> Result<Vec<u8>, &'static str> {
    static VALIDATOR: OnceLock<jsonschema::Validator> = OnceLock::new();
    let validator = VALIDATOR.get_or_init(|| {
        jsonschema::validator_for(
            &serde_json::from_str::<Value>(include_str!(
                "../../../../packages/schemas/generated/calendar-image.json"
            ))
            .unwrap(),
        )
        .unwrap()
    });
    if !validator.is_valid(input) {
        return Err("invalid_input");
    }
    let input: Input = serde_json::from_value(input.clone()).map_err(|_| "invalid_input")?;
    let l = &input.layout;
    if input.content_hash != input.watermark.content_hash
        || input.content_hash != l.footer.hash_full
        || l.weekdays.len() != 7
        || (l.mode == "week" && l.cells.len() != 7)
        || (l.mode == "month" && ![28, 35, 42].contains(&l.cells.len()))
    {
        return Err("invalid_input");
    }
    let mut top = 164.0;
    for row in l.cells.chunks(7) {
        let height = row[0].height;
        if !(200.0..=572.0).contains(&height) {
            return Err("invalid_input");
        }
        for (column, cell) in row.iter().enumerate() {
            if cell.x != 44.0 + column as f64 * 216.0
                || cell.y != top
                || cell.height != height
                || cell.y + height > f64::from(l.height) - 132.0
                || cell.timed_y < top + 68.0
                || cell.timed_y > top + height - 40.0
                || cell.items.iter().any(|item| {
                    item.y < top + 62.0
                        || item.y + 14.0 > top + height - 30.0
                        || (item.all_day && item.y >= cell.timed_y)
                        || (!item.all_day && item.y < cell.timed_y + 14.0)
                })
            {
                return Err("invalid_input");
            }
        }
        top += height;
    }
    if top + 132.0 != f64::from(l.height) {
        return Err("invalid_input");
    }
    let family = if l.locale == "zh-CN" {
        "Manrope, Noto Sans SC, Noto Sans TC"
    } else {
        "Manrope, Noto Sans TC, Noto Sans SC"
    };
    let mut svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="{}"><rect width="1600" height="{}" fill="#ffffff"/><g font-family="{family}" fill="#20252b">"##,
        l.height, l.height
    );
    text(&mut svg, 44.0, 56.0, 32, &clipped(&l.title, 86));
    text(&mut svg, 44.0, 92.0, 20, &clipped(&l.subtitle, 130));
    for (column, day) in l.weekdays.iter().enumerate() {
        text(
            &mut svg,
            56.0 + column as f64 * 216.0,
            144.0,
            18,
            &clipped(day, 20),
        );
    }
    for cell in &l.cells {
        let bg = if cell.in_month { "#ffffff" } else { "#f2f3f5" };
        svg.push_str(&format!(
            r##"<rect x="{}" y="{}" width="216" height="{}" fill="{bg}" stroke="#d9dde2"/>"##,
            cell.x, cell.y, cell.height
        ));
        text(
            &mut svg,
            cell.x + 12.0,
            cell.y + 24.0,
            18,
            &clipped(&cell.date_label, 20),
        );
        text(
            &mut svg,
            cell.x + 12.0,
            cell.y + 44.0,
            11,
            &clipped(&l.all_day_label, 32),
        );
        svg.push_str(&format!(
            r##"<path d="M{} {}h200" stroke="#d9dde2"/>"##,
            cell.x + 8.0,
            cell.timed_y - 6.0
        ));
        for item in &cell.items {
            if item.all_day {
                svg.push_str(&format!(
                    r##"<rect x="{}" y="{}" width="200" height="22" rx="3" fill="#e3ebfa"/>"##,
                    cell.x + 8.0,
                    item.y - 16.0
                ));
            }
            text(
                &mut svg,
                cell.x + 16.0,
                item.y,
                14,
                &clipped(&item.title, 24),
            );
            if !item.all_day {
                text(
                    &mut svg,
                    cell.x + 16.0,
                    item.y + 12.0,
                    11,
                    &clipped(&item.detail, 31),
                );
            }
            if item.continues_before {
                svg.push_str(&format!(
                    r##"<path d="M{} {}l-4 4 4 4" fill="none" stroke="#4b76c8"/>"##,
                    cell.x + 12.0,
                    item.y - 9.0
                ));
            }
            if item.continues_after {
                svg.push_str(&format!(
                    r##"<path d="M{} {}l4 4 -4 4" fill="none" stroke="#4b76c8"/>"##,
                    cell.x + 204.0,
                    item.y - 9.0
                ));
            }
        }
        if let Some(more) = &cell.more {
            text(
                &mut svg,
                cell.x + 12.0,
                cell.y + cell.height - 12.0,
                14,
                &clipped(more, 24),
            );
        }
    }
    if let Some(note) = &l.source_truncated_note {
        text(
            &mut svg,
            44.0,
            f64::from(l.height) - 98.0,
            16,
            &clipped(note, 160),
        );
    }
    text(
        &mut svg,
        44.0,
        f64::from(l.height) - 60.0,
        18,
        &clipped(&l.footer.text, 140),
    );
    text(
        &mut svg,
        44.0,
        f64::from(l.height) - 28.0,
        14,
        &l.footer.hash_full,
    );
    for y in (250..l.height).step_by(360) {
        svg.push_str(&format!(r##"<text x="420" y="{y}" transform="rotate(-18 420 {y})" opacity="0.10" font-size="24">{}</text>"##, escape(&clipped(&input.watermark.text, 110))));
    }
    svg.push_str("</g></svg>");
    palette_svg(&svg, 1600, l.height, &input.content_hash)
}
