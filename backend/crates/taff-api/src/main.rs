use anyhow::{Context, Result};
use std::{env, net::Ipv4Addr};
use taff_api::{AppState, router};
use taff_db::Db;
use tokio::{net::TcpListener, signal};

#[tokio::main]
async fn main() -> Result<()> {
    let port: u16 = env::var("API_RS_PORT")
        .unwrap_or_else(|_| "3003".into())
        .parse()
        .context("API_RS_PORT must be a TCP port")?;
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
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await?;
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
