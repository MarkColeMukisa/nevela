//! The Rust contender: Axum on Tokio, with sqlx for Postgres.
//!
//! Written for Nevela's rally to answer exactly as the Bun app from Grit's harness does
//! (apps/bun): the same routes under /api/v1, the same page size and cap, the same searchable
//! columns and sortable allow-list, the same { data, meta } envelope and { error } shape, the
//! same version bump on update. Every products route checks a JWT (HS256) signed with
//! BENCH_JWT_SECRET and reads no database, as Bun's does, so the two are like for like.
//!
//! Axum because it is what most Rust web APIs are built on, and sqlx because it is what most
//! Axum apps talk to Postgres with. sqlx is not an ORM: the queries are written out, which is
//! how Rust APIs are usually written, and one reason they are fast.
//!
//! Tokio runs one worker thread per CPU the container is given (TOKIO_WORKER_THREADS), the
//! same allowance every other app here gets.

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{postgres::PgPoolOptions, PgPool, Postgres, QueryBuilder};
use std::{collections::HashMap, sync::Arc};

const DEFAULT_PAGE_SIZE: i64 = 20;
const MAX_PAGE_SIZE: i64 = 100;
const COLUMNS: &str = "id, name, sku, description, price, stock, active, version, created_at, updated_at";

struct App {
    db: PgPool,
    key: DecodingKey,
    validation: Validation,
}

type Shared = Arc<App>;

#[derive(sqlx::FromRow)]
struct Product {
    id: String,
    name: Option<String>,
    sku: Option<String>,
    description: Option<String>,
    price: Option<Decimal>,
    stock: Option<i64>,
    active: Option<bool>,
    version: i64,
    created_at: Option<DateTime<Utc>>,
    updated_at: Option<DateTime<Utc>>,
}

// numeric(12,2) as a JSON number, as every other app here sends it.
fn shape(p: &Product) -> Value {
    json!({
        "id": p.id,
        "name": p.name,
        "sku": p.sku,
        "description": p.description,
        "price": p.price.and_then(|d| d.to_f64()),
        "stock": p.stock,
        "active": p.active,
        "version": p.version,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    })
}

fn answer(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}
fn error(status: StatusCode, code: &str, message: &str) -> Response {
    answer(status, json!({ "error": { "code": code, "message": message } }))
}
fn not_found() -> Response {
    error(StatusCode::NOT_FOUND, "NOT_FOUND", "Product not found")
}
fn oops() -> Response {
    error(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Request failed")
}

#[derive(Deserialize)]
struct Claims {
    #[allow(dead_code)]
    exp: u64,
}

// The signed-in caller: a JWT, HS256, under BENCH_JWT_SECRET, not expired.
fn signed_in(app: &App, headers: &HeaderMap) -> Result<(), Response> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    match token.map(|t| decode::<Claims>(t, &app.key, &app.validation)) {
        Some(Ok(_)) => Ok(()),
        _ => Err(error(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "Sign in first")),
    }
}

async fn health() -> Response {
    answer(StatusCode::OK, json!({ "status": "ok" }))
}

async fn list(State(app): State<Shared>, headers: HeaderMap, Query(q): Query<HashMap<String, String>>) -> Response {
    if let Err(r) = signed_in(&app, &headers) {
        return r;
    }
    let page = q.get("page").and_then(|v| v.parse::<i64>().ok()).filter(|p| *p >= 1).unwrap_or(1);
    let page_size = q
        .get("page_size")
        .and_then(|v| v.parse::<i64>().ok())
        .filter(|s| (1..=MAX_PAGE_SIZE).contains(s))
        .unwrap_or(DEFAULT_PAGE_SIZE);
    let search = q.get("search").filter(|s| !s.is_empty()).map(|s| format!("%{s}%"));
    // The sortable columns are an allow-list, so a column name is never taken from the request.
    let column = match q.get("sort_by").map(String::as_str) {
        Some("id") => "id",
        Some("name") => "name",
        Some("sku") => "sku",
        Some("description") => "description",
        Some("stock") => "stock",
        _ => "created_at",
    };
    let direction = match q.get("sort_order").map(|s| s.to_ascii_lowercase()) {
        Some(s) if s == "asc" => "ASC",
        _ => "DESC",
    };

    let filter = |b: &mut QueryBuilder<'_, Postgres>| {
        b.push(" WHERE deleted_at IS NULL");
        if let Some(s) = &search {
            b.push(" AND (lower(name) LIKE lower(").push_bind(s.clone());
            b.push(") OR lower(sku) LIKE lower(").push_bind(s.clone());
            b.push(") OR lower(description) LIKE lower(").push_bind(s.clone());
            b.push("))");
        }
    };

    // Two queries, as every other app here: one count, one page.
    let mut counting = QueryBuilder::<Postgres>::new("SELECT count(*) FROM products");
    filter(&mut counting);
    let mut paging = QueryBuilder::<Postgres>::new(format!("SELECT {COLUMNS} FROM products"));
    filter(&mut paging);
    paging.push(format!(" ORDER BY {column} {direction} LIMIT ")).push_bind(page_size);
    paging.push(" OFFSET ").push_bind((page - 1) * page_size);

    let (total, rows) = tokio::join!(
        counting.build_query_scalar::<i64>().fetch_one(&app.db),
        paging.build_query_as::<Product>().fetch_all(&app.db),
    );
    let (Ok(total), Ok(rows)) = (total, rows) else { return oops() };

    answer(
        StatusCode::OK,
        json!({
            "data": rows.iter().map(shape).collect::<Vec<_>>(),
            "meta": {
                "total": total,
                "page": page,
                "page_size": page_size,
                "pages": (total + page_size - 1) / page_size,
            },
        }),
    )
}

async fn show(State(app): State<Shared>, headers: HeaderMap, Path(id): Path<String>) -> Response {
    if let Err(r) = signed_in(&app, &headers) {
        return r;
    }
    let row = sqlx::query_as::<_, Product>(&format!("SELECT {COLUMNS} FROM products WHERE id = $1 AND deleted_at IS NULL LIMIT 1"))
        .bind(&id)
        .fetch_optional(&app.db)
        .await;
    match row {
        Ok(Some(p)) => answer(StatusCode::OK, json!({ "data": shape(&p) })),
        Ok(None) => not_found(),
        Err(_) => oops(),
    }
}

#[derive(Deserialize, Default)]
struct Body {
    name: Option<Value>,
    sku: Option<Value>,
    description: Option<String>,
    price: Option<f64>,
    stock: Option<i64>,
    active: Option<bool>,
}

fn read_body(bytes: &[u8]) -> Body {
    serde_json::from_slice(bytes).unwrap_or_default()
}

async fn create(State(app): State<Shared>, headers: HeaderMap, bytes: axum::body::Bytes) -> Response {
    if let Err(r) = signed_in(&app, &headers) {
        return r;
    }
    let b = read_body(&bytes);
    let Some(name) = b.name.as_ref().and_then(Value::as_str).filter(|s| !s.is_empty()) else {
        return error(StatusCode::UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "name is required");
    };
    let Some(sku) = b.sku.as_ref().and_then(Value::as_str).filter(|s| !s.is_empty()) else {
        return error(StatusCode::UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "sku is required");
    };
    let now = Utc::now();
    let row = sqlx::query_as::<_, Product>(&format!(
        "INSERT INTO products (id, name, sku, description, price, stock, active, version, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $8) RETURNING {COLUMNS}"
    ))
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(name)
    .bind(sku)
    .bind(b.description.unwrap_or_default())
    .bind(Decimal::from_f64_retain(b.price.unwrap_or(0.0)).unwrap_or_default().round_dp(2))
    .bind(b.stock.unwrap_or(0))
    .bind(b.active.unwrap_or(false))
    .bind(now)
    .fetch_one(&app.db)
    .await;
    match row {
        Ok(p) => answer(StatusCode::CREATED, json!({ "data": shape(&p), "message": "Product created successfully" })),
        Err(_) => oops(),
    }
}

async fn update(State(app): State<Shared>, headers: HeaderMap, Path(id): Path<String>, bytes: axum::body::Bytes) -> Response {
    if let Err(r) = signed_in(&app, &headers) {
        return r;
    }
    let b = read_body(&bytes);
    let mut q = QueryBuilder::<Postgres>::new("UPDATE products SET version = version + 1, updated_at = ");
    q.push_bind(Utc::now());
    if let Some(v) = b.name.as_ref().and_then(Value::as_str) {
        q.push(", name = ").push_bind(v.to_owned());
    }
    if let Some(v) = b.sku.as_ref().and_then(Value::as_str) {
        q.push(", sku = ").push_bind(v.to_owned());
    }
    if let Some(v) = b.description {
        q.push(", description = ").push_bind(v);
    }
    if let Some(v) = b.price {
        q.push(", price = ").push_bind(Decimal::from_f64_retain(v).unwrap_or_default().round_dp(2));
    }
    if let Some(v) = b.stock {
        q.push(", stock = ").push_bind(v);
    }
    if let Some(v) = b.active {
        q.push(", active = ").push_bind(v);
    }
    q.push(" WHERE id = ").push_bind(id).push(format!(" AND deleted_at IS NULL RETURNING {COLUMNS}"));
    match q.build_query_as::<Product>().fetch_optional(&app.db).await {
        Ok(Some(p)) => answer(StatusCode::OK, json!({ "data": shape(&p), "message": "Product updated successfully" })),
        Ok(None) => not_found(),
        Err(_) => oops(),
    }
}

async fn destroy(State(app): State<Shared>, headers: HeaderMap, Path(id): Path<String>) -> Response {
    if let Err(r) = signed_in(&app, &headers) {
        return r;
    }
    let done = sqlx::query("UPDATE products SET deleted_at = $1 WHERE id = $2 AND deleted_at IS NULL")
        .bind(Utc::now())
        .bind(id)
        .execute(&app.db)
        .await;
    match done {
        Ok(r) if r.rows_affected() > 0 => answer(StatusCode::OK, json!({ "message": "Product deleted successfully" })),
        Ok(_) => not_found(),
        Err(_) => oops(),
    }
}

#[tokio::main]
async fn main() {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let max = std::env::var("DB_MAX_OPEN_CONNS").ok().and_then(|v| v.parse().ok()).unwrap_or(100);
    let db = PgPoolOptions::new().max_connections(max).connect_lazy(&url).expect("DATABASE_URL");
    let secret = std::env::var("BENCH_JWT_SECRET").unwrap_or_default();
    let app = Arc::new(App {
        db,
        key: DecodingKey::from_secret(secret.as_bytes()),
        validation: Validation::new(Algorithm::HS256),
    });

    let routes = Router::new()
        .route("/api/health", get(health))
        .route("/up", get(health))
        .route("/api/v1/products", get(list).post(create))
        .route("/api/v1/products/{id}", get(show).put(update).delete(destroy))
        .with_state(app);

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await.expect("port");
    axum::serve(listener, routes).await.expect("server");
}
