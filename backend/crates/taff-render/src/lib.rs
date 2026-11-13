use axum::{Json, Router, extract::DefaultBodyLimit, http::StatusCode, routing::post};
use image::{
    ImageEncoder,
    codecs::png::{CompressionType, FilterType, PngEncoder},
};
use serde_json::Value;
use std::sync::{Arc, OnceLock};

mod designed;
mod timeline;
pub use timeline::render_timeline;

pub const IMAGE_V1: &str = "image-1";
pub const IMAGE_V2: &str = "image-2";

const MAX_BYTES: usize = 400 * 1024;
const SCHEMA: &str = include_str!("../../../../packages/schemas/generated/daily-summary.json");

pub(crate) fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
pub(crate) fn fonts() -> Arc<fontdb::Database> {
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
    render_versioned(input).map(|(png, _)| png)
}

/// Renders either input version and names the renderer that produced it.
pub fn render_versioned(input: &Value) -> Result<(Vec<u8>, &'static str), &'static str> {
    static VALIDATOR: OnceLock<jsonschema::Validator> = OnceLock::new();
    let validator = VALIDATOR.get_or_init(|| {
        jsonschema::validator_for(&serde_json::from_str::<Value>(SCHEMA).unwrap()).unwrap()
    });
    if !validator.is_valid(input) {
        return Err("invalid_input");
    }
    if input.get("layout").is_some() {
        render_designed(input).map(|png| (png, IMAGE_V2))
    } else {
        render_text(input).map(|png| (png, IMAGE_V1))
    }
}

/// image-2: colour document from the shared display layout.
fn render_designed(input: &Value) -> Result<Vec<u8>, &'static str> {
    let parsed: designed::Input =
        serde_json::from_value(input.clone()).map_err(|_| "invalid_input")?;
    if parsed.watermark.content_hash != parsed.content_hash
        || parsed.layout.footer.hash_full != parsed.content_hash
    {
        return Err("invalid_input");
    }
    let (svg, height) = designed::layout_svg(&parsed)?;
    palette_svg(
        &svg,
        designed::WIDTH as u32,
        height as u32,
        &parsed.content_hash,
    )
}

pub(crate) fn palette_svg(
    svg: &str,
    width: u32,
    height: u32,
    hash: &str,
) -> Result<Vec<u8>, &'static str> {
    let options = usvg::Options {
        fontdb: fonts(),
        ..Default::default()
    };
    let tree = usvg::Tree::from_str(svg, &options).map_err(|_| "render_failed")?;
    let mut pixmap = tiny_skia::Pixmap::new(width, height).ok_or("render_too_large")?;
    resvg::render(
        &tree,
        tiny_skia::Transform::identity(),
        &mut pixmap.as_mut(),
    );
    let png = encode_palette_png(pixmap.data(), width, height)?;
    let png = with_text_chunk(png, "taff:content-hash", hash);
    if png.len() > MAX_BYTES {
        return Err("render_too_large");
    }
    Ok(png)
}

/// Flat document colours quantize losslessly to the eye: an 8-bit palette
/// (NeuQuant, deterministic) is about a third of the RGB size, which keeps a
/// long report under the 400 KB delivery cap.
fn encode_palette_png(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, &'static str> {
    let quantizer = color_quant::NeuQuant::new(10, 256, rgba);
    let palette = quantizer.color_map_rgb();
    let indices: Vec<u8> = rgba
        .chunks_exact(4)
        .map(|pixel| quantizer.index_of(pixel) as u8)
        .collect();
    let mut png = Vec::new();
    let mut encoder = png::Encoder::new(&mut png, width, height);
    encoder.set_color(png::ColorType::Indexed);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_palette(palette);
    encoder.set_compression(png::Compression::High);
    encoder.set_filter(png::Filter::Adaptive);
    let mut writer = encoder.write_header().map_err(|_| "render_failed")?;
    writer
        .write_image_data(&indices)
        .map_err(|_| "render_failed")?;
    writer.finish().map_err(|_| "render_failed")?;
    Ok(png)
}

/// Inserts a PNG `tEXt` chunk right after IHDR (8-byte signature + 25-byte IHDR).
pub fn with_text_chunk(png: Vec<u8>, keyword: &str, value: &str) -> Vec<u8> {
    let mut data = keyword.as_bytes().to_vec();
    data.push(0);
    data.extend_from_slice(value.as_bytes());
    let mut chunk = (data.len() as u32).to_be_bytes().to_vec();
    let mut typed = b"tEXt".to_vec();
    typed.extend_from_slice(&data);
    chunk.extend_from_slice(&typed);
    chunk.extend_from_slice(&crc32(&typed).to_be_bytes());
    let mut out = png[..33].to_vec();
    out.extend_from_slice(&chunk);
    out.extend_from_slice(&png[33..]);
    out
}

/// Reads a `tEXt` value back; used by tests and by callers that audit a PNG.
pub fn text_chunk(png: &[u8], keyword: &str) -> Option<String> {
    let mut at = 8;
    while at + 12 <= png.len() {
        let length = u32::from_be_bytes(png[at..at + 4].try_into().ok()?) as usize;
        let kind = &png[at + 4..at + 8];
        let data = png.get(at + 8..at + 8 + length)?;
        if kind == b"tEXt" {
            let split = data.iter().position(|byte| *byte == 0)?;
            if &data[..split] == keyword.as_bytes() {
                return String::from_utf8(data[split + 1..].to_vec()).ok();
            }
        }
        at += 12 + length;
    }
    None
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                (crc >> 1) ^ 0xedb8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

/// image-1: the rasterized text render, accepted for one release (DS-8.7).
fn render_text(input: &Value) -> Result<Vec<u8>, &'static str> {
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
) -> Result<([(&'static str, &'static str); 3], Vec<u8>), (StatusCode, &'static str)> {
    tokio::task::spawn_blocking(move || render_versioned(&input))
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "render_failed"))?
        .map(|(png, version)| {
            (
                [
                    ("content-type", "image/png"),
                    ("cache-control", "no-store"),
                    ("x-taff-renderer", version),
                ],
                png,
            )
        })
        .map_err(|error| (StatusCode::UNPROCESSABLE_ENTITY, error))
}
pub fn router() -> Router {
    Router::new()
        .route("/render/summary", post(render))
        .route("/render/timeline", post(render_timeline_http))
        .route("/health", axum::routing::get(|| async { "ok" }))
        .layer(DefaultBodyLimit::max(8 * 1024 * 1024))
}

async fn render_timeline_http(
    Json(input): Json<Value>,
) -> Result<([(&'static str, &'static str); 3], Vec<u8>), (StatusCode, &'static str)> {
    tokio::task::spawn_blocking(move || render_timeline(&input))
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "render_failed"))?
        .map(|png| {
            (
                [
                    ("content-type", "image/png"),
                    ("cache-control", "no-store"),
                    ("x-taff-renderer", timeline::VERSION),
                ],
                png,
            )
        })
        .map_err(|error| (StatusCode::UNPROCESSABLE_ENTITY, error))
}
