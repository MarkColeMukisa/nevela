# The Rust contender: Axum, Tokio and sqlx, built for release (fat LTO, one codegen unit)
# and run as one small binary. Tokio's worker threads are set to the CPUs every app gets.
FROM rust:1.91-slim-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && cargo build --release --locked && rm -rf src
COPY src ./src
RUN touch src/main.rs && cargo build --release --locked

FROM debian:bookworm-slim
COPY --from=build /src/target/release/rust-bench /usr/local/bin/rust-bench
EXPOSE 8080
CMD ["rust-bench"]
