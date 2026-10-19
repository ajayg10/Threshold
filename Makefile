# Thin wrapper around scripts/tasks.py (Windows users: .\tasks.ps1 <task>).
PY ?= python

.PHONY: install local test build deploy outputs destroy

install:  ## Create .venv, install backend + web deps, create .env
	$(PY) scripts/tasks.py install

local:    ## Backend on uvicorn :8000 + next dev :3000
	$(PY) scripts/tasks.py local

test:     ## Backend tests
	$(PY) scripts/tasks.py test

build:    ## Lambda bundle (manylinux wheels) + Next.js static export
	$(PY) scripts/tasks.py build

deploy:   ## build, sam deploy, sync the site to S3, invalidate CloudFront
	$(PY) scripts/tasks.py deploy

outputs:  ## Print stack outputs (site URL, webhook URL, ...)
	$(PY) scripts/tasks.py outputs

destroy:  ## Delete the stack (asks for confirmation)
	$(PY) scripts/tasks.py destroy $(if $(YES),--yes,)
