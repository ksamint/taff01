use axum::{Json, Router, extract::DefaultBodyLimit, http::StatusCode, routing::post};
use image::{
    ImageEncoder,
    codecs::png::{CompressionType, FilterType, PngEncoder},
};
use serde_json::Value;
use std::sync::{Arc, OnceLock};

const MAX_BYTES: usize = 400 * 1024;
const SCHEMA: &str = include_str!("../../../../packages/schemas/generated/daily-summary.json");

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
fn fonts() -> Arc<fontdb::Database> {
    static FONTS: OnceLock<Arc<fontdb::Database>> = OnceLock::new();
    FONTS
        .get_or_init(|| {
            let mut db = fontdb::Database::new();
            for bytes in [
                include_bytes!("../../../fonts/Manrope.ttf").as_slice(),
                include_bytes!("../../../fonts/NotoSansSC.ttf").as_slice(),
                include_bytes!("../../../fonts/NotoSansTC.ttf").as_slice(),
            ] {
                db.load_font_data(bytes.to_vec());
            }
            Arc::new(db)
        })
        .clone()
}
fn wrap(text: &str) -> Vec<String> {
    let mut result = vec![String::new()];
    let mut width = 0;
    for ch in text.chars() {
        let size = if !ch.is_ascii() || "WMwm@#%&".contains(ch) {
            2
        } else {
            1
        };
        if width + size > 66 {
            let line = result.last_mut().unwrap();
            if let Some(space) = line.rfind(' ').filter(|space| *space > 0) {
                let remainder = line[space + 1..].to_string();
                line.truncate(space);
                width = remainder
                    .chars()
                    .map(|c| {
                        if !c.is_ascii() || "WMwm@#%&".contains(c) {
                            2
                        } else {
                            1
                        }
                    })
                    .sum();
                result.push(remainder);
            } else {
                result.push(String::new());
                width = 0;
            }
        }
        result.last_mut().unwrap().push(ch);
        width += size;
    }
    result
}

/// Pixels only. No database, credentials, filesystem input or external SVG resources.
pub fn render_summary(input: &Value) -> Result<Vec<u8>, &'static str> {
    static VALIDATOR: OnceLock<jsonschema::Validator> = OnceLock::new();
    let validator = VALIDATOR.get_or_init(|| {
        jsonschema::validator_for(&serde_json::from_str::<Value>(SCHEMA).unwrap()).unwrap()
    });
    if !validator.is_valid(input) {
        return Err("invalid_input");
    }
    let hash = input["contentHash"].as_str().unwrap();
    let text = input["text"].as_str().unwrap();
    if input["watermark"]["contentHash"] != input["contentHash"]
        || !text.replace('\n', "").ends_with(hash)
    {
        return Err("invalid_input");
    }
    let blocks: Vec<Vec<String>> = text
        .trim_end()
        .split("\n\n")
        .map(|block| block.lines().flat_map(wrap).collect())
        .collect();
    let height = 144
        + blocks
            .iter()
            .map(|block| block.len() * 40 + 56)
            .sum::<usize>();
    if height > 16000 {
        return Err("render_too_large");
    }
    let family = if input["locale"] == "zh-CN" {
        "Manrope, Noto Sans SC, Noto Sans TC"
    } else {
        "Manrope, Noto Sans TC, Noto Sans SC"
    };
    let mut svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="{height}"><rect width="1080" height="{height}" fill="white"/><g font-family="{family}" font-size="26" fill="#20252b">"##
    );
    let mut y = 72;
    let projects = input["snapshot"]["projects"].as_array().unwrap();
    for (index, lines) in blocks.iter().enumerate() {
        let block_height = lines.len() * 40 + 32;
        let project = index
            .checked_sub(1)
            .and_then(|i| projects.get(i))
            .filter(|project| {
                lines
                    .first()
                    .is_some_and(|line| project["name"].as_str().unwrap().starts_with(line))
            });
        if let Some(project) = project {
            svg.push_str(&format!(r##"<rect x="48" y="{}" width="984" height="{block_height}" rx="12" fill="#f2f3f5"/><rect x="64" y="{}" width="952" height="6" rx="3" fill="#d9dde2"/><rect x="64" y="{}" width="{}" height="6" rx="3" fill="#59626e"/>"##, y - 32, y + block_height - 52, y + block_height - 52, 952.0 * project["deliveryProgress"].as_f64().unwrap_or(0.0).clamp(0.0,100.0)/100.0));
        }
        for (line_index, line) in lines.iter().enumerate() {
            let size = if index == 0 && line_index == 0 {
                38
            } else {
                26
            };
            let weight = if line_index == 0 { "600" } else { "400" };
            svg.push_str(&format!(
                r##"<text x="{}" y="{y}" font-size="{size}" font-weight="{weight}">{}</text>"##,
                if project.is_some() { 64 } else { 48 },
                escape(line)
            ));
            y += 40;
        }
        y += 56;
    }
    svg.push_str("</g>");
    let watermark = escape(input["watermark"]["text"].as_str().unwrap());
    for y in (180..height).step_by(360) {
        for x in [-220, 480] {
            svg.push_str(&format!(r##"<text x="{x}" y="{y}" transform="rotate(-24 {x} {y})" fill="#30343b" opacity="0.12" font-size="24" font-family="{family}">{watermark}</text>"##));
        }
    }
    svg.push_str("</svg>");
    let options = usvg::Options {
        fontdb: fonts(),
        ..Default::default()
    };
    let tree = usvg::Tree::from_str(&svg, &options).map_err(|_| "render_failed")?;
    let mut pixmap = tiny_skia::Pixmap::new(1080, height as u32).ok_or("render_too_large")?;
    resvg::render(
        &tree,
        tiny_skia::Transform::identity(),
        &mut pixmap.as_mut(),
    );
    // Grayscale keeps a crisp, lossless document within the delivery budget.
    let image =
        image::RgbaImage::from_raw(1080, height as u32, pixmap.take()).ok_or("render_failed")?;
    let gray = image::DynamicImage::ImageRgba8(image).into_luma8();
    let mut png = Vec::new();
    PngEncoder::new_with_quality(&mut png, CompressionType::Best, FilterType::Adaptive)
        .write_image(
            gray.as_raw(),
            1080,
            height as u32,
            image::ExtendedColorType::L8,
        )
        .map_err(|_| "render_failed")?;
    if png.len() > MAX_BYTES {
        return Err("render_too_large");
    }
    Ok(png)
}
async fn render(
    Json(input): Json<Value>,
) -> Result<([(&'static str, &'static str); 2], Vec<u8>), (StatusCode, &'static str)> {
    tokio::task::spawn_blocking(move || render_summary(&input))
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "render_failed"))?
        .map(|png| {
            (
                [("content-type", "image/png"), ("cache-control", "no-store")],
                png,
            )
        })
        .map_err(|error| (StatusCode::UNPROCESSABLE_ENTITY, error))
}
pub fn router() -> Router {
    Router::new()
        .route("/render/summary", post(render))
        .route("/health", axum::routing::get(|| async { "ok" }))
        .layer(DefaultBodyLimit::max(8 * 1024 * 1024))
}
