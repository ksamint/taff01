use crate::{escape, palette_svg};
use serde::Deserialize;
use serde_json::Value;
use std::sync::OnceLock;

pub const VERSION: &str = "timeline-1";
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Row {
    kind: String,
    title: String,
    y: f64,
    x: f64,
    end_x: f64,
    forecast_x: f64,
    progress: f64,
    depth: f64,
    critical: bool,
    blocked: bool,
}
#[derive(Deserialize)]
struct Tick {
    x: f64,
    label: String,
}
#[derive(Deserialize)]
struct Dependency {
    from: usize,
    to: usize,
    conflict: bool,
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
    height: u32,
    title: String,
    subtitle: String,
    today_label: String,
    today_x: f64,
    ticks: Vec<Tick>,
    rows: Vec<Row>,
    dependencies: Vec<Dependency>,
    more: Option<String>,
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
// A width budget measured conservatively in half-em units also handles user CJK names.
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

pub fn render_timeline(input: &Value) -> Result<Vec<u8>, &'static str> {
    static VALIDATOR: OnceLock<jsonschema::Validator> = OnceLock::new();
    let validator = VALIDATOR.get_or_init(|| {
        jsonschema::validator_for(
            &serde_json::from_str::<Value>(include_str!(
                "../../../../packages/schemas/generated/timeline-image.json"
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
        || l.rows.iter().any(|r| {
            r.x < 440.0
                || r.end_x < r.x
                || r.forecast_x < r.end_x
                || r.y < 194.0
                || r.y + 26.0 > f64::from(l.height) - 86.0
        })
        || l.dependencies
            .iter()
            .any(|d| d.from >= l.rows.len() || d.to >= l.rows.len())
    {
        return Err("invalid_input");
    }
    let family = if l.locale == "zh-CN" {
        "Manrope, Noto Sans SC, Noto Sans TC"
    } else {
        "Manrope, Noto Sans TC, Noto Sans SC"
    };
    let mut svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="{}"><rect width="1600" height="{}" fill="#ffffff"/><g font-family="{family}" fill="#20252b"><defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto-start-reverse"><path d="M0 0L6 3L0 6" fill="#737b87"/></marker></defs>"##,
        l.height, l.height
    );
    text(&mut svg, 48.0, 58.0, 32, &clipped(&l.title, 86));
    text(&mut svg, 48.0, 94.0, 20, &clipped(&l.subtitle, 130));
    for tick in &l.ticks {
        svg.push_str(&format!(
            r##"<path d="M{} 150V{}" stroke="#e5e7eb"/>"##,
            tick.x,
            l.height - 100
        ));
        text(
            &mut svg,
            tick.x.min(1430.0),
            140.0,
            16,
            &clipped(&tick.label, 14),
        );
    }
    for r in &l.rows {
        svg.push_str(&format!(
            r##"<path d="M48 {}H1552" stroke="#eef0f3"/>"##,
            r.y + 26.0
        ));
        text(
            &mut svg,
            48.0 + r.depth * 12.0,
            r.y + 7.0,
            20,
            &clipped(&r.title, 32 - r.depth as usize),
        );
        let color = if r.blocked || r.critical {
            "#c24148"
        } else {
            "#4b76c8"
        };
        if r.forecast_x > r.end_x {
            svg.push_str(&format!(r##"<path d="M{} {}H{}" stroke="#c24148" stroke-width="8" stroke-dasharray="5 4"/>"##, r.end_x, r.y, r.forecast_x));
        }
        if r.kind == "milestone" {
            svg.push_str(&format!(
                r##"<path d="M{} {}l10 10 -10 10 -10 -10z" fill="{color}"/>"##,
                r.x,
                r.y - 10.0
            ));
        } else {
            let width = (r.end_x - r.x).max(1.0);
            svg.push_str(&format!(r##"<rect x="{}" y="{}" width="{width}" height="22" rx="4" fill="{color}" opacity="0.3"/><rect x="{}" y="{}" width="{}" height="22" rx="4" fill="{color}"/>"##, r.x, r.y - 11.0, r.x, r.y - 11.0, width * r.progress / 100.0));
        }
    }
    for d in &l.dependencies {
        let from = &l.rows[d.from];
        let to = &l.rows[d.to];
        let color = if d.conflict { "#c24148" } else { "#737b87" };
        // Route backward links in the gap between rows, retaining finish-to-start direction.
        let mid = to.y + if to.y >= from.y { -26.0 } else { 26.0 };
        svg.push_str(&format!(r##"<path d="M{} {}H{}V{mid}H{}V{}H{}" stroke="{color}" fill="none" stroke-width="1.5" marker-end="url(#arrow)"/>"##, from.end_x, from.y, from.end_x + 8.0, to.x - 8.0, to.y, to.x));
    }
    svg.push_str(&format!(
        r##"<path d="M{} 152V{}" stroke="#c24148" stroke-dasharray="6 4"/>"##,
        l.today_x,
        l.height - 100
    ));
    text(
        &mut svg,
        l.today_x.min(1450.0),
        172.0,
        16,
        &clipped(&l.today_label, 16),
    );
    if let Some(more) = &l.more {
        text(&mut svg, 48.0, f64::from(l.height) - 85.0, 18, more);
    }
    text(
        &mut svg,
        48.0,
        f64::from(l.height) - 54.0,
        18,
        &clipped(&l.footer.text, 140),
    );
    text(
        &mut svg,
        48.0,
        f64::from(l.height) - 25.0,
        14,
        &l.footer.hash_full,
    );
    for y in (220..l.height).step_by(360) {
        svg.push_str(&format!(r##"<text x="420" y="{y}" transform="rotate(-18 420 {y})" opacity="0.10" font-size="24">{}</text>"##, escape(&clipped(&input.watermark.text, 110))));
    }
    svg.push_str("</g></svg>");
    palette_svg(&svg, 1600, l.height, &input.content_hash)
}
