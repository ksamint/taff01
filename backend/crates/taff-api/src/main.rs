use anyhow::{Context, Result};
use std::{env, net::IpAddr};
use taff_api::{AppState, router};
use taff_db::Db;
use tokio::{net::TcpListener, signal};

#[tokio::main]
async fn main() -> Result<()> {
    let port: u16 = env::var("API_RS_PORT")
        .unwrap_or_else(|_| "3003".into())
        .parse()
        .context("API_RS_PORT must be a TCP port")?;
    let host: IpAddr = env::var("API_RS_HOST")
        .unwrap_or_else(|_| "127.0.0.1".into())
        .parse()
        .context("API_RS_HOST must be an IP address")?;
    let database = env::var("DATABASE_URL").context("missing DATABASE_URL")?;
    let db = Db::connect(&database)
        .await
        .map_err(|_| anyhow::anyhow!("database connection failed"))?;
    let auth_secret = env::var("AUTH_SECRET").context("missing AUTH_SECRET")?;
    let auth_url = env::var("AUTH_URL")
        .context("missing AUTH_URL")?
        .parse()
        .map_err(|_| anyhow::anyhow!("AUTH_URL is invalid"))?;
    let state = AppState::new(db, auth_secret, &auth_url)?;
    let listener = TcpListener::bind((host, port)).await?;
    let mut terminate = signal::unix::signal(signal::unix::SignalKind::terminate())?;
    axum::serve(listener, router().with_state(state))
        .with_graceful_shutdown(async move {
            tokio::select! {
                _ = signal::ctrl_c() => {}
                _ = terminate.recv() => {}
            }
        })
        .await?;
    Ok(())
}
