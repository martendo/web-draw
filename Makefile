.SUFFIXES:

SRCS := $(wildcard src/*) $(wildcard src/*/*)
TSSRCS := $(wildcard src/*.ts) $(wildcard src/*/*.ts)
OUTS := public/404.html public/index.html public/style.css public/script.js

HTMLFLAGS ?= --collapse-boolean-attributes --collapse-whitespace \
	--decode-entities --remove-attribute-quotes --remove-comments \
	--remove-empty-attributes --remove-optional-tags \
	--remove-redundant-attributes --remove-script-type-attributes \
	--remove-style-link-type-attributes --sort-attributes \
	--sort-class-name --use-short-doctype --minify-css true --minify-js true
CSSFLAGS ?= -O2
WPFLAGS ?= --mode development
build/min/script.js: WPFLAGS := --mode production
ENTRY := src/main.ts
TSCSERVERFLAGS := --target es2017 --module CommonJS

TZ := America/Toronto

DATE = $(shell TZ='$(TZ)' date +"%b %-e, %Y")
YEAR = $(shell TZ='$(TZ)' date +"%Y")
VERSION := $(shell sed -nE 's/^.*"version": "([^"]+)".*$$/\1/p' package.json)
AUTHOR := $(shell sed -nE 's/^.*"author": "([^"]+)".*$$/\1/p' package.json)
HOMEPAGE := $(shell sed -nE 's/^.*"homepage": "([^"]+)".*$$/\1/p' package.json)

HTMLINFOINS = '1i<!--\n  Web Draw v$(VERSION) ($(HOMEPAGE))\n  Copyright (C) 2020-$(YEAR) $(AUTHOR)\n  Licensed under the GNU General Public License v3.0\n-->'
CSSINFOINS = '1i/*\n * Web Draw v$(VERSION) ($(HOMEPAGE))\n * Copyright (C) 2020-$(YEAR) $(AUTHOR)\n * Licensed under the GNU General Public License v3.0\n */'
JSINFOINS = '1i/*\n * Web Draw v$(VERSION) ($(HOMEPAGE))\n * Copyright (C) 2020-$(YEAR) $(AUTHOR)\n * Licensed under the GNU General Public License v3.0\n *\n * Using msgpack-lite (https://github.com/kawanet/msgpack-lite)\n * Copyright (C) 2015-2016 Yusuke Kawasaki\n * Licensed under the MIT License\n */'

BASE64SUB := 's/(.*)\{\{BASE64:([^}]+)\}\}(.*)/printf "%s%s%s" '\''\1'\'' "data:image\/png;base64,$$(base64 -w 0 < '\''\2'\'')" '\''\3'\''/e'
DATESUB = 's/(.*)\{\{DATE\}\}(.*)/\1$(DATE)\2/'
YEARSUB = 's/(.*)\{\{YEAR\}\}(.*)/\1$(YEAR)\2/'
VERSIONSUB = 's/(.*)\{\{VERSION\}\}(.*)/\1v$(VERSION)\2/'

SUBSTITUTE = cp $< $@
build/sub/index.html: SUBSTITUTE = sed -E -e $(BASE64SUB) -e $(DATESUB) -e $(YEARSUB) -e $(VERSIONSUB) $< > $@
build/sub/style.css build/sub/images.ts: SUBSTITUTE = sed -E $(BASE64SUB) $< > $@

.PHONY: all min clean

# Build output without minification
all: $(patsubst public/%,build/sub/%,$(OUTS))
	cp -t public $^

# Build and minify output
min: $(patsubst public/%,build/min/%,$(OUTS))
	cp -t public $^

# Compile server code
server.js: server.ts src/message.ts
	npx tsc $(TSCSERVERFLAGS) $<
	rm src/message.js

clean:
	rm -rf build
	rm -f $(OUTS)
	rm -f server.js

# Perform substitutions
build/sub/%: src/%
	@mkdir -p $(@D)
	$(SUBSTITUTE)
.SECONDARY: $(patsubst src/%,build/sub/%,$(SRCS))

# Compile and bundle TypeScript
build/%/script.js: webpack.config.js tsconfig.json $(patsubst src/%.ts,build/sub/%.ts,$(TSSRCS))
	@mkdir -p $(@D)
	npx webpack $(WPFLAGS) --config $< --output-path ./$(@D) --output-filename $(@F) --entry ./$(patsubst src/%,build/sub/%,$(ENTRY))
	sed -Ei $(JSINFOINS) $@

# Minified output
build/min/%.html: build/sub/%.html
	@mkdir -p $(@D)
	npx html-minifier $(HTMLFLAGS) -o $@ $<
	sed -Ei $(HTMLINFOINS) $@
build/min/%.css: build/sub/%.css
	@mkdir -p $(@D)
	npx cleancss $(CSSFLAGS) -o $@ $<
	sed -Ei $(CSSINFOINS) $@
# JavaScript minified by webpack invocation above in production mode (target build/min/script.js)
