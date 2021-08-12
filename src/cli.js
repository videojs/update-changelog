#!/usr/bin/env node
const pkg = require('../package.json');
const updateChangelog = require('./update-changelog.js');

const printHelp = function(console) {
  console.log();
  console.log('  Usage: vjs-update-changelog');
  console.log();
  console.log(`  ${pkg.description}`);
  console.log();
  console.log('  -v, --version            Print the version of vjs-update-changelog.');
  console.log('  -na, --no-add            Do not git add CHANGELOG.md after updating.');
  console.log('  -p, --prerelease         Allow changelog updates on prerelease.');
  console.log('  -r, --releases [number]  Add the previous y releases into the CHANGELOG. Defaults to 1.');
  console.log('  -d, --dir [string]       Run update-changelog in a specific directory. Defaults to cwd.');
  console.log('  -s, --stdout             print result to stdout.');
  console.log();
};

const cli = function(args, console, exit) {
  const options = {
    gitAdd: true,
    runOnPrerelease: false,
    releaseCount: null,
    dir: process.cwd(),
    stdout: false
  };

  // only takes one argument
  for (let i = 0; i < args.length; i++) {
    if ((/^-h|--help$/).test(args[i])) {
      printHelp(console);
      return exit();
    } else if ((/^-v|--version$/).test(args[i])) {
      console.log(pkg.version);
      return exit();
    } else if ((/^-na|--no-add$/).test(args[i])) {
      options.gitAdd = false;
    } else if ((/^-s|--stdout$/).test(args[i])) {
      options.stdout = true;
    } else if ((/^-p|--prerelease$/).test(args[i])) {
      options.runOnPrerelease = true;
    } else if ((/^-r|--releases/).test(args[i])) {
      i++;
      options.releaseCount = parseInt(args[i], 10);
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

  updateChangelog(options);

  process.exit(0);
}
