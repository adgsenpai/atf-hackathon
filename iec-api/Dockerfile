# --- build ---
FROM rust:1-slim-bookworm AS build
WORKDIR /src
# Cache dependencies separately from source.
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
RUN touch src/main.rs && cargo build --release

# --- runtime ---
FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src/target/release/iec-api /usr/local/bin/iec-api
ENV IEC_DATA_DIR=/app/data \
    BIND=0.0.0.0:8080
VOLUME ["/app/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD curl -fsS http://localhost:8080/health || exit 1
ENTRYPOINT ["iec-api"]
CMD ["serve"]
