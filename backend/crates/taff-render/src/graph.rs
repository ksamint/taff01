use crate::{escape, palette_svg, timeline::clipped};
use serde::Deserialize;
use serde_json::Value;
use std::{collections::HashSet, sync::OnceLock};

pub const VERSION: &str = "graph-1";
#[derive(Deserialize)]
struct Point {
    x: f64,
    y: f64,
}
#[derive(Deserialize)]
struct View {
    scale: f64,
    x: f64,
    y: f64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Label {
    text: String,
    x: f64,
    y: f64,
    width: f64,
    font_size: f64,
    anchor: String,
}
#[derive(Deserialize)]
struct Node {
    key: String,
    x: f64,
    y: f64,
    radius: f64,
    tone: String,
    shape: String,
    label: Label,
}
#[derive(Deserialize)]
struct Edge {
    from: usize,
    to: usize,
    c1: Option<Point>,
    c2: Option<Point>,
    tone: String,
    dashed: bool,
}
#[derive(Deserialize)]
struct Ring {
    radius: f64,
    label: String,
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
    kind: String,
    locale: String,
    height: u32,
    title: String,
    subtitle: String,
    empty: Option<String>,
    more: Option<String>,
    more_edges: Option<String>,
    view: View,
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    rings: Vec<Ring>,
    centre: Option<String>,
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

fn color(tone: &str) -> &'static str {
    match tone {
        "blue" => "#4b76c8",
        "gold" => "#a88d54",
        "green" => "#468476",
        "red" => "#c24148",
        "purple" => "#8263a9",
        _ => "#737b87",
    }
}
fn text(svg: &mut String, x: f64, y: f64, size: f64, anchor: &str, value: &str) {
    svg.push_str(&format!(
        r#"<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}">{}</text>"#,
        escape(value)
    ));
}
fn inside(l: &Layout, left: f64, top: f64, right: f64, bottom: f64) -> bool {
    let v = &l.view;
    left * v.scale + v.x >= 48.0 - 0.01
        && right * v.scale + v.x <= 1032.0 + 0.01
        && top * v.scale + v.y >= 144.0 - 0.01
        && bottom * v.scale + v.y <= f64::from(l.height) - 96.0 + 0.01
}
fn label_inside(l: &Layout, label: &Label) -> bool {
    let left = label.x
        - match label.anchor.as_str() {
            "end" => label.width,
            "middle" => label.width / 2.0,
            _ => 0.0,
        };
    label.width + 0.01 >= label.text.chars().count() as f64 * label.font_size * 1.25
        && inside(
            l,
            left,
            label.y - label.font_size * 1.1,
            left + label.width,
            label.y + label.font_size * 0.3,
        )
}

/// Validate structural and projected bounds before allocating the SVG or pixel buffer.
pub fn render_graph(value: &Value) -> Result<Vec<u8>, &'static str> {
    static VALIDATOR: OnceLock<jsonschema::Validator> = OnceLock::new();
    let validator = VALIDATOR.get_or_init(|| {
        jsonschema::validator_for(
            &serde_json::from_str::<Value>(include_str!(
                "../../../../packages/schemas/generated/graph-image.json"
            ))
            .unwrap(),
        )
        .unwrap()
    });
    if !validator.is_valid(value) {
        return Err("invalid_input");
    }
    let input: Input = serde_json::from_value(value.clone()).map_err(|_| "invalid_input")?;
    let l = &input.layout;
    if input.content_hash != input.watermark.content_hash
        || input.content_hash != l.footer.hash_full
        || l.nodes.iter().map(|n| &n.key).collect::<HashSet<_>>().len() != l.nodes.len()
        || (l.kind == "relations" && (!l.rings.is_empty() || l.centre.is_some()))
        || l.nodes.iter().any(|n| {
            !inside(
                l,
                n.x - n.radius,
                n.y - n.radius,
                n.x + n.radius,
                n.y + n.radius,
            ) || !label_inside(l, &n.label)
        })
        || l.edges.iter().any(|e| {
            e.from >= l.nodes.len()
                || e.to >= l.nodes.len()
                || e.c1.is_some() != e.c2.is_some()
                || [&e.c1, &e.c2]
                    .into_iter()
                    .flatten()
                    .any(|p| !inside(l, p.x, p.y, p.x, p.y))
        })
        || l.rings.iter().any(|ring| {
            !inside(l, -ring.radius, -ring.radius, ring.radius, ring.radius)
                || !label_inside(
                    l,
                    &Label {
                        text: ring.label.clone(),
                        x: 0.0,
                        y: -ring.radius + 18.0,
                        width: ring.label.chars().count() as f64 * 15.0,
                        font_size: 12.0,
                        anchor: "middle".into(),
                    },
                )
        })
        || l.centre.as_ref().is_some_and(|centre| {
            !inside(l, -36.0, -36.0, 36.0, 36.0)
                || !label_inside(
                    l,
                    &Label {
                        text: centre.clone(),
                        x: 0.0,
                        y: 5.0,
                        width: centre.chars().count() as f64 * 16.25,
                        font_size: 13.0,
                        anchor: "middle".into(),
                    },
                )
        })
    {
        return Err("invalid_input");
    }
    let family = if l.locale == "zh-CN" {
        "Manrope, Noto Sans SC, Noto Sans TC"
    } else {
        "Manrope, Noto Sans TC, Noto Sans SC"
    };
    let mut svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="{}"><rect width="1080" height="{}" fill="#ffffff"/><g font-family="{family}" fill="#20252b">"##,
        l.height, l.height
    );
    text(&mut svg, 48.0, 58.0, 32.0, "start", &clipped(&l.title, 56));
    text(
        &mut svg,
        48.0,
        94.0,
        20.0,
        "start",
        &clipped(&l.subtitle, 94),
    );
    if let Some(empty) = &l.empty {
        text(&mut svg, 540.0, 128.0, 16.0, "middle", &clipped(empty, 90));
    }
    svg.push_str(&format!(
        r#"<g transform="translate({} {}) scale({})">"#,
        l.view.x, l.view.y, l.view.scale
    ));
    for ring in &l.rings {
        svg.push_str(&format!(
            r##"<circle r="{}" fill="none" stroke="#e1e4e8" stroke-width="1"/>"##,
            ring.radius
        ));
        text(
            &mut svg,
            0.0,
            -ring.radius + 18.0,
            12.0,
            "middle",
            &ring.label,
        );
    }
    for edge in &l.edges {
        let from = &l.nodes[edge.from];
        let to = &l.nodes[edge.to];
        let path = if let (Some(a), Some(b)) = (&edge.c1, &edge.c2) {
            format!(
                "M{},{}C{},{} {},{} {},{}",
                from.x, from.y, a.x, a.y, b.x, b.y, to.x, to.y
            )
        } else {
            format!("M{},{}L{},{}", from.x, from.y, to.x, to.y)
        };
        let dash = if edge.dashed { "5 4" } else { "none" };
        svg.push_str(&format!(r#"<path d="{path}" fill="none" stroke="{}" stroke-width="1.3" stroke-dasharray="{dash}" opacity="0.6"/>"#, color(&edge.tone)));
    }
    if let Some(centre) = &l.centre {
        svg.push_str(r##"<circle r="36" fill="#f3efe5" stroke="#a88d54"/>"##);
        text(&mut svg, 0.0, 5.0, 13.0, "middle", centre);
    }
    for node in &l.nodes {
        let r = node.radius;
        let x = node.x;
        let y = node.y;
        let color = color(&node.tone);
        match node.shape.as_str() {
            "square" => svg.push_str(&format!(
                r#"<rect x="{}" y="{}" width="{}" height="{}" rx="2" fill="{color}"/>"#,
                x - r,
                y - r,
                r * 2.0,
                r * 2.0
            )),
            "diamond" => svg.push_str(&format!(
                r#"<path d="M{x},{}L{},{y} {x},{} {},{y}Z" fill="{color}"/>"#,
                y - r,
                x + r,
                y + r,
                x - r
            )),
            _ => svg.push_str(&format!(
                r#"<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>"#
            )),
        }
        let label = &node.label;
        text(
            &mut svg,
            label.x,
            label.y,
            label.font_size,
            &label.anchor,
            &label.text,
        );
    }
    svg.push_str("</g>");
    let more = [&l.more, &l.more_edges]
        .into_iter()
        .flatten()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join(" · ");
    if !more.is_empty() {
        text(
            &mut svg,
            48.0,
            f64::from(l.height) - 80.0,
            18.0,
            "start",
            &clipped(&more, 96),
        );
    }
    text(
        &mut svg,
        48.0,
        f64::from(l.height) - 52.0,
        16.0,
        "start",
        &clipped(&l.footer.text, 110),
    );
    text(
        &mut svg,
        48.0,
        f64::from(l.height) - 24.0,
        14.0,
        "start",
        &l.footer.hash_full,
    );
    for y in (240..l.height).step_by(320) {
        svg.push_str(&format!(r##"<text x="220" y="{y}" transform="rotate(-18 220 {y})" opacity="0.10" font-size="22">{}</text>"##, escape(&clipped(&input.watermark.text, 90))));
    }
    svg.push_str("</g></svg>");
    palette_svg(&svg, 1080, l.height, &input.content_hash)
}
