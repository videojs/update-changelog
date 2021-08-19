const test = require('ava');
const path = require('path');
const shell = require('shelljs');
const crypto = require('crypto');
const semver = require('semver');
const exec = require('child_process').execSync;
const fs = require('fs');
const cliPath = require.resolve('../src/cli.js');
const spawnPromise = require('@brandonocasey/spawn-promise');
const rootDir = path.join(__dirname, '..');
const today = new Date();
const padStart = (val, len, padding = ' ') => (padding.repeat(len) + val.toString()).slice(-len);
const day = padStart(today.getDate(), 2, '0');
const month = padStart((today.getMonth() + 1), 2, '0');
const year = today.getFullYear();

const getVersionHeader = (version, hash) => {
  version = semver.clean(version);
  let versionLink = version;

  if (hash) {
    versionLink = `[${version}](/compare/${hash}...v${version})`;
  }

  return [
    `<a name="${version}"></a>`,
    `${versionLink} (${year}-${month}-${day})`
  ];
};

test.beforeEach((t) => {
  // 60s timeout
  t.timeout(60000);
  t.context.getChangelog = () => fs
    .readFileSync(path.join(t.context.dir, 'CHANGELOG.md'), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((v) => v.trim().replace(/^#+/, '').trim())
    .filter((v) => !!v);

  t.context.run = function(args = []) {
    return spawnPromise(cliPath, args, {encoding: 'utf8', cwd: t.context.dir});
  };

  t.context.commits = [];

  t.context.commit = (msg) => {
    exec('git add --all', {cwd: t.context.dir});
    exec(`git commit --allow-empty -m "${msg}"`, {cwd: t.context.dir});

    const hash = exec('git log -n1 --format=format:"%h"', {cwd: t.context.dir}).toString();

    t.context.commits.push(hash);
  };

  t.context.writePkg = (pkg) => {
    fs.writeFileSync(path.join(t.context.dir, 'package.json'), JSON.stringify(pkg, null, 2));
  };

  t.context.readPkg = () => {
    return JSON.parse(fs.readFileSync(path.join(t.context.dir, 'package.json')));
  };

  t.context.dir = path.join(shell.tempdir(), crypto.randomBytes(20).toString('hex'));
  shell.cp('-R', path.join(rootDir, 'test', 'fixture'), t.context.dir);

  shell.ln('-sf', path.join(rootDir, 'node_modules'), path.join(t.context.dir, 'node_modules'));
  shell.touch(path.join(t.context.dir, 'CHANGELOG.md'));
  exec('git init', {cwd: t.context.dir});
  exec('git config user.email "foobar@test.com"', {cwd: t.context.dir});
  exec('git config user.name "Foo Bar"', {cwd: t.context.dir});
});

test.afterEach.always((t) => {
  shell.rm('-rf', t.context.dir);
});

test('works for regular changelog update', (t) => {
  return Promise.resolve().then(function() {
    t.context.commit('feat: initial');

    return t.context.run();
  }).then(function(result) {
    const changelog = []
      .concat(getVersionHeader(t.context.readPkg().version))
      .concat([
        'Features',
        `* initial ${t.context.commits[0]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
  });
});

test('git add works', (t) => {
  return Promise.resolve().then(function() {
    t.context.commit('feat: initial');

    return t.context.run(['--add']);
  }).then(function(result) {
    const changelog = []
      .concat(getVersionHeader(t.context.readPkg().version))
      .concat([
        'Features',
        `* initial ${t.context.commits[0]}`
      ]);
    const stagedFiles = exec('git diff --staged --name-only', {cwd: t.context.dir}).toString().trim();

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated and added to commit!', 'expected stdout');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
    t.is(stagedFiles, 'CHANGELOG.md', 'only changelog in staged');
  });
});

test('adds commits', (t) => {
  return Promise.resolve().then(function() {
    t.context.commit('feat: initial');
    t.context.commit('feat: foobar');

    return t.context.run();
  }).then(function(result) {
    const changelog = []
      .concat(getVersionHeader(t.context.readPkg().version))
      .concat([
        'Features',
        `* foobar ${t.context.commits[1]}`,
        `* initial ${t.context.commits[0]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
  });
});

test('works for release', (t) => {
  return Promise.resolve().then(function() {
    t.context.commit('feat: initial');

    const pkg = t.context.readPkg();

    pkg.version = '0.0.1';
    t.context.writePkg(pkg);

    return t.context.run();
  }).then(function(result) {
    const changelog = []
      .concat(getVersionHeader(t.context.readPkg().version))
      .concat([
        'Features',
        `* initial ${t.context.commits[0]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
  });
});

test('works for prerelease with preid and runOnPrerelease', (t) => {
  return Promise.resolve().then(function() {

    t.context.commit('feat: initial');

    const pkg = t.context.readPkg();

    pkg.version = '0.0.1-beta.0';
    t.context.writePkg(pkg);

    return t.context.run(['--run-on-prerelease']);
  }).then(function(result) {
    const changelog = []
      .concat(getVersionHeader(t.context.readPkg().version))
      .concat([
        'Features',
        `* initial ${t.context.commits[0]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
  });
});

test('works for prerelease without preid and runOnPrerelease', (t) => {
  return Promise.resolve().then(function() {
    t.context.commit('feat: initial');

    const pkg = t.context.readPkg();

    pkg.version = '0.0.1-0';
    t.context.writePkg(pkg);
    return t.context.run(['--run-on-prerelease']);
  }).then(function(result) {
    const changelog = []
      .concat(getVersionHeader(t.context.readPkg().version))
      .concat([
        'Features',
        `* initial ${t.context.commits[0]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
  });
});

test('does nothing on prerelease without runOnPrerelease', (t) => {
  return Promise.resolve().then(function() {

    t.context.commit('feat: initial');
    const pkg = t.context.readPkg();

    pkg.version = '0.0.1-0';
    t.context.writePkg(pkg);

    return t.context.run();
  }).then(function(result) {
    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'Not updating changelog. This is a prerelease and --run-on-prerelease not set.', 'expected stdout');

    t.deepEqual(t.context.getChangelog(), [], 'empty changelog');
  });
});

test('add a new release', (t) => {
  let changelog;

  return Promise.resolve().then(function() {
    t.context.commit('feat: initial');

    exec('npm version patch', {cwd: t.context.dir});

    return t.context.run();
  }).then(function(result) {
    changelog = []
      .concat(getVersionHeader(t.context.readPkg().version, t.context.commits[0]))
      .concat([
        'Features',
        `* initial ${t.context.commits[0]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 1');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 1');

    return Promise.resolve();
  }).then(function() {
    t.context.commit('feat: second');

    exec('npm version patch', {cwd: t.context.dir});

    return t.context.run();
  }).then(function(result) {
    changelog = []
      .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
      .concat([
        'Features',
        `* second ${t.context.commits[1]}`
      ])
      .concat(changelog);

    t.is(result.status, 0, 'status 2');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 2');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 2');

    return Promise.resolve();
  }).then(function() {
    // truncate CHANGELOG  to verify that it will still work.
    fs.writeFileSync(path.join(t.context.dir, 'CHANGELOG.md'), '');

    return t.context.run();
  }).then(function(result) {
    changelog = []
      .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
      .concat([
        'Features',
        `* second ${t.context.commits[1]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 3');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 3 ');
  });
});

test('release after a prerelease includes prerelease changes', (t) => {
  let changelog;

  return Promise.resolve().then(function() {
    t.context.commit('feat: initial');
    exec('npm version patch', {cwd: t.context.dir});

    return t.context.run();
  }).then(function(result) {
    changelog = []
      .concat(getVersionHeader(t.context.readPkg().version, t.context.commits[0]))
      .concat([
        'Features',
        `* initial ${t.context.commits[0]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 1');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 1');

    return Promise.resolve();
  }).then(function() {
    t.context.commit('feat: second');
    exec('npm version prerelease', {cwd: t.context.dir});

    return t.context.run();
  }).then(function(result) {
    t.is(result.status, 0, 'status 2');
    t.is(
      result.stdout.trim(),
      'Not updating changelog. This is a prerelease and --run-on-prerelease not set.',
      'expected stdout 2'
    );
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 2');

    return Promise.resolve();
  }).then(function() {
    t.context.commit('fix: third');

    exec('npm version prerelease', {cwd: t.context.dir});

    return t.context.run();
  }).then(function(result) {
    t.is(result.status, 0, 'status 3');
    t.is(
      result.stdout.trim(),
      'Not updating changelog. This is a prerelease and --run-on-prerelease not set.',
      'expected stdout 3'
    );
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 3');

    return Promise.resolve();
  }).then(function() {
    exec('npm version patch', {cwd: t.context.dir});
    return t.context.run();
  }).then(function(result) {
    changelog = []
      .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
      .concat([
        'Features',
        `* second ${t.context.commits[1]}`,
        'Bug Fixes',
        `* third ${t.context.commits[2]}`
      ])
      .concat(changelog);

    t.is(result.status, 0, 'status 4');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 4');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 4');
  });
});

['patch', 'minor', 'major'].forEach(function(versionType) {
  test(`${versionType} release after a prerelease includes prelease changes and release changes`, (t) => {
    let changelog;

    return Promise.resolve().then(function() {
      t.context.commit('feat: initial');

      exec('npm version patch', {cwd: t.context.dir});

      return t.context.run();
    }).then(function(result) {
      changelog = []
        .concat(getVersionHeader(t.context.readPkg().version, t.context.commits[0]))
        .concat([
          'Features',
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 1');
      t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 1');
      return Promise.resolve();
    }).then(function() {
      t.context.commit('feat: second');

      exec('npm version prerelease', {cwd: t.context.dir});

      return t.context.run();
    }).then(function(result) {
      t.is(result.status, 0, 'status 2');
      t.is(
        result.stdout.trim(),
        'Not updating changelog. This is a prerelease and --run-on-prerelease not set.',
        'expected stdout 2'
      );
      t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 2');
      return Promise.resolve();
    }).then(function() {
      t.context.commit('feat: third');

      exec(`npm version ${versionType}`, {cwd: t.context.dir});

      return t.context.run();
    }).then(function(result) {
      changelog = []
        .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
        .concat([
          'Features',
          `* second ${t.context.commits[1]}`,
          `* third ${t.context.commits[2]}`
        ])
        .concat(changelog);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 3');
      t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 3');
    });
  });
});

test('can include prerelease and release in CHANGELOG.md', (t) => {
  let changelog;

  return Promise.resolve().then(function() {
    t.context.commit('feat: initial');
    exec('npm version patch', {cwd: t.context.dir});
    return t.context.run();

  }).then(function(result) {
    changelog = []
      .concat(getVersionHeader(t.context.readPkg().version, t.context.commits[0]))
      .concat([
        'Features',
        `* initial ${t.context.commits[0]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 1');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 1');

    return Promise.resolve();
  }).then(function() {

    t.context.commit('feat: second');

    exec('npm version prerelease', {cwd: t.context.dir});

    return t.context.run(['--run-on-prerelease']);
  }).then(function(result) {
    t.is(result.status, 0, 'status 2');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 2');

    changelog = []
      .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
      .concat([
        'Features',
        `* second ${t.context.commits[1]}`
      ])
      .concat(changelog);
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 2');
    return Promise.resolve();
  }).then(function() {
    t.context.commit('fix: third');
    exec('npm version prerelease', {cwd: t.context.dir});

    return t.context.run(['--run-on-prerelease']);
  }).then(function(result) {
    changelog = []
      .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.2-0'))
      .concat([
        'Bug Fixes',
        `* third ${t.context.commits[2]}`
      ])
      .concat(changelog);

    t.is(result.status, 0, 'status 3');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 3');

    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 3');
    return Promise.resolve();
  }).then(function() {
    t.context.commit('feat: forth');
    exec('npm version patch', {cwd: t.context.dir});

    return t.context.run();
  }).then(function(result) {
    changelog = []
      .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
      .concat([
        'Features',
        `* forth ${t.context.commits[3]}`,
        `* second ${t.context.commits[1]}`,
        'Bug Fixes',
        `* third ${t.context.commits[2]}`
      ])
      .concat(changelog);

    t.is(result.status, 0, 'status 4');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 4');

    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 4');
  });
});

test('Creates a CHANGELOG.md if it does not exist', (t) => {
  return Promise.resolve().then(function() {

    t.context.commit('feat: initial');
    shell.rm(path.join(t.context.dir, 'CHANGELOG.md'));

    return t.context.run();
  }).then(function(result) {
    const changelog = []
      .concat(getVersionHeader(t.context.readPkg().version))
      .concat([
        'Features',
        `* initial ${t.context.commits[0]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
  });
});

test('status without node_modules', (t) => {
  return Promise.resolve().then(function() {
    t.context.commit('feat: initial');

    shell.rm('-rf', path.join(t.context.dir, 'node_modules'));
    return t.context.run();
  }).then(function(result) {
    const changelog = []
      .concat(getVersionHeader(t.context.readPkg().version))
      .concat([
        'Features',
        `* initial ${t.context.commits[0]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');

    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
  });
});

test('fails without commits', (t) => {
  return t.context.run().then(function(result) {
    t.is(result.status, 1, 'status');
    t.is(
      result.stdout.trim(),
      'There are no commits in the git repo.',
      'expected stdout'
    );
  });
});

test('fails without .git directory', (t) => {
  shell.rm('-rf', path.join(t.context.dir, '.git'));

  return t.context.run().then(function(result) {
    t.is(result.status, 1, 'status');
    t.is(
      result.stdout.trim(),
      'Cannot run as .git directory does not exist.',
      'expected stdout'
    );
  });
});

test('fails without package.json', (t) => {
  t.context.commit('feat: initial');

  shell.rm(path.join(t.context.dir, 'package.json'));
  return t.context.run().then(function(result) {
    t.is(result.status, 1, 'status');
    t.is(
      result.stdout.trim(),
      'Cannot run as package.json does not exist.',
      'expected stdout'
    );
  });
});

test('fails without package-lock.json', (t) => {

  return Promise.resolve().then(function() {
    t.context.commit('feat: initial');
    shell.rm(path.join(t.context.dir, 'package-lock.json'));

    return t.context.run();
  }).then(function(result) {
    const changelog = []
      .concat(getVersionHeader(t.context.readPkg().version))
      .concat([
        'Features',
        `* initial ${t.context.commits[0]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
  });
});

test('fails with invalid package.json', (t) => {
  return Promise.resolve().then(function() {
    t.context.commit('feat: initial');

    fs.writeFileSync(path.join(t.context.dir, 'package.json'), 'invalid-data');

    return t.context.run();
  }).then(function(result) {
    t.is(result.status, 1, 'status');
    t.true((/^Could not read package.json/).test(result.stdout.trim()), 'expected stdout');
  });
});

test('fails with invalid package version', (t) => {
  return Promise.resolve().then(function() {

    t.context.commit('feat: initial');
    const pkg = t.context.readPkg();

    pkg.version = 'foo';

    t.context.writePkg(pkg);

    return t.context.run();
  }).then(function(result) {

    t.is(result.status, 1, 'status');
    t.is(result.stdout.trim(), 'version in package.json foo is invalid!', 'expected stdout');
  });

});

test('does not fail with invalid version tags', (t) => {
  return Promise.resolve().then(function() {
    t.context.commit('feat: initial');

    exec('git tag foo', {cwd: t.context.dir});
    exec('git tag 3.0r1', {cwd: t.context.dir});
    exec('git tag 3b', {cwd: t.context.dir});
    exec('git tag 3.0b', {cwd: t.context.dir});

    return t.context.run();
  }).then(function(result) {
    const changelog = []
      .concat(getVersionHeader(t.context.readPkg().version))
      .concat([
        'Features',
        `* initial ${t.context.commits[0]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
  });
});

test('does not add commits twice', (t) => {
  let changelog;

  return Promise.resolve().then(function() {
    t.context.commit('feat: initial');
    t.context.commit('feat: foobar');

    return t.context.run();

  }).then(function(result) {
    changelog = []
      .concat(getVersionHeader(t.context.readPkg().version))
      .concat([
        'Features',
        `* foobar ${t.context.commits[1]}`,
        `* initial ${t.context.commits[0]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');

    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
    return Promise.resolve();
  }).then(function(result) {
    return t.context.run();
  }).then(function(result) {
    t.is(result.status, 0, 'status 2 ');
    t.is(result.stdout.trim(), 'CHANGELOG.md not updated as it already has an entry for v0.0.0.', 'expected stdout 2');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
  });
});

test('does not duplicate releases for versions before tag creation', (t) => {
  let changelog;

  return Promise.resolve().then(function() {
    t.context.commit('feat: initial');

    exec('npm version patch', {cwd: t.context.dir});

    return t.context.run();
  }).then(function(result) {
    changelog = []
      .concat(getVersionHeader(t.context.readPkg().version, t.context.commits[0]))
      .concat([
        'Features',
        `* initial ${t.context.commits[0]}`
      ]);

    t.is(result.status, 0, 'status');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');

    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
    return Promise.resolve();
  }).then(function() {
    t.context.commit('feat: second');
    const pkg = t.context.readPkg();

    pkg.version = '0.0.2';

    t.context.writePkg(pkg);

    return t.context.run();
  }).then(function(result) {
    changelog = []
      .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
      .concat([
        'Features',
        `* second ${t.context.commits[1]}`
      ])
      .concat(changelog);

    t.is(result.status, 0, 'status 2');
    t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 2');
    t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 2');
  });
});
