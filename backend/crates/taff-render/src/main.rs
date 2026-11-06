#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let address = std::env::var("RENDER_LISTEN").unwrap_or_else(|_| "0.0.0.0:3002".into());
    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(listener, taff_render::router())
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
