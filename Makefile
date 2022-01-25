.SUFFIXES:

SRCS := $(wildcard src/*.js) $(wildcard src/*/*.js)
OUTS := public/404.html public/index.html public/style.css public/script.js

HTMLFLAGS ?= --collapse-boolean-attributes --collapse-whitespace \
	--decode-entities --remove-attribute-quotes --remove-comments \
	--remove-empty-attributes --remove-optional-tags \
	--remove-redundant-attributes --remove-script-type-attributes \
	--remove-style-link-type-attributes --sort-attributes \
	--sort-class-name --use-short-doctype --minify-css true --minify-js true
CSSFLAGS ?= -O2
JSFLAGS ?= --compress hoist_funs=true,passes=2,toplevel=true \
	--toplevel --mangle toplevel=true --mangle-props keep_quoted=true,reserved=["imageSmoothingEnabled","clipboard","fromEntries","writeText","actions","client","clientId","clients","data","ellipse","file","fill","height","id","image","latency","line","message","name","num","offset","options","order","outside","password","pos","priv","rect","selection","session","total","type","value","width","x","y","callback","dplaces","lastValue","max","min","timestamp","codec","preset","addExtPacker","addExtUnpacker"]

TZ := America/Toronto

DATE := $(shell TZ='$(TZ)' date +"%b %-e, %Y")
VERSION := $(shell sed -nE 's/^.*"version": "([^"]+)".*/\1/p' package.json)
AUTHOR := $(shell sed -nE 's/^.*"author": "([^"]+)".*/\1/p' package.json)
HOMEPAGE := $(shell sed -nE 's/^.*"homepage": "([^"]+)".*/\1/p' package.json)

INFO = /*\n * Web Draw v$(VERSION) ($(HOMEPAGE))\n * Copyright (C) 2020-$(shell TZ='$(TZ)' date +"%Y") $(AUTHOR)\n * Licensed under the GNU General Public License v3.0\n */

BASE64SUB := 's/(.*)\{\{BASE64:([^}]+)\}\}(.*)/printf "%s%s%s" '\''\1'\'' "data:image\/png;base64,$$(base64 -w 0 < '\''\2'\'')" '\''\3'\''/e'
DATESUB = 's/(.*)\{\{DATE\}\}(.*)/\1$(DATE)\2/'
VERSIONSUB = 's/(.*)\{\{VERSION\}\}(.*)/\1v$(VERSION)\2/'
EXPORTSUB := 's/module\.exports/const Message/'
INFOINS = '1i$(INFO)'
HTMLINFOINS = '1i$(subst $() *, ,$(subst $() */,-->,$(subst /*,<!--,$(INFO))))'

SUBSTITUTE = cp $< $@
build/index.html: SUBSTITUTE = sed -E -e $(BASE64SUB) -e $(DATESUB) -e $(VERSIONSUB) $< > $@
build/style.css build/begin.js: SUBSTITUTE = sed -E $(BASE64SUB) $< > $@
build/message.js: SUBSTITUTE = sed -E $(EXPORTSUB) $< > $@

# Strict mode and IIFE
SEDJS := '1i "use strict";'
SEDMINJS := -e '1i"use strict";(()=>{' -e '$$a})();'

.PHONY: all min clean

# Build output without minification
all: $(OUTS)

# Build and minify output
min: $(patsubst public/%,build/min/%,$(OUTS))
	cp -t public $^

clean:
	rm -rf build
	rm -f $(OUTS)

# Perform substitutions
build/%: src/%
	@mkdir -p $(@D)
	$(SUBSTITUTE)

.SECONDARY: $(patsubst src/%.js,build/%.js,$(SRCS))

build/script.js: $(patsubst src/%.js,build/%.js,$(SRCS))
	@mkdir -p $(@D)
	cat build/begin.js $(filter-out build/begin.js build/end.js,$^) build/end.js > $@

# Regular output
public/script.js: build/script.js
	@mkdir -p $(@D)
	sed -E $(SEDJS) $< > $@
public/%: build/%
	@mkdir -p $(@D)
	cp $< $@

# Minified output
build/min/%.html: build/%.html
	@mkdir -p $(@D)
	npx html-minifier $(HTMLFLAGS) -o $@ $<
	sed -Ei $(HTMLINFOINS) $@
build/min/%.css: build/%.css
	@mkdir -p $(@D)
	npx cleancss $(CSSFLAGS) -o $@ $<
	sed -Ei $(INFOINS) $@
build/min/%.js: build/%.js
	@mkdir -p $(@D)
	sed -E $(SEDMINJS) $< > $@
	npx uglifyjs $(JSFLAGS) -o $@ $@
	sed -Ei $(INFOINS) $@
