mod model;
mod scrape;
mod server;

use std::path::PathBuf;
use std::time::Duration;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(about = "Scrape IEC South Africa registered political parties and serve them as a JSON API")]
struct Cli {
    /// Directory holding parties.json and logos/
    #[arg(long, global = true, default_value = "data", env = "IEC_DATA_DIR")]
    data_dir: PathBuf,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Scrape all parties (every level, every page) and download their logos
    Scrape {
        /// Delay between page requests, in milliseconds (be polite)
        #[arg(long, default_value_t = 300)]
        delay_ms: u64,
        #[arg(long)]
        skip_logos: bool,
        #[arg(long, default_value_t = 6)]
        logo_concurrency: usize,
    },
    /// Serve the scraped data over HTTP
    Serve {
        #[arg(long, default_value = "0.0.0.0:8080", env = "BIND")]
        bind: String,
        /// Enables POST /api/refresh when set
        #[arg(long, env = "REFRESH_TOKEN")]
        refresh_token: Option<String>,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .init();
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Scrape { delay_ms, skip_logos, logo_concurrency } => {
            let ds = scrape::run(&scrape::ScrapeOptions {
                out_dir: cli.data_dir,
                delay: Duration::from_millis(delay_ms),
                skip_logos,
                logo_concurrency,
            })
            .await?;
            println!("scraped {} parties, {} logos", ds.count, ds.logos_downloaded);
        }
        Cmd::Serve { bind, refresh_token } => {
            let data = server::load(&cli.data_dir).await?;
            tracing::info!(parties = data.count, %bind, "serving");
            let refresh_token = refresh_token.filter(|t| !t.trim().is_empty());
            let app = server::router(data, cli.data_dir, refresh_token);
            let listener = tokio::net::TcpListener::bind(&bind).await?;
            axum::serve(listener, app).await?;
        }
    }
    Ok(())
}
