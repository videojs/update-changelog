#!/usr/bin/env node
/* eslint-disable no-console */
const pkg = require('../package.json');
const updateChangelog = require('./update-changelog.js');
const getDefaults = require('./get-defaults.js');

const printHelp = function(console) {
  console.log();
  console.log('  Usage: vjs-update-changelog');
  console.log();
  console.log(`  ${pkg.description}`);
  console.log();
  console.log('  -v, --version            Print the version of vjs-update-changelog.');
  console.log('  -a, --add                Add CHANGELOG.md to commit after updating.');
  console.log('  -p, --run-on-prerelease  Allow changelog updates on prerelease.');
  console.log('  -d, --dir [string]       Run update-changelog in a specific directory. Defaults to cwd.');
  console.log();
};

const cli = function(args, console, exit) {
  const options = getDefaults();

  // only takes one argument
  for (let i = 0; i < args.length; i++) {
    if ((/^-h|--help$/).test(args[i])) {
      printHelp(console);
      return exit();
    } else if ((/^-v|--version$/).test(args[i])) {
      console.log(pkg.version);
      return exit();
    } else if ((/^-a|--add$/).test(args[i])) {
      options.gitAdd = true;
    } else if ((/^-p|--run-on-prerelease$/).test(args[i])) {
      options.runOnPrerelease = true;
    } else if ((/^-d|--dir$/).test(args[i])) {
      i++;
      options.dir = args[i];
    }
  }

  return options;
};

module.exports = {cli, printHelp};

// The code below will only run when working as an executable
// that way we can test the cli using require in unit tests.
if (require.main === module) {
  const options = cli(process.argv.slice(2), console, process.exit);
  const result = updateChangelog(options);

  if (result.message) {
    console.error(result.message);
  }

  process.exit(result.exitCode);
}
