use image_hasher::HasherConfig;
use serde_json::{Value, json};
use std::path::PathBuf;
use taff_render::{render_summary, render_versioned, text_chunk};

#[test]
fn renders_three_locales_with_watermark_and_hash_within_delivery_cap() {
    let hasher = HasherConfig::new().hash_size(16, 16).to_hasher();
    for locale in ["en", "zh-CN", "zh-HK"] {
        let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
        let input: Value = serde_json::from_slice(
            &std::fs::read(base.join(format!("summary-{locale}.json"))).unwrap(),
        )
        .unwrap();
        let bytes = render_summary(&input).unwrap();
        assert!(bytes.len() < 400 * 1024, "{locale} size {}", bytes.len());
        let actual = image::load_from_memory(&bytes).unwrap();
        assert_eq!(actual.width(), 1080);
        assert!(actual.height() > 1000);
        let path = base.join(format!("summary-{locale}.png"));
        if std::env::var("UPDATE_RENDER_GOLDENS").as_deref() == Ok("1") {
            std::fs::write(&path, &bytes).unwrap();
        }
        let expected = image::open(path).unwrap();
        assert_eq!(actual.height(), expected.height());
        assert!(
            hasher
                .hash_image(&actual)
                .dist(&hasher.hash_image(&expected))
                <= 2,
            "{locale} perceptual drift"
        );
        let mut without_watermark = input.clone();
        without_watermark["watermark"]["text"] = json!("");
        assert_ne!(bytes, render_summary(&without_watermark).unwrap());
    }
}

#[test]
fn rejects_invalid_schema_and_metadata_without_rendering() {
    assert_eq!(
        render_summary(&json!({"text":"<svg/>"})),
        Err("invalid_input")
    );
    let mut input: Value = serde_json::from_str(include_str!("fixtures/summary-en.json")).unwrap();
    input["watermark"]["contentHash"] = json!("b".repeat(64));
    assert_eq!(render_summary(&input), Err("invalid_input"));
    input["locale"] = json!("unknown");
    assert_eq!(render_summary(&input), Err("invalid_input"));
}

#[test]
fn renders_user_supplied_cjk_names_outside_the_ui_vocabulary() {
    let input: Value = serde_json::from_str(include_str!("fixtures/summary-zh-CN.json")).unwrap();
    for glyph in ["侍", "饕", "餮", "鑫"] {
        let mut with_glyph = input.clone();
        with_glyph["text"] = json!(format!(
            "{glyph}\n{}",
            input["contentHash"].as_str().unwrap()
        ));
        let mut blank = with_glyph.clone();
        blank["text"] = json!(format!(" \n{}", input["contentHash"].as_str().unwrap()));
        assert!(
            render_summary(&with_glyph).unwrap() != render_summary(&blank).unwrap(),
            "missing rendered glyph {glyph}"
        );
    }
}

#[tokio::test]
async fn http_rejects_invalid_payload_and_returns_png() {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    let app = taff_render::router();
    let invalid = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/render/summary")
                .method("POST")
                .header("content-type", "application/json")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(invalid.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let response = app
        .oneshot(
            Request::builder()
                .uri("/render/summary")
                .method("POST")
                .header("content-type", "application/json")
                .body(Body::from(include_str!("fixtures/summary-en.json")))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "image/png");
    let bytes = axum::body::to_bytes(response.into_body(), 400 * 1024)
        .await
        .unwrap();
    assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
}

fn layout_input(locale: &str) -> Value {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    serde_json::from_slice(
        &std::fs::read(base.join(format!("summary-layout-{locale}.json"))).unwrap(),
    )
    .unwrap()
}

#[test]
fn designed_layout_renders_colour_goldens_with_hash_metadata() {
    let hasher = HasherConfig::new().hash_size(16, 16).to_hasher();
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    for locale in ["en", "zh-CN", "zh-HK"] {
        let input = layout_input(locale);
        let (bytes, version) = render_versioned(&input).unwrap();
        assert_eq!(version, "image-2");
        assert!(bytes.len() < 400 * 1024, "{locale} size {}", bytes.len());
        assert_eq!(
            text_chunk(&bytes, "taff:content-hash").as_deref(),
            input["contentHash"].as_str()
        );
        let actual = image::load_from_memory(&bytes).unwrap();
        assert_eq!(actual.width(), 1080);
        let rgb = actual.to_rgb8();
        assert!(
            rgb.pixels().any(|p| p.0[0] != p.0[1] || p.0[1] != p.0[2]),
            "{locale} must be colour"
        );
        let path = base.join(format!("summary-layout-{locale}.png"));
        if std::env::var("UPDATE_RENDER_GOLDENS").as_deref() == Ok("1") {
            std::fs::write(&path, &bytes).unwrap();
        }
        let expected = image::open(path).unwrap();
        assert_eq!(actual.height(), expected.height(), "{locale} height");
        assert!(
            hasher
                .hash_image(&actual)
                .dist(&hasher.hash_image(&expected))
                <= 2,
            "{locale} perceptual drift"
        );
        let mut without_watermark = input.clone();
        without_watermark["watermark"]["text"] = json!("");
        assert_ne!(bytes, render_summary(&without_watermark).unwrap());
    }
}

#[test]
fn designed_layout_rejects_mismatched_hashes_and_unknown_fields() {
    let mut input = layout_input("en");
    input["layout"]["footer"]["hashFull"] = json!("b".repeat(64));
    assert_eq!(render_summary(&input), Err("invalid_input"));
    let mut input = layout_input("en");
    input["layout"]["kpis"][0]["tone"] = json!("purple");
    assert_eq!(render_summary(&input), Err("invalid_input"));
    let mut input = layout_input("en");
    input["layout"]["extra"] = json!(true);
    assert_eq!(render_summary(&input), Err("invalid_input"));
}

#[test]
fn designed_layout_wraps_long_names_and_renders_cjk_user_glyphs() {
    let mut input = layout_input("zh-CN");
    let long = "侍饕餮鑫".repeat(30);
    input["layout"]["projects"][0]["name"] = json!(long.clone());
    input["layout"]["projects"][0]["sections"][0]["items"][0]["title"] = json!("x".repeat(200));
    let tall = image::load_from_memory(&render_summary(&input).unwrap()).unwrap();
    let base = image::load_from_memory(&render_summary(&layout_input("zh-CN")).unwrap()).unwrap();
    // Two-line clamps: the name and the title each grow by at most one line.
    assert!(tall.height() > base.height());
    assert!(tall.height() <= base.height() + 40 + 30);
    let mut blank = input.clone();
    blank["layout"]["projects"][0]["name"] = json!(" ");
    assert_ne!(
        render_summary(&input).unwrap(),
        render_summary(&blank).unwrap()
    );
}

/// Worst case the TypeScript fit can send (IMAGE_HEIGHT_BUDGET = 3400 with
/// IMAGE_GEOMETRY): one project, five sections of 3, 3, 3, 2 and 2 two-line items, every
/// optional line present. It must render, inside both caps.
#[test]
fn designed_layout_stays_within_caps_at_the_fitted_budget() {
    let mut input = layout_input("en");
    let project = &mut input["layout"]["projects"][0];
    project["name"] = json!("Checkout platform ".repeat(7).trim_end());
    let item = json!({
        "taskId": "00000000-0000-4000-8000-000000009999",
        "number": "#9999",
        "title": "Reconcile settlement batches across regional acquirers and verify ".repeat(3).trim_end(),
        "detail": "Mia Wong · Due Oct 8, 2026",
        "overdue": true,
    });
    let section = project["sections"][0].clone();
    project["sections"] = json!(
        [
            "completedToday",
            "movedToday",
            "dueToday",
            "overdue",
            "blocked"
        ]
        .iter()
        .enumerate()
        .map(|(index, key)| {
            let mut section = section.clone();
            section["key"] = json!(key);
            section["items"] = json!(vec![item.clone(); if index >= 3 { 2 } else { 3 }]);
            section["more"] = json!("+6 more");
            section
        })
        .collect::<Vec<_>>()
    );
    input["layout"]["moreProjects"] = json!("+99 more projects");
    let bytes = render_summary(&input).unwrap();
    let image = image::load_from_memory(&bytes).unwrap();
    let estimate = 382 + 308 + 272 + 504 + 5 * (80 + 30) + 13 * 96 + 50;
    assert!(estimate <= 3400);
    assert!(
        image.height() <= estimate,
        "height {} > estimate {estimate}",
        image.height()
    );
    eprintln!("worst case: {} px, {} bytes", image.height(), bytes.len());
    assert!(bytes.len() < 400 * 1024, "size {}", bytes.len());
}

fn timeline_input(locale: &str) -> Value {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    serde_json::from_slice(&std::fs::read(base.join(format!("timeline-{locale}.json"))).unwrap())
        .unwrap()
}
#[test]
fn timeline_renders_three_locale_goldens_with_hash_and_caps() {
    let hasher = HasherConfig::new().hash_size(16, 16).to_hasher();
    for locale in ["en", "zh-CN", "zh-HK"] {
        let input = timeline_input(locale);
        let bytes = taff_render::render_timeline(&input).unwrap();
        assert!(bytes.len() <= 400 * 1024);
        assert_eq!(
            text_chunk(&bytes, "taff:content-hash").as_deref(),
            input["contentHash"].as_str()
        );
        let actual = image::load_from_memory(&bytes).unwrap();
        assert_eq!(actual.width(), 1600);
        assert_eq!(
            actual.height(),
            input["layout"]["height"].as_u64().unwrap() as u32
        );
        assert!(actual.height() <= 4000);
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join(format!("tests/fixtures/timeline-{locale}.png"));
        if std::env::var("UPDATE_RENDER_GOLDENS").as_deref() == Ok("1") {
            std::fs::write(&path, &bytes).unwrap();
        }
        let expected = image::open(path).unwrap();
        assert_eq!(expected.height(), actual.height());
        assert!(
            hasher
                .hash_image(&actual)
                .dist(&hasher.hash_image(&expected))
                <= 2
        );
        let mut blank = input.clone();
        blank["watermark"]["text"] = json!("");
        assert_ne!(bytes, taff_render::render_timeline(&blank).unwrap());
    }
}
#[test]
fn timeline_rejects_invalid_bounds_and_hash_before_rasterization() {
    for (path, value) in [
        ("/layout/height", json!(4001)),
        ("/layout/height", json!(319)),
        ("/layout/width", json!(1601)),
        ("/layout/todayX", json!(-1)),
        ("/layout/rows/0/x", json!(1e100)),
        ("/layout/rows/0/y", json!(3700)),
        ("/layout/rows/0/endX", json!(0)),
        ("/layout/dependencies/0/to", json!(59)),
        ("/layout/dependencies/0/from", json!(0.5)),
        ("/layout/title", json!("x".repeat(201))),
        ("/layout/footer/hashFull", json!("b".repeat(64))),
        ("/watermark/contentHash", json!("b".repeat(64))),
        ("/watermark/text", json!("x".repeat(501))),
    ] {
        let mut input = timeline_input("en");
        *input.pointer_mut(path).unwrap() = value;
        assert_eq!(
            taff_render::render_timeline(&input),
            Err("invalid_input"),
            "{path}"
        );
    }
    let mut input = timeline_input("en");
    input["layout"]["rows"] = json!(vec![input["layout"]["rows"][0].clone(); 61]);
    assert_eq!(taff_render::render_timeline(&input), Err("invalid_input"));
    let mut input = timeline_input("en");
    input["svg"] = json!("<svg/>");
    assert_eq!(taff_render::render_timeline(&input), Err("invalid_input"));
}
#[test]
fn timeline_sixty_rows_remain_within_delivery_caps() {
    let mut input = timeline_input("zh-HK");
    let mut rows = Vec::new();
    for index in 0..60 {
        let mut row = input["layout"]["rows"][index % 6].clone();
        row["y"] = json!(194 + index * 52);
        row["title"] = json!("侍饕餮鑫".repeat(55));
        rows.push(row);
    }
    input["layout"]["rows"] = json!(rows);
    input["layout"]["height"] = json!(3400);
    let png = taff_render::render_timeline(&input).unwrap();
    assert!(png.len() <= 400 * 1024);
    assert_eq!(image::load_from_memory(&png).unwrap().height(), 3400);
    eprintln!("timeline maximum rows: {} bytes", png.len());
}
#[tokio::test]
async fn timeline_http_version_and_validation() {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    for valid in [false, true] {
        let response = taff_render::router()
            .oneshot(
                Request::builder()
                    .uri("/render/timeline")
                    .method("POST")
                    .header("content-type", "application/json")
                    .body(Body::from(if valid {
                        timeline_input("en").to_string()
                    } else {
                        "{}".to_string()
                    }))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            if valid {
                StatusCode::OK
            } else {
                StatusCode::UNPROCESSABLE_ENTITY
            }
        );
        if valid {
            assert_eq!(response.headers()["x-taff-renderer"], "timeline-1");
            assert_eq!(response.headers()["cache-control"], "no-store");
        }
    }
}

fn calendar_input(locale: &str, mode: &str) -> Value {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    serde_json::from_slice(
        &std::fs::read(base.join(format!("calendar-{mode}-{locale}.json"))).unwrap(),
    )
    .unwrap()
}
#[test]
fn calendar_week_and_month_three_locale_goldens_have_hash_and_caps() {
    let hasher = HasherConfig::new().hash_size(16, 16).to_hasher();
    for locale in ["en", "zh-CN", "zh-HK"] {
        for mode in ["week", "month"] {
            let input = calendar_input(locale, mode);
            let bytes = taff_render::render_calendar(&input).unwrap();
            assert!(bytes.len() <= 400 * 1024);
            assert_eq!(bytes[25], 3, "palette PNG");
            assert_eq!(
                text_chunk(&bytes, "taff:content-hash").as_deref(),
                input["contentHash"].as_str()
            );
            let actual = image::load_from_memory(&bytes).unwrap();
            assert_eq!(actual.width(), 1600);
            assert_eq!(
                actual.height(),
                input["layout"]["height"].as_u64().unwrap() as u32
            );
            assert!(actual.height() <= 4000);
            let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join(format!("tests/fixtures/calendar-{mode}-{locale}.png"));
            if std::env::var("UPDATE_RENDER_GOLDENS").as_deref() == Ok("1") {
                std::fs::write(&path, &bytes).unwrap();
            }
            let expected = image::open(path).unwrap();
            assert_eq!(expected.height(), actual.height());
            assert!(
                hasher
                    .hash_image(&actual)
                    .dist(&hasher.hash_image(&expected))
                    <= 2,
                "{mode} {locale} drift"
            );
            let mut blank = input.clone();
            blank["watermark"]["text"] = json!("");
            assert_ne!(bytes, taff_render::render_calendar(&blank).unwrap());
            eprintln!(
                "calendar {mode} {locale}: {} px, {} bytes",
                actual.height(),
                bytes.len()
            );
        }
    }
}
#[test]
fn calendar_rejects_invalid_schema_geometry_and_hash() {
    for (path, value) in [
        ("/layout/height", json!(4001)),
        ("/layout/height", json!(319)),
        ("/layout/height", json!(1e100)),
        ("/layout/width", json!(1599)),
        ("/layout/mode", json!("day")),
        ("/layout/cells/0/x", json!(-1)),
        ("/layout/cells/0/x", json!(45)),
        ("/layout/cells/0/y", json!(1e100)),
        ("/layout/cells/0/height", json!(3700)),
        ("/layout/cells/0/timedY", json!(0)),
        ("/layout/cells/0/items/0/y", json!(3900)),
        ("/layout/title", json!("x".repeat(201))),
        ("/layout/footer/hashFull", json!("b".repeat(64))),
        ("/watermark/contentHash", json!("b".repeat(64))),
        ("/watermark/text", json!("x".repeat(501))),
    ] {
        let mut input = calendar_input("en", "week");
        *input.pointer_mut(path).unwrap() = value;
        assert_eq!(
            taff_render::render_calendar(&input),
            Err("invalid_input"),
            "{path}"
        );
    }
    for count in [0, 8, 43] {
        let mut input = calendar_input("en", "week");
        input["layout"]["cells"] = json!(vec![input["layout"]["cells"][0].clone(); count]);
        assert_eq!(taff_render::render_calendar(&input), Err("invalid_input"));
    }
    let mut input = calendar_input("en", "week");
    input["layout"]["cells"][0]["items"] =
        json!(vec![input["layout"]["cells"][0]["items"][0].clone(); 9]);
    assert_eq!(taff_render::render_calendar(&input), Err("invalid_input"));
    let mut input = calendar_input("en", "week");
    input["svg"] = json!("<svg/>");
    assert_eq!(taff_render::render_calendar(&input), Err("invalid_input"));
}
#[test]
fn calendar_dense_six_week_month_stays_within_delivery_caps() {
    let mut input = calendar_input("zh-HK", "month");
    input["layout"]["height"] = json!(3728);
    for (index, cell) in input["layout"]["cells"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .enumerate()
    {
        let top = 164 + (index / 7) * 572;
        cell["y"] = json!(top);
        cell["height"] = json!(572);
        cell["timedY"] = json!(top + 276);
        cell["items"] = json!((0..8).map(|i| json!({
            "title": "侍饕餮鑫".repeat(55), "detail": "00:00–23:59", "y": if index % 7 == 0 { top + 62 + i * 26 } else { top + 290 + i * 32 },
            "allDay": index % 7 == 0, "continuesBefore": true, "continuesAfter": true,
        })).collect::<Vec<_>>());
    }
    let png = taff_render::render_calendar(&input).unwrap();
    assert!(png.len() <= 400 * 1024);
    assert_eq!(image::load_from_memory(&png).unwrap().height(), 3728);
    eprintln!("calendar dense month: {} bytes", png.len());
}
#[tokio::test]
async fn calendar_http_version_and_validation() {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    for valid in [false, true] {
        let response = taff_render::router()
            .oneshot(
                Request::builder()
                    .uri("/render/calendar")
                    .method("POST")
                    .header("content-type", "application/json")
                    .body(Body::from(if valid {
                        calendar_input("en", "week").to_string()
                    } else {
                        "{}".to_string()
                    }))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            if valid {
                StatusCode::OK
            } else {
                StatusCode::UNPROCESSABLE_ENTITY
            }
        );
        if valid {
            assert_eq!(response.headers()["x-taff-renderer"], "calendar-1");
            assert_eq!(response.headers()["cache-control"], "no-store");
        }
    }
}

#[test]
fn screen_palettes_use_approved_table_ai_tokens() {
    let tokens = include_str!("../../../../apps/web/src/styles/tokens.css");
    for source in [
        include_str!("../src/timeline.rs"),
        include_str!("../src/calendar.rs"),
    ] {
        for suffix in source.split('#').skip(1) {
            let hex: String = suffix.chars().take(6).collect();
            if hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
                assert!(
                    tokens.contains(&format!("#{hex}")),
                    "unapproved colour #{hex}"
                );
            }
        }
    }
}
