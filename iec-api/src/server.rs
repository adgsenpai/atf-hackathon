use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::{Mutex, RwLock};
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};

use crate::model::{Dataset, Party};
use crate::scrape::{self, ScrapeOptions};

#[derive(Clone)]
pub struct AppState {
    data: Arc<RwLock<Dataset>>,
    data_dir: PathBuf,
    refresh_token: Option<String>,
    refreshing: Arc<Mutex<()>>,
}

pub async fn load(data_dir: &std::path::Path) -> anyhow::Result<Dataset> {
    let path = data_dir.join("parties.json");
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| anyhow::anyhow!("cannot read {} ({e}); run `iec-api scrape` first", path.display()))?;
    Ok(serde_json::from_slice(&bytes)?)
}

pub fn router(data: Dataset, data_dir: PathBuf, refresh_token: Option<String>) -> Router {
    let state = AppState {
        data: Arc::new(RwLock::new(data)),
        data_dir: data_dir.clone(),
        refresh_token,
        refreshing: Arc::new(Mutex::new(())),
    };
    Router::new()
        .route("/", get(index))
        .route("/health", get(|| async { "ok" }))
        .route("/api/meta", get(meta))
        .route("/api/levels", get(levels))
        .route("/api/parties", get(list_parties))
        .route("/api/parties/{id}", get(get_party))
        .route("/api/parties/{id}/logo", get(party_logo))
        .route("/api/parties.json", get(download_json))
        .route("/api/refresh", post(refresh))
        .nest_service("/logos", ServeDir::new(data_dir.join("logos")))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn index() -> Json<serde_json::Value> {
    Json(json!({
        "name": "IEC South Africa political parties API",
        "source": scrape::PARTY_URL,
        "endpoints": {
            "GET /api/meta": "dataset info (scrape time, counts)",
            "GET /api/levels": "party counts per registration level",
            "GET /api/parties?q=&level=&has_logo=&limit=&offset=": "search/filter/paginate parties",
            "GET /api/parties/{id}": "one party",
            "GET /api/parties/{id}/logo": "redirects to the party's downloaded logo",
            "GET /api/parties.json": "full dataset download",
            "GET /logos/...": "static logo files",
            "POST /api/refresh": "re-scrape (requires `Authorization: Bearer $REFRESH_TOKEN`)",
        }
    }))
}

async fn meta(State(s): State<AppState>) -> Json<serde_json::Value> {
    let d = s.data.read().await;
    Json(json!({
        "source": d.source,
        "scraped_at": d.scraped_at,
        "count": d.count,
        "logos_downloaded": d.logos_downloaded,
    }))
}

async fn levels(State(s): State<AppState>) -> Json<BTreeMap<String, usize>> {
    let d = s.data.read().await;
    let mut m = BTreeMap::new();
    for p in &d.parties {
        for l in &p.levels {
            *m.entry(l.clone()).or_insert(0) += 1;
        }
    }
    Json(m)
}

#[derive(Deserialize)]
struct ListQuery {
    q: Option<String>,
    level: Option<String>,
    has_logo: Option<bool>,
    limit: Option<usize>,
    offset: Option<usize>,
}

async fn list_parties(State(s): State<AppState>, Query(q): Query<ListQuery>) -> Json<serde_json::Value> {
    let d = s.data.read().await;
    let needle = q.q.as_deref().map(str::to_lowercase).filter(|n| !n.is_empty());
    let level = q.level.as_deref().map(str::to_lowercase);
    let matches: Vec<&Party> = d
        .parties
        .iter()
        .filter(|p| {
            needle.as_ref().is_none_or(|n| {
                p.display_name.to_lowercase().contains(n)
                    || p.abbreviation.as_deref().is_some_and(|a| a.to_lowercase().contains(n))
            })
        })
        .filter(|p| level.as_ref().is_none_or(|l| p.levels.iter().any(|x| x.to_lowercase() == *l)))
        .filter(|p| q.has_logo.is_none_or(|h| p.logo_file.is_some() == h))
        .collect();
    let limit = q.limit.unwrap_or(50).min(5000);
    let offset = q.offset.unwrap_or(0);
    let items: Vec<&Party> = matches.iter().skip(offset).take(limit).copied().collect();
    Json(json!({ "total": matches.len(), "offset": offset, "limit": limit, "items": items }))
}

async fn get_party(State(s): State<AppState>, Path(id): Path<String>) -> Response {
    let d = s.data.read().await;
    match d.parties.iter().find(|p| p.id == id) {
        Some(p) => Json(p).into_response(),
        None => (StatusCode::NOT_FOUND, Json(json!({"error": "party not found"}))).into_response(),
    }
}

async fn party_logo(State(s): State<AppState>, Path(id): Path<String>) -> Response {
    let d = s.data.read().await;
    match d.parties.iter().find(|p| p.id == id).and_then(|p| p.logo_file.clone()) {
        Some(f) => Redirect::temporary(&format!("/{f}")).into_response(),
        None => (StatusCode::NOT_FOUND, Json(json!({"error": "logo not found"}))).into_response(),
    }
}

async fn download_json(State(s): State<AppState>) -> impl IntoResponse {
    let d = s.data.read().await;
    (
        [(axum::http::header::CONTENT_DISPOSITION, "attachment; filename=\"parties.json\"")],
        Json(d.clone()),
    )
}

async fn refresh(State(s): State<AppState>, headers: HeaderMap) -> Response {
    let Some(token) = s.refresh_token.clone() else {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "refresh disabled; set REFRESH_TOKEN"}))).into_response();
    };
    let ok = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v == format!("Bearer {token}"));
    if !ok {
        return (StatusCode::UNAUTHORIZED, Json(json!({"error": "bad token"}))).into_response();
    }
    let Ok(guard) = s.refreshing.clone().try_lock_owned() else {
        return (StatusCode::CONFLICT, Json(json!({"error": "refresh already running"}))).into_response();
    };
    tokio::spawn(async move {
        let _guard = guard;
        let opts = ScrapeOptions {
            out_dir: s.data_dir.clone(),
            delay: std::time::Duration::from_millis(300),
            skip_logos: false,
            logo_concurrency: 6,
        };
        match scrape::run(&opts).await {
            Ok(ds) => *s.data.write().await = ds,
            Err(e) => tracing::error!(error = %e, "refresh failed"),
        }
    });
    (StatusCode::ACCEPTED, Json(json!({"status": "refresh started"}))).into_response()
}
