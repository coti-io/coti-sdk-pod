PYTHON ?= python3
VENV ?= .venv
PIP := $(VENV)/bin/pip
MKDOCS := $(VENV)/bin/mkdocs

.PHONY: install serve build clean

install:
	$(PYTHON) -m venv $(VENV)
	$(PIP) install -r requirements.txt

serve:
	$(MKDOCS) serve -f mkdocs.yml

build:
	$(MKDOCS) build -f mkdocs.yml --clean

clean:
	rm -rf ../site
