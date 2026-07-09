# Collaberry developer shortcuts. On Windows these run under Git Bash / WSL.

COMPOSE = docker compose

.PHONY: help up dev down build logs ps test test-unit test-e2e stress fe-check clean

help:
	@echo "up          - build + start the whole stack (Envoy on :8088)"
	@echo "dev         - start in watch mode: backend hot-reloads on edit, no rebuild"
	@echo "down        - stop and remove everything"
	@echo "logs        - tail all service logs"
	@echo "test        - run unit + integration + e2e (brings the stack up)"
	@echo "test-unit   - per-service unit tests (no stack needed)"
	@echo "test-e2e    - end-to-end tests through Envoy"
	@echo "stress      - locust REST load + WebSocket storm"
	@echo "fe-check    - type-check the React Native app"

up:
	$(COMPOSE) up --build -d

dev:
	bash scripts/dev.sh

down:
	$(COMPOSE) down -v

build:
	$(COMPOSE) build

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

test:
	bash scripts/run-tests.sh

test-unit:
	bash scripts/run-unit.sh

test-e2e:
	bash scripts/run-e2e.sh

stress:
	bash scripts/run-stress.sh

fe-check:
	cd frontend && npx tsc --noEmit

clean: down
	docker volume rm collaberry_keys collaberry_mongo-data 2>/dev/null || true
