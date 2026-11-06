use image_hasher::HasherConfig;
use serde_json::{Value, json};
use std::path::PathBuf;
use taff_render::render_summary;

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
