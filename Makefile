.PHONY: up down reset logs test dev-api dev-web

up:
	docker compose up --build -d

down:
	docker compose down

reset:
	docker compose down -v
	docker compose up --build -d

logs:
	docker compose logs -f api web

test:
	node scripts/smoke.mjs $${BASE_URL:-http://localhost:8088}

dev-api:
	cd api && DATABASE_URL=postgres://civicwatch:civicwatch@localhost:5433/civicwatch UPLOAD_DIR=../.uploads npm run dev

dev-web:
	cd web && npm run dev
