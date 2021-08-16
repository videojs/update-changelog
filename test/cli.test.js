const {version} = require('../package.json');
const {cli, printHelp} = require('../src/cli.js');
const test = require('ava');

const getConsoleEmulator = (lines) => (...args) => {
  if (!args.length) {
    lines.push('');
  } else {
    lines.push.apply(lines, args);
  }
};

const helpLines = [];

printHelp({log: getConsoleEmulator(helpLines)});

test.beforeEach((t) => {
  t.context.logs = [];
  t.context.errors = [];

  t.context.console = {
    log: getConsoleEmulator(t.context.logs),
    error: getConsoleEmulator(t.context.errors)
  };

  t.context.exitCode = null;
  t.context.exit = (exitCode = 0) => {
    t.context.exitCode = exitCode;
  };

  t.context.reset = () => {
    t.context.exitCode = null;
    t.context.logs.length = 0;
    t.context.errors.length = 0;
  };
});

['-h', '--help'].forEach(function(arg) {
  test(`${arg} logs help and exits`, function(t) {
    cli([arg], t.context.console, t.context.exit);

    t.deepEqual(t.context.logs, helpLines, 'logged help lines');
    t.is(t.context.errors.length, 0, 'no errors');
    t.is(t.context.exitCode, 0, 'exited with success');
  });
});

['-v', '--version'].forEach(function(arg) {
  test(`${arg} logs version and exits`, function(t) {
    cli([arg], t.context.console, t.context.exit);

    t.deepEqual(t.context.logs, [version], 'logged version lines');
    t.is(t.context.errors.length, 0, 'no errors');
    t.is(t.context.exitCode, 0, 'exited with success');
  });
});

['-d', '--dir'].forEach(function(arg) {
  test(`${arg} changes dir, no exit or logs`, function(t) {
    const options = cli([arg, 'foobar'], t.context.console, t.context.exit);

    t.is(t.context.logs.length, 0, 'no logs');
    t.is(t.context.errors.length, 0, 'no errors');
    t.is(t.context.exitCode, null, 'no exit');
    t.deepEqual(options, {
      dir: 'foobar',
      gitAdd: false,
      runOnPrerelease: false
    }, 'options as expected');
  });
});

['-a', '--add'].forEach(function(arg) {
  test(`${arg} changes gitAdd option, no exit or logs`, function(t) {
    const options = cli([arg], t.context.console, t.context.exit);

    t.is(t.context.logs.length, 0, 'no logs');
    t.is(t.context.errors.length, 0, 'no errors');
    t.is(t.context.exitCode, null, 'no exit');
    t.deepEqual(options, {
      dir: process.cwd(),
      gitAdd: true,
      runOnPrerelease: false
    }, 'options as expected');
  });
});

['-p', '--run-on-prerelease'].forEach(function(arg) {
  test(`${arg} changes runOnPrerelease option, no exit or logs`, function(t) {
    const options = cli([arg], t.context.console, t.context.exit);

    t.is(t.context.logs.length, 0, 'no logs');
    t.is(t.context.errors.length, 0, 'no errors');
    t.is(t.context.exitCode, null, 'no exit');
    t.deepEqual(options, {
      dir: process.cwd(),
      gitAdd: false,
      runOnPrerelease: true
    }, 'options as expected');
  });
});
