// Licensed under the Apache License, Version 2.0 (the "License"); you may not
// use this file except in compliance with the License. You may obtain a copy of
// the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations under
// the License.


// This is the main application configuration file.  It is a Grunt
// configuration file, which you can learn more about here:
// https://github.com/cowboy/grunt/blob/master/docs/configuring.md

/*jslint node: true */
"use strict";

module.exports = function (grunt) {
  var helper = require('./tasks/helper.js'),
      initHelper = helper.init(grunt),
      _ = grunt.util._,
      fs = require('fs');

  var couch_config = function () {
    var default_couch_config = {
      fauxton: {
        db: helper.couch + 'fauxton',
        app: './couchapp.js',
        options: {
          okay_if_missing: true
        }
      }
    };

    var settings_couch_config = initHelper.readSettingsFile().couch_config;
    return settings_couch_config || default_couch_config;
  }();

  var cleanableAddons =  function () {
    var theListToClean = [];
    initHelper.processAddons(function (addon) {
      // Only clean addons that are included from a local dir
      if (addon.path) {
        theListToClean.push("app/addons/" + addon.name);
      }
    });

    return theListToClean;
  }();

  var cleanable = function () {
    // Whitelist files and directories to be cleaned
    // You'll always want to clean these two directories
    // Now find the external addons you have and add them for cleaning up
    return _.union(["dist/", "app/load_addons.js"], cleanableAddons);
  }();

  var assets = function () {
    // Base assets
    var theAssets = {
      less:{
        paths: ["assets/less"],
        files: {
          "dist/debug/css/fauxton.css": "assets/less/fauxton.less"
        }
      },
      fonts: ["assets/fonts/*.eot", "assets/fonts/*.svg", "assets/fonts/*.ttf", "assets/fonts/*.woff"],
      img: ["assets/img/**"],
      // used in concat:index_css to keep file ordering intact
      // fauxton.css should load first
      css: ["assets/css/*.css", "dist/debug/css/fauxton.css"]
    };
    initHelper.processAddons(function (addon) {
      // Less files from addons
      var root = addon.path || "app/addons/" + addon.name;
      var lessPath = root + "/assets/less";
      if (fs.existsSync(lessPath)) {
        // .less files exist for this addon
        theAssets.less.paths.push(lessPath);
        theAssets.less.files["dist/debug/css/" + addon.name + ".css"] =
          lessPath + "/" + addon.name + ".less";
        theAssets.css.push("dist/debug/css/" + addon.name + ".css");
      }
      // Images
      root = addon.path || "app/addons/" + addon.name;
      var imgPath = root + "/assets/img";
      if (fs.existsSync(imgPath)) {
        theAssets.img.push(imgPath + "/**");
      }
      var fontsPath = root + "/assets/fonts";
      if (fs.existsSync(fontsPath)) {
        theAssets.fonts.push(fontsPath + "/**");
      }
    });
    return theAssets;
  }();

  var templateSettings = function () {
    var defaultSettings = {
      "development": {
        "src": "assets/index.underscore",
        "dest": "dist/debug/index.html",
        "variables": {
          "requirejs": "/assets/js/libs/require.js",
          "css": "./css/index.css",
          "base": null
        }
      },
      "release": {
        "src": "assets/index.underscore",
        "dest": "dist/debug/index.html",
        "variables": {
          "requirejs": "./js/{REQUIREJS_FILE}",
          "css": "./css/{CSS_FILE}",
          "base": null
        }
      }
    };

    var settings = initHelper.readSettingsFile();

    var i18n = JSON.stringify(initHelper.readI18nFile(), null, ' ');

    Object.keys(settings.template).forEach(function (key) {
      settings.template[key].variables.generationDate = new Date().toISOString();
      settings.template[key].app.i18n = i18n;
    });

    return settings.template || defaultSettings;
  }();

  var couchserver_config  = function () {
    // add a "couchserver" key to settings.json with JSON that matches the
    // keys and values below (plus your customizations) to have Fauxton work
    // against a remote CouchDB-compatible server.
    var defaults = {
      dist: './dist/debug/',
      port: helper.devServerPort,
      proxy: {
        target: helper.couch
      }
    };

    return initHelper.readSettingsFile().couchserver || defaults;
  }();

  var config = {

    // The clean task ensures all files are removed from the dist/ directory so
    // that no files linger from previous builds.
    clean: {
      release:  cleanable,
      watch: cleanableAddons
    },

    less: {
      compile: {
        options: {
          paths: assets.less.paths
        },
        files: assets.less.files
      }
    },

    jshint: {
      all: ['app/**/*.js', 'Gruntfile.js', "!app/**/assets/js/*.js", "!app/**/dependencies/*", "!app/**/*.jsx"],
      options: {
        jshintrc: '.jshintrc'
      }
    },

    // The jst task compiles all application templates into JavaScript
    // functions with the underscore.js template function from 1.2.4.  You can
    // change the namespace and the template options, by reading this:
    // https://github.com/gruntjs/grunt-contrib/blob/master/docs/jst.md
    //
    // The concat task depends on this file to exist, so if you decide to
    // remove this, ensure concat is updated accordingly.
    jst: {
      compile: {
        options: {
          processContent: function (src) {
            return src.replace(/<!--[\s\S]*?-->/gm, '');
          }
        },
        files: {
          "dist/debug/templates.js": [
            "app/templates/**/*.html",
            "app/addons/**/templates/**/*.html"
          ]
        }
      }
    },

    template: templateSettings,

    // The concatenate task is used here to merge the almond require/define
    // shim and the templates into the application code.  It's named
    // dist/debug/require.js, because we want to only load one script file in
    // index.html.
    concat: {
      requirejs: {
        src: [ "assets/js/libs/require.js", "dist/debug/templates.js", "dist/debug/require.js"],
        dest: "dist/debug/js/require.js"
      },

      index_css: {
        src: assets.css,
        dest: 'dist/debug/css/index.css'
      },

      test_config_js: {
        src: ["dist/debug/templates.js", "test/test.config.js"],
        dest: 'test/test.config.js'
      }
    },

    cssmin: {
      compress: {
        files: {
          "dist/release/css/index.css": [
            'dist/debug/css/index.css',
            'assets/css/*.css',
            "app/addons/**/assets/css/*.css"
          ]
        },
        options: {
          report: 'min'
        }
      }
    },

    uglify: {
      release: {
        files: {
          "dist/release/js/require.js": [
            "dist/debug/js/require.js"
          ]
        }
      }
    },

    // Runs a proxy server for easier development, no need to keep deploying to couchdb
    couchserver: couchserver_config,

    watch: {
      js: {
        files: initHelper.watchFiles(['.js'], ["./app/**/*.js", '!./app/load_addons.js', "./assets/**/*.js", "./test/**/*.js"]),
        tasks: []
      },
      jsx: {
        files: initHelper.watchFiles(['.jsx'], ["./app/**/*.jsx", '!./app/load_addons.jsx', "./assets/**/*.jsx", "./test/**/*.jsx"]),
        tasks: []
      },
      style: {
        files: initHelper.watchFiles(['.less', '.css'], ["./app/**/*.css", "./app/**/*.less", "./assets/**/*.css", "./assets/**/*.less"]),
        tasks: ['clean:watch', 'dependencies', 'less', 'concat:index_css']
      },
      html: {
        // the index.html is added in as a dummy file incase there is no
        // html dependancies this will break. So we need one include pattern
        files: initHelper.watchFiles(['.html'], ['./index.html']),
        tasks: ['clean:watch', 'dependencies']
      },
      options: {
        nospawn: true,
        debounceDelay: 500
      }
    },

    requirejs: {
      compile: {
        options: {
          baseUrl: 'app',
          // Include the main configuration file.
          mainConfigFile: "app/config.js",

          // Output file.
          out: "dist/debug/require.js",

          // Root application module.
          name: "config",

          // Do not wrap everything in an IIFE.
          wrap: false,
          optimize: "none",
          findNestedDependencies: true
        }
      }
    },

    // Copy build artifacts and library code into the distribution
    // see - http://gruntjs.com/configuring-tasks#building-the-files-object-dynamically
    copy: {
      couchdb: {
        files: [
          // this gets built in the template task
          {src: "dist/release/index.html", dest: "../../share/www/index.html"},
          {src: ["**"], dest: "../../share/www/js/", cwd:'dist/release/js/',  expand: true},
          {src: ["**"], dest: "../../share/www/img/", cwd:'dist/release/img/', expand: true},
          {src: ["**"], dest: "../../share/www/fonts/", cwd:'dist/release/fonts/', expand: true},
          {src: ["**"], dest: "../../share/www/css/", cwd:"dist/release/css/", expand: true}
        ]
      },
      couchdebug: {
        files: [
          // this gets built in the template task
          {src: "dist/debug/index.html", dest: "../../share/www/index.html"},
          {src: ["**"], dest: "../../share/www/js/", cwd:"dist/debug/js/",  expand: true},
          {src: ["**"], dest: "../../share/www/img/", cwd:"dist/debug/img/", expand: true},
          {src: ["**"], dest: "../../share/www/fonts/", cwd:"dist/debug/fonts/", expand: true},
          {src: ["**"], dest: "../../share/www/css/", cwd:"dist/debug/css/", expand: true}
        ]
      },
      ace: {
        files: [
          {src: "assets/js/libs/ace/worker-json.js", dest: "dist/release/js/ace/worker-json.js"},
          {src: "assets/js/libs/ace/mode-json.js", dest: "dist/release/js/ace/mode-json.js"},
          {src: "assets/js/libs/ace/theme-idle_fingers.js", dest: "dist/release/js/ace/theme-idle_fingers.js"},
          {src: "assets/js/libs/ace/theme-dawn.js", dest: "dist/release/js/ace/theme-dawn.js"},
          {src: "assets/js/libs/ace/mode-javascript.js", dest: "dist/release/js/ace/mode-javascript.js"},
          {src: "assets/js/libs/ace/worker-javascript.js", dest: "dist/release/js/ace/worker-javascript.js"},
        ]
      },

      addonDependencies: {
        files: initHelper.getAddonDependencies()
      },

      dist:{
        files:[
          {src: 'dist/debug/index.html', dest: 'dist/release/index.html'},
          {src: assets.img, dest: 'dist/release/img/', flatten: true, expand: true},
          {src: assets.fonts, dest: 'dist/release/fonts/', flatten: true, expand: true},
          {src: './favicon.ico', dest: "dist/release/favicon.ico"}
        ]
      },
      debug:{
        files:[
          {src: assets.fonts, dest: "dist/debug/fonts/", flatten: true, expand: true},
          {src: assets.img, dest: "dist/debug/img/", flatten: true, expand: true},
          {src: './favicon.ico', dest: "dist/debug/favicon.ico"}
        ]
      },

      // populated dynamically by watch tasks
      changedFiles: {
        files: []
      }
    },

    get_deps: {
      "default": {
        src: "settings.json"
      }
    },

    gen_load_addons: {
      "default": {
        src: "settings.json"
      }
    },
    gen_initialize: templateSettings,

    mkcouchdb: couch_config,
    rmcouchdb: couch_config,
    couchapp: couch_config,

    mochaSetup: {
      default: {
        files: {
          src: initHelper.watchFiles(['[Ss]pec.js'], ['./app/addons/**/*[Ss]pec.js', './app/addons/**/*[Ss]pec.react.js', './app/core/**/*[Ss]pec.js'])
        },
        template: 'test/test.config.underscore',
        config: './app/config.js'
      }
    },

    shell: {
      'build-jsx': {
        command: 'node ./node_modules/react-tools/bin/jsx -x jsx app/addons/ app/addons/ --no-cache-dir',
        stdout: true,
        failOnError: true
      },

      'build-single-jsx': {
        command: '', // populated dynamically
        stdout: true,
        failOnError: true
      },

      stylecheck: {
        command: 'npm run stylecheck'
      },

      stylecheckSingleFile: {
        command: '' // populated dynamically
      },

      phantomjs: {
        command: './node_modules/phantomjs/bin/phantomjs --debug=false ' +
          '--ssl-protocol=sslv2 --web-security=false --ignore-ssl-errors=true ' +
          './node_modules/mocha-phantomjs/lib/mocha-phantomjs.coffee test/runner.html'
      }
    },

    exec: {
      check_selenium: initHelper.check_selenium,
      start_nightWatch: {
        command: __dirname + '/node_modules/nightwatch/bin/nightwatch' +
        ' -c ' + __dirname + '/test/nightwatch_tests/nightwatch.json'
      }
    },

    // generates the nightwatch.json file with appropriate content for this env
    initNightwatch: {
      default: {
        settings: initHelper.readSettingsFile(),
        template: 'test/nightwatch_tests/nightwatch.json.underscore',
        dest: 'test/nightwatch_tests/nightwatch.json'
      }
    },

    // these rename the already-bundled, minified requireJS and CSS files to include their hash
    md5: {
      requireJS: {
        files: { "dist/release/js/" : "dist/release/js/require.js" },
        options: {
          afterEach: function (fileChanges) {
            // replace the REQUIREJS_FILE placeholder with the actual filename
            var newFilename = fileChanges.newPath.match(/[^\/]+$/)[0];
            config.template.release.variables.requirejs = config.template.release.variables.requirejs.replace(/REQUIREJS_FILE/, newFilename);

            // remove the original requireJS file, we don't need it anymore
            fs.unlinkSync(fileChanges.oldPath);
          }
        }
      },

      css: {
        files: { "dist/release/css/": 'dist/release/css/index.css' },
        options: {
          afterEach: function (fileChanges) {
            // replace the CSS_FILE placeholder with the actual filename
            var newFilename = fileChanges.newPath.match(/[^\/]+$/)[0];
            config.template.release.variables.css = config.template.release.variables.css.replace(/CSS_FILE/, newFilename);

            // remove the original CSS file
            fs.unlinkSync(fileChanges.oldPath);
          }
        }
      }
    }
  };

  grunt.initConfig(config);


  // This makes the watch tasks FAR more performant by only doing JSX compiling, jshinting, copying, etc. on the changed
  // files instead of everything every time. Oddly, grunt-contrib-watch doesn't pass the changed filenames to the task:
  // https://github.com/gruntjs/grunt-contrib-watch/issues/149 - hence running it here
  grunt.event.on('watch', function (action, filepath) {
    var isJS  = /\.js$/.test(filepath);
    var isJSX = /\.jsx$/.test(filepath);

    if (!isJS && !isJSX) {
      return;
    }

    // compile the single JSX file into the appropriate Fauxton folder
    var targetFilepath = filepath;
    if (isJSX) {
      var folder = filepath.replace(/\/[^\/]*$/, '');
      var targetFolder = folder;

      // if the JSX file ISN'T in Fauxton, generate the .js file there
      if (!(/^app\/addons/.test(folder))) {
        targetFolder = folder.replace(/.*\/addons/, 'app/addons');
      }
      targetFilepath = filepath.replace(/.*\/addons/, 'app/addons');
      targetFilepath = targetFilepath.replace(/\.jsx$/, '.js');

      config.shell['build-single-jsx'].command = 'node ./node_modules/react-tools/bin/jsx -x jsx ' + folder + ' ' + targetFolder + ' --no-cache-dir';
      grunt.task.run(['shell:build-single-jsx']);
    }

    // if the JS file that just changed was outside of Fauxton, copy it over
    if (isJS && !(/^app\/addons/.test(filepath))) {
      config.copy.changedFiles.files = [{
        src: filepath,
        dest: filepath.replace(/.*\/addons/, 'app/addons')
      }];
      grunt.task.run(['copy:changedFiles']);
    }

    // lastly, run jshint + stylecheck the file. Note: this run multiple times when you save a single file because the
    // jsx command above doesn't allow targeting a specific file, just a folder. So any JSX file in the changed file
    // folder or subfolder are copied over, causing every one of the files to be jshinted. Still far faster than before
    if (targetFilepath.indexOf('test.config.js') === -1) {
      grunt.config(['jshint', 'all'], targetFilepath);
      grunt.task.run(['jshint']);
      config.shell.stylecheckSingleFile.command = 'node ./node_modules/jsxcs/bin/jsxcs ' + targetFilepath;
      grunt.task.run(['shell:stylecheckSingleFile']);
    }
  });


  /*
   * Load Grunt plugins
   */
  // Load fauxton specific tasks
  grunt.loadTasks('tasks');

  grunt.loadNpmTasks('grunt-couchapp');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-exec');
  grunt.loadNpmTasks('grunt-contrib-requirejs');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-jst');
  grunt.loadNpmTasks('grunt-contrib-less');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-cssmin');
  grunt.loadNpmTasks('grunt-shell');
  grunt.loadNpmTasks('grunt-md5');

  /*
   * Default task
   */
  // defult task - install minified app to local CouchDB
  grunt.registerTask('default', 'couchdb');

  /*
   * Transformation tasks
   */
  // clean out previous build artifacts and lint
  grunt.registerTask('lint', ['clean', 'jshint']);
  grunt.registerTask('test', ['clean:release', 'dependencies', 'jsx', 'jshint', 'shell:stylecheck', 'gen_initialize:development', 'test_inline']);

  // lighter weight test task for use inside dev/watch
  grunt.registerTask('test_inline', ['mochaSetup', 'jst', 'concat:test_config_js', 'shell:phantomjs']);
  // Fetch dependencies (from git or local dir), lint them and make load_addons
  grunt.registerTask('dependencies', ['get_deps', 'gen_load_addons:default']);

  // minify code and css, ready for release.
  grunt.registerTask('minify', ['uglify', 'cssmin:compress']);
  grunt.registerTask('jsx', ['shell:build-jsx']);
  grunt.registerTask('build', ['less', 'concat:index_css', 'jst', 'requirejs', 'concat:requirejs', 'uglify',
    'cssmin:compress', 'md5:requireJS', 'md5:css', 'template:release']);

  /*
   * Build the app in either dev, debug, or release mode
   */
  // dev server
  grunt.registerTask('dev', ['debugDev', 'couchserver']);

  // build a debug release
  grunt.registerTask('debug', ['lint', 'dependencies', "gen_initialize:development", 'jsx', 'concat:requirejs', 'less',
    'concat:index_css', 'template:development', 'copy:debug']);

  grunt.registerTask('debugDev', ['clean', 'dependencies', "gen_initialize:development", 'jsx', 'jshint', 'shell:stylecheck',
    'less', 'concat:index_css', 'template:development', 'copy:debug']);

  grunt.registerTask('watchRun', ['clean:watch', 'dependencies', 'jshint', 'shell:stylecheck']);

  // build a release
  grunt.registerTask('release_commons_prefix', ['clean', 'dependencies']);
  grunt.registerTask('release_commons_suffix', ['jshint', 'shell:build-jsx', 'build', 'copy:dist', 'copy:ace', 'copy:addonDependencies']);

  grunt.registerTask('release', ['release_commons_prefix', 'gen_initialize:release', 'release_commons_suffix']);
  grunt.registerTask('couchapp_release', ['release_commons_prefix', 'gen_initialize:couchapp', 'release_commons_suffix']);

  /*
   * Install into CouchDB in either debug, release, or couchapp mode
   */
  // make a development install that is server by mochiweb under _utils
  grunt.registerTask('couchdebug', ['debug', 'copy:couchdebug']);
  // make a minimized install that is server by mochiweb under _utils
  grunt.registerTask('couchdb', ['release', 'copy:couchdb']);
  // make an install that can be deployed as a couchapp
  grunt.registerTask('couchapp_setup', ['couchapp_release']);
  // install fauxton as couchapp
  grunt.registerTask('couchapp_install', ['rmcouchdb:fauxton', 'mkcouchdb:fauxton', 'couchapp:fauxton']);
  // setup and install fauxton as couchapp
  grunt.registerTask('couchapp_deploy', ['couchapp_setup', 'couchapp_install']);

  /*
   * Nightwatch functional testing
   */
  //Start Nightwatch test from terminal, using: $ grunt nightwatch
  grunt.registerTask('nightwatch', [ 'exec:check_selenium', 'initNightwatch', 'exec:start_nightWatch']);
};
