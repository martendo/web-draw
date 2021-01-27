"use strict";

const HTMLMinifier = require("html-minifier");
const CleanCSS = require("clean-css");
const UglifyJS = require("uglify-es");

module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON("package.json"),
    
    cssOptions: {
      level: 2
    },
    jsOptions: {
      mangle: {
        toplevel: true,
        properties: {
          regex: /^_/
        }
      }
    },
    
    copy: {
      build: {
        files: {
          "public/index.html": "src/index.html",
          "public/style.css": "src/style.css",
          "public/404.html": "src/404.html"
        }
      }
    },
    
    concat: {
      build: {
        options: {
          separator: "\n",
          main: "src/script.js",
          // Immediately Invoked Function Expression
          start: "\"use strict\";(() => {",
          end: "})();"
        },
        files: {
          "public/script.js": ["src/**/*.js"]
        }
      },
      debug: {
        options: {
          separator: "\n",
          main: "src/script.js",
          start: "\"use strict\";"
        },
        files: {
          "public/script.js": ["src/**/*.js"]
        }
      }
    },
    
    htmlmin: {
      options: {
        collapseBooleanAttributes: true,
        collapseWhitespace: true,
        decodeEntities: true,
        removeAttributeQuotes: true,
        removeComments: true,
        removeEmptyAttributes: true,
        removeOptionalTags: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        sortAttributes: true,
        sortClassName: true,
        useShortDoctype: true,
        minifyCSS: "<%= cssOptions %>",
        minifyJS: "<%= jsOptions %>"
      },
      build: {
        files: {
          "public/index.html": "public/index.html",
          "public/404.html": "public/404.html"
        }
      }
    },
    
    uglify: {
      build: {
        options: "<%= jsOptions %>",
        files: {
          "public/script.js": "public/script.js"
        }
      }
    },
    
    cssmin: {
      build: {
        options: "<%= cssOptions %>",
        files: {
          "public/style.css": "public/style.css"
        }
      }
    },
    
    replace: {
      build: {
        files: {
          "public/index.html": [{
            from: /{{ DATE }}/g,
            to: "<%= grunt.template.today(\"mediumDate\") %>"
          }, {
            from: /{{ VERSION }}/g,
            to: "v<%= pkg.version %>"
          }]
        }
      }
    },
    
    banner: {
      build: {
        options: {
          banner: {
            normal: "/*\n" +
                    " * Web Draw v<%= pkg.version %> (<%= pkg.homepage %>)\n" +
                    " * Copyright (C) 2020-<%= grunt.template.today('yyyy') %> <%= pkg.author %>\n" +
                    " * Licensed under the GNU General Public License v3.0\n" +
                    " */\n",
            html: "<!--\n" +
                  "  Web Draw v<%= pkg.version %> (<%= pkg.homepage %>)\n" +
                  "  Copyright (C) 2020-<%= grunt.template.today('yyyy') %> <%= pkg.author %>\n" +
                  "  Licensed under the GNU General Public License v3.0\n" +
                  "-->\n"
          }
        },
        src: ["public/*.{js,html,css}"]
      }
    }
  });
  
  // html-minifier
  grunt.registerMultiTask("htmlmin", function () {
    this.files.forEach((file) => {
      const src = file.src[0];
      var result;
      try {
        result = HTMLMinifier.minify(grunt.file.read(src), this.options());
      } catch (err) {
        grunt.warn(src + "\n" + err);
        return;
      }
      grunt.file.write(file.dest, result);
    });
  });
  
  // clean-css
  grunt.registerMultiTask("cssmin", function () {
    this.files.forEach((file) => {
      const src = file.src[0];
      const result = new CleanCSS(this.options()).minify(grunt.file.read(src));
      if (result.errors.length) {
        grunt.warn(src + "\n" + result.errors);
        return;
      }
      if (result.warnings.length) {
        grunt.warn(src + "\n" + result.warnings);
      }
      grunt.file.write(file.dest, result.styles);
    });
  });
  
  // UglifyJS
  grunt.registerMultiTask("uglify", function () {
    this.files.forEach((file) => {
      const src = file.src[0];
      const result = UglifyJS.minify(grunt.file.read(src), this.options());
      if (result.error) {
        grunt.warn(src + "\n" + JSON.stringify(result.error));
        return;
      }
      if (result.warnings) {
        grunt.warn(src + "\n" + result.warnings);
      }
      grunt.file.write(file.dest, result.code);
    });
  });
  
  // replace
  grunt.registerMultiTask("replace", function () {
    this.files.forEach((file) => {
      file = file.dest;
      var data = grunt.file.read(file);
      this.data.files[file].forEach((replacement) => {
        data = data.replace(replacement.from, grunt.template.process(replacement.to));
      });
      grunt.file.write(file, data);
    });
  });
  
  // concat
  grunt.registerMultiTask("concat", function () {
    const options = this.options();
    this.files.forEach((file) => {
      var result = "";
      file.src.forEach((filename) => {
        if (filename === options.main) return;
        result += grunt.file.read(filename); + options.separator
      });
      result += grunt.file.read(options.main);
      
      if (options.start) {
        result = options.start + result;
      }
      if (options.end) {
        result += options.end;
      }
      
      grunt.file.write(file.dest, result);
    });
  });
  
  // copy
  grunt.registerMultiTask("copy", function () {
    this.files.forEach((file) => {
      grunt.file.write(file.dest, grunt.file.read(file.src));
    });
  });
  
  // banner
  grunt.registerMultiTask("banner", function () {
    const options = this.options();
    this.files.forEach((file) => {
      file.src.forEach((src) => {
        const ext = /\.?([^.]+)$/.exec(src)[1];
        var banner;
        if (options.banner[ext]) {
          banner = options.banner[ext];
        } else {
          banner = options.banner.normal;
        }
        grunt.file.write(src, banner + grunt.file.read(src));
      });
    });
  });
  
  grunt.registerTask("build", ["copy", "concat:build", "htmlmin", "cssmin", "uglify", "replace", "banner"]);
  grunt.registerTask("debug", ["copy", "concat:debug", "replace"]);
};
