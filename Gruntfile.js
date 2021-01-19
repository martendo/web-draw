"use strict";

const HTMLMinifier = require("html-minifier");
const CleanCSS = require("clean-css");
const UglifyJS = require("uglify-es");

module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON("package.json"),
    
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
        minifyCSS: {
          level: 2
        },
        minifyJS: true
      },
      build: {
        files: {
          "public/index.html": "src/index.html",
          "public/404.html": "src/404.html"
        }
      }
    },
    
    uglify: {
      build: {
        files: {
          "public/script.js": "src/script.js"
        }
      }
    },
    
    cssmin: {
      build: {
        options: {
          level: 2
        },
        files: {
          "public/style.css": "src/style.css"
        }
      }
    },
    
    replace: {
      build: {
        src: ["public/index.html"],
        overwrite: true,
        replacements: [{
          from: "{{ DATE }}",
          to: "<%= grunt.template.today(\"mmm d, 'yy\") %>"
        }, {
          from: "{{ VERSION }}",
          to: "v<%= pkg.version %>"
        }]
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
  
  grunt.loadNpmTasks('grunt-text-replace');
  grunt.registerTask("build", ["htmlmin", "cssmin", "uglify", "replace"]);
};
