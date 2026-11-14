use image_hasher::HasherConfig;
use serde_json::{Value, json};
use std::path::PathBuf;
use taff_render::{render_graph, text_chunk};

fn fixture(kind: &str, locale: &str) -> Value {
    serde_json::from_slice(
        &std::fs::read(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join(format!("tests/fixtures/graph-{kind}-{locale}.json")),
        )
        .unwrap(),
    )
    .unwrap()
}
fn delivery_bounds(input: &Value, bytes: &[u8]) {
    assert!(bytes.len() <= 400 * 1024, "{} bytes", bytes.len());
    assert_eq!(bytes[25], 3, "indexed palette PNG");
    assert_eq!(
        text_chunk(bytes, "taff:content-hash").as_deref(),
        input["contentHash"].as_str()
    );
    let actual = image::load_from_memory(bytes).unwrap();
    assert_eq!(actual.width(), 1080);
    assert_eq!(
        actual.height(),
        input["layout"]["height"].as_u64().unwrap() as u32
    );
    assert!(actual.height() <= 4000);
}

#[test]
fn graphs_render_six_locale_goldens_with_watermark_hash_and_delivery_bounds() {
    let hasher = HasherConfig::new().hash_size(16, 16).to_hasher();
    for kind in ["mind", "relations"] {
        for locale in ["en", "zh-CN", "zh-HK"] {
            let input = fixture(kind, locale);
            let bytes = render_graph(&input).unwrap();
            delivery_bounds(&input, &bytes);
            let actual = image::load_from_memory(&bytes).unwrap();
            let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join(format!("tests/fixtures/graph-{kind}-{locale}.png"));
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
                "{kind}/{locale} perceptual drift"
            );
            let mut blank = input.clone();
            blank["watermark"]["text"] = json!("");
            assert_ne!(bytes, render_graph(&blank).unwrap());
            eprintln!("{kind}/{locale}: {} bytes", bytes.len());
        }
    }
}

#[test]
fn empty_and_capped_long_cjk_graphs_stay_within_delivery_bounds() {
    for kind in ["mind", "relations"] {
        for size in ["empty", "max", "dense"] {
            let input = fixture(kind, size);
            let bytes = render_graph(&input).unwrap();
            delivery_bounds(&input, &bytes);
            assert_eq!(
                input["layout"]["nodes"].as_array().unwrap().len(),
                if size == "empty" { 0 } else { 150 }
            );
            if size == "dense" {
                assert_eq!(input["layout"]["edges"].as_array().unwrap().len(), 600);
            }
            eprintln!("{kind}/{size}: {} bytes", bytes.len());
        }
    }
}

#[test]
fn graph_rejects_schema_hash_and_projected_bounds_before_pixel_allocation() {
    for (path, value) in [
        ("/layout/height", json!(4001)),
        ("/layout/height", json!(319)),
        ("/layout/width", json!(1081)),
        ("/layout/view/scale", json!(0)),
        ("/layout/view/scale", json!(1e100)),
        ("/layout/view/x", json!(100000)),
        ("/layout/nodes/0/x", json!(1e100)),
        ("/layout/nodes/0/label/width", json!(0)),
        ("/layout/nodes/0/label/text", json!("x".repeat(121))),
        ("/layout/edges/0/to", json!(149)),
        ("/layout/edges/0/from", json!(0.5)),
        ("/layout/edges/0/c1", Value::Null),
        ("/layout/title", json!("x".repeat(201))),
        ("/layout/footer/hashFull", json!("a".repeat(64))),
        ("/watermark/contentHash", json!("a".repeat(64))),
        ("/watermark/text", json!("x".repeat(501))),
    ] {
        let mut input = fixture("relations", "en");
        *input.pointer_mut(path).unwrap() = value;
        assert_eq!(render_graph(&input), Err("invalid_input"), "{path}");
    }
    for (field, length) in [("nodes", 151), ("edges", 601)] {
        let mut input = fixture("relations", "en");
        input["layout"][field] = json!(vec![input["layout"][field][0].clone(); length]);
        assert_eq!(render_graph(&input), Err("invalid_input"));
    }
    let mut input = fixture("relations", "en");
    input["svg"] = json!("<svg/>");
    assert_eq!(render_graph(&input), Err("invalid_input"));
    let mut input = fixture("mind", "en");
    input["layout"]["rings"][0]["radius"] = json!(1000);
    assert_eq!(render_graph(&input), Err("invalid_input"));
    let mut input = fixture("relations", "en");
    input["layout"]["nodes"][1]["key"] = input["layout"]["nodes"][0]["key"].clone();
    assert_eq!(render_graph(&input), Err("invalid_input"));
}

#[test]
fn arbitrary_cjk_labels_render_and_markup_is_escaped() {
    let input = fixture("relations", "zh-CN");
    for glyph in ["侍", "饕", "餮", "鑫", "<path/>"] {
        let mut with_glyph = input.clone();
        with_glyph["layout"]["nodes"][0]["label"]["text"] = json!(glyph);
        let mut blank = with_glyph.clone();
        blank["layout"]["nodes"][0]["label"]["text"] = json!("");
        assert_ne!(
            render_graph(&with_glyph).unwrap(),
            render_graph(&blank).unwrap(),
            "missing escaped label {glyph}"
        );
    }
}

#[tokio::test]
async fn graph_http_version_and_validation() {
    use axum::{
        body::{Body, to_bytes},
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    for valid in [false, true] {
        let response = taff_render::router()
            .oneshot(
                Request::builder()
                    .uri("/render/graph")
                    .method("POST")
                    .header("content-type", "application/json")
                    .body(Body::from(if valid {
                        fixture("mind", "en").to_string()
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
            assert_eq!(response.headers()["x-taff-renderer"], "graph-1");
            assert_eq!(response.headers()["cache-control"], "no-store");
            assert_eq!(response.headers()["content-type"], "image/png");
            let bytes = to_bytes(response.into_body(), 400 * 1024).await.unwrap();
            assert_eq!(
                text_chunk(&bytes, "taff:content-hash").as_deref(),
                Some("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
            );
        }
    }
}
