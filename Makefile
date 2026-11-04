.PHONY: install lint test build deploy

install:
	python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
	cd web && npm ci

lint:
	.venv/bin/ruff check api tests
	.venv/bin/ruff format --check api tests
	.venv/bin/cfn-lint infra/template.yaml
	cd web && npm run lint

test:
	.venv/bin/python -m pytest -q
	cd web && npm test

build:
	cd web && npm run build

deploy:
	./infra/deploy.sh
