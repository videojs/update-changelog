const test = require('ava');
const path = require('path');
const shell = require('shelljs');
const crypto = require('crypto');
const semver = require('semver');
const exec = require('child_process').execSync;
const fs = require('fs');
const updateChangelog = require('../src/update-changelog.js');
const rootDir = path.join(__dirname, '..');
const today = new Date();
const padStart = (val, len, padding = ' ') => (padding.repeat(len) + val.toString()).slice(-len);
const day = padStart(today.getDate(), 2, '0');
const month = padStart((today.getMonth() + 1), 2, '0');
const year = today.getFullYear();

const getVersionHeader = (version, hash) => {
  version = semver.clean(version);
  let versionLink = version;
  let header = '##';

  if (version === '0.0.0') {
    header = '#';
  }

  if (hash) {
    versionLink = `[${version}](/compare/${hash}...v${version})`;
  }

  return [
    `<a name="${version}"></a>`,
    `${header} ${versionLink} (${year}-${month}-${day})`
  ];
};

test.beforeEach((t) => {
  // 60s timeout
  t.timeout(60000);
  t.context.getChangelog = () => fs
    .readFileSync(path.join(t.context.dir, 'CHANGELOG.md'), 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter((v) => !!v.trim());

  t.context.commit = (msg) => {
    exec('git add --all', {cwd: t.context.dir});
    exec(`git commit --allow-empty -m "${msg}"`, {cwd: t.context.dir});

    return exec('git log -n1 --format=format:"%h"', {cwd: t.context.dir}).toString();
  };

  t.context.updatePkg = (pkg) => {
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
  const hash = t.context.commit('feat: initial');

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message');

  const changelog = []
    .concat(getVersionHeader(t.context.readPkg().version))
    .concat([
      '### Features',
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
});

test('git add works', (t) => {
  const hash = t.context.commit('feat: initial');

  const result = updateChangelog({
    gitAdd: true,
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated and added to commit!', 'expected message');

  const changelog = []
    .concat(getVersionHeader(t.context.readPkg().version))
    .concat([
      '### Features',
      `* initial ${hash}`
    ]);

  const stagedFiles = exec('git diff --staged --name-only', {cwd: t.context.dir}).toString().trim();

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
  t.is(stagedFiles, 'CHANGELOG.md', 'only changelog in staged');
});

test('adds commits', (t) => {
  const hash = t.context.commit('feat: initial');
  const hash2 = t.context.commit('feat: foobar');

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message');

  const changelog = []
    .concat(getVersionHeader(t.context.readPkg().version))
    .concat([
      '### Features',
      `* foobar ${hash2}`,
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
});

test('works for release', (t) => {
  const hash = t.context.commit('feat: initial');

  const pkg = t.context.readPkg();

  pkg.version = '0.0.1';

  t.context.updatePkg(pkg);
  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message');

  const changelog = []
    .concat(getVersionHeader(t.context.readPkg().version))
    .concat([
      '### Features',
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
});

test('works for prerelease with preid and runOnPrerelease', (t) => {
  const hash = t.context.commit('feat: initial');
  const pkg = t.context.readPkg();

  pkg.version = '0.0.1-beta.0';
  t.context.updatePkg(pkg);
  const result = updateChangelog({
    dir: t.context.dir,
    runOnPrerelease: true
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message');

  const changelog = []
    .concat(getVersionHeader(t.context.readPkg().version))
    .concat([
      '### Features',
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
});

test('works for prerelease without preid and runOnPrerelease', (t) => {
  const hash = t.context.commit('feat: initial');
  const pkg = t.context.readPkg();

  pkg.version = '0.0.1-0';
  t.context.updatePkg(pkg);
  const result = updateChangelog({
    runOnPrerelease: true,
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message');

  const changelog = []
    .concat(getVersionHeader(t.context.readPkg().version))
    .concat([
      '### Features',
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
});

test('does nothing on prerelease without runOnPrerelease', (t) => {
  t.context.commit('feat: initial');
  const pkg = t.context.readPkg();

  pkg.version = '0.0.1-0';
  t.context.updatePkg(pkg);
  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'Not updating changelog. This is a prerelease and --run-on-prerelease not set.', 'expected message');

  t.deepEqual(t.context.getChangelog(), [], 'empty changelog');
});

test('add a new release', (t) => {
  const hash = t.context.commit('feat: initial');

  exec('npm version patch', {cwd: t.context.dir});

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message 1');

  let changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, hash))
    .concat([
      '### Features',
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 1');

  const second = t.context.commit('feat: second');

  exec('npm version patch', {cwd: t.context.dir});

  const result2 = updateChangelog({
    dir: t.context.dir
  });

  t.is(result2.exitCode, 0, 'success');
  t.is(result2.message, 'CHANGELOG.md updated!', 'expected message 2');

  changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
    .concat([
      '### Features',
      `* second ${second}`
    ])
    .concat(changelog);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 2');

  // truncate CHANGELOG  to verify that it will still work.
  fs.writeFileSync(path.join(t.context.dir, 'CHANGELOG.md'), '');
  const result3 = updateChangelog({
    dir: t.context.dir
  });

  t.is(result3.exitCode, 0, 'success');
  t.is(result3.message, 'CHANGELOG.md updated!', 'expected message 3');

  changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
    .concat([
      '### Features',
      `* second ${second}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 3 ');
});

test('truncate changelog to only get new release', (t) => {
  const hash = t.context.commit('feat: initial');

  exec('npm version patch', {cwd: t.context.dir});

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message 1');

  let changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, hash))
    .concat([
      '### Features',
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 1');

  const second = t.context.commit('feat: second');

  exec('npm version patch', {cwd: t.context.dir});

  const result2 = updateChangelog({
    dir: t.context.dir
  });

  t.is(result2.exitCode, 0, 'success');
  t.is(result2.message, 'CHANGELOG.md updated!', 'expected message 2');

  changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
    .concat([
      '### Features',
      `* second ${second}`
    ])
    .concat(changelog);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 2');

  // truncate CHANGELOG  to verify that it will still work.
  fs.writeFileSync(path.join(t.context.dir, 'CHANGELOG.md'), '');
  const result3 = updateChangelog({
    dir: t.context.dir
  });

  t.is(result3.exitCode, 0, 'success');
  t.is(result3.message, 'CHANGELOG.md updated!', 'expected message 3');

  changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
    .concat([
      '### Features',
      `* second ${second}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 3 ');
});

test('release after a prerelease includes prelease changes', (t) => {
  const hash = t.context.commit('feat: initial');

  exec('npm version patch', {cwd: t.context.dir});

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message 1');

  let changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, hash))
    .concat([
      '### Features',
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 1');

  const second = t.context.commit('feat: second');

  exec('npm version prerelease', {cwd: t.context.dir});

  const result2 = updateChangelog({
    dir: t.context.dir
  });

  t.is(result2.exitCode, 0, 'success');
  t.is(
    result2.message,
    'Not updating changelog. This is a prerelease and --run-on-prerelease not set.',
    'expected message'
  );
  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 2');

  const third = t.context.commit('fix: third');

  exec('npm version prerelease', {cwd: t.context.dir});

  const result3 = updateChangelog({
    dir: t.context.dir
  });

  t.is(result3.exitCode, 0, 'success');
  t.is(
    result3.message,
    'Not updating changelog. This is a prerelease and --run-on-prerelease not set.',
    'expected message'
  );
  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 3');

  exec('npm version patch', {cwd: t.context.dir});
  const result4 = updateChangelog({
    dir: t.context.dir
  });

  t.is(result4.exitCode, 0, 'success');
  t.is(result4.message, 'CHANGELOG.md updated!', 'expected message 4');

  changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
    .concat([
      '### Features',
      `* second ${second}`,
      '### Bug Fixes',
      `* third ${third}`
    ])
    .concat(changelog);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 3');
});

test('release after a prerelease includes prelease changes and release changes', (t) => {
  const hash = t.context.commit('feat: initial');

  exec('npm version patch', {cwd: t.context.dir});

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message 1');

  let changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, hash))
    .concat([
      '### Features',
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 1');

  const second = t.context.commit('feat: second');

  exec('npm version prerelease', {cwd: t.context.dir});

  const result2 = updateChangelog({
    dir: t.context.dir
  });

  t.is(result2.exitCode, 0, 'success');
  t.is(
    result2.message,
    'Not updating changelog. This is a prerelease and --run-on-prerelease not set.',
    'expected message'
  );
  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 2');

  const third = t.context.commit('feat: third');

  exec('npm version patch', {cwd: t.context.dir});

  const result3 = updateChangelog({
    dir: t.context.dir
  });

  t.is(result3.exitCode, 0, 'success');
  t.is(result3.message, 'CHANGELOG.md updated!', 'expected message 3');

  changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
    .concat([
      '### Features',
      `* second ${second}`,
      `* third ${third}`
    ])
    .concat(changelog);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 3');
});

test('can include prerelease and release in CHANGELOG.md', (t) => {
  const hash = t.context.commit('feat: initial');

  exec('npm version patch', {cwd: t.context.dir});

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message 1');

  let changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, hash))
    .concat([
      '### Features',
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 1');

  const second = t.context.commit('feat: second');

  exec('npm version prerelease', {cwd: t.context.dir});

  const result2 = updateChangelog({
    runOnPrerelease: true,
    dir: t.context.dir
  });

  t.is(result2.exitCode, 0, 'success');
  t.is(result2.message, 'CHANGELOG.md updated!', 'expected message');

  changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
    .concat([
      '### Features',
      `* second ${second}`
    ])
    .concat(changelog);
  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 2');

  const third = t.context.commit('fix: third');

  exec('npm version prerelease', {cwd: t.context.dir});

  const result3 = updateChangelog({
    runOnPrerelease: true,
    dir: t.context.dir
  });

  t.is(result3.exitCode, 0, 'success');
  t.is(result2.message, 'CHANGELOG.md updated!', 'expected message');

  changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.2-0'))
    .concat([
      '### Bug Fixes',
      `* third ${third}`
    ])
    .concat(changelog);
  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 3');

  const forth = t.context.commit('feat: forth');

  exec('npm version patch', {cwd: t.context.dir});

  const result4 = updateChangelog({
    dir: t.context.dir
  });

  t.is(result4.exitCode, 0, 'success');
  t.is(result4.message, 'CHANGELOG.md updated!', 'expected message 4');

  changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
    .concat([
      '### Features',
      `* forth ${forth}`,
      `* second ${second}`,
      '### Bug Fixes',
      `* third ${third}`
    ])
    .concat(changelog);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 3');
});

test('Creates a CHANGELOG.md if it does not exist', (t) => {
  const hash = t.context.commit('feat: initial');

  shell.rm(path.join(t.context.dir, 'CHANGELOG.md'));

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message');

  const changelog = []
    .concat(getVersionHeader(t.context.readPkg().version))
    .concat([
      '### Features',
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
});

test('success without node_modules', (t) => {
  const hash = t.context.commit('feat: initial');

  shell.rm('-rf', path.join(t.context.dir, 'node_modules'));

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message');

  const changelog = []
    .concat(getVersionHeader(t.context.readPkg().version))
    .concat([
      '### Features',
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
});

test('fails without commits', (t) => {
  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 1, 'failure');
  t.is(
    result.message,
    `There are no commits in the git repo for directory '${t.context.dir}'.`,
    'expected message'
  );
});

test('fails without .git directory', (t) => {
  shell.rm('-rf', path.join(t.context.dir, '.git'));

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 1, 'failure');
  t.is(
    result.message,
    `Cannot run as .git directory does not exist in directory '${t.context.dir}'.`,
    'expected message'
  );
});

test('fails without package.json', (t) => {
  t.context.commit('feat: initial');

  shell.rm(path.join(t.context.dir, 'package.json'));

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 1, 'failure');
  t.is(
    result.message,
    `Cannot run as package.json does not exist in directory '${t.context.dir}'.`,
    'expected message'
  );
});

test('fails without package-lock.json', (t) => {
  t.context.commit('feat: initial');

  shell.rm(path.join(t.context.dir, 'package-lock.json'));

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 1, 'failure');
  t.is(
    result.message,
    `Cannot run as package-lock.json does not exist in directory '${t.context.dir}'.`,
    'expected message'
  );
});

test('fails with invalid package.json', (t) => {
  t.context.commit('feat: initial');

  fs.writeFileSync(path.join(t.context.dir, 'package.json'), 'invalid-data');

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 1, 'failure');
  t.true((/^Could not read package.json in/).test(result.message), 'expected message');
});

test('fails with invalid package version', (t) => {
  t.context.commit('feat: initial');
  const pkg = t.context.readPkg();

  pkg.version = 'foo';

  t.context.updatePkg(pkg);

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 1, 'failure');
  t.is(result.message, 'version in package.json foo is invalid!', 'expected message');
});

test('does not fail with invalid version tags', (t) => {
  const hash = t.context.commit('feat: initial');

  exec('git tag foo', {cwd: t.context.dir});
  exec('git tag 3.0r1', {cwd: t.context.dir});
  exec('git tag 3b', {cwd: t.context.dir});
  exec('git tag 3.0b', {cwd: t.context.dir});

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message');

  const changelog = []
    .concat(getVersionHeader(t.context.readPkg().version))
    .concat([
      '### Features',
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
});

test('does not add commits twice', (t) => {
  const hash = t.context.commit('feat: initial');
  const hash2 = t.context.commit('feat: foobar');

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message');

  const changelog = []
    .concat(getVersionHeader(t.context.readPkg().version))
    .concat([
      '### Features',
      `* foobar ${hash2}`,
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');

  const result2 = updateChangelog({
    dir: t.context.dir
  });

  t.is(result2.exitCode, 0, 'success');
  t.is(result2.message, 'CHANGELOG.md not updated as it already has an entry for v0.0.0.', 'expected message');
  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');
});

test('does not duplicate releases for versions before tag creation', (t) => {
  const hash = t.context.commit('feat: initial');

  exec('npm version patch', {cwd: t.context.dir});

  const result = updateChangelog({
    dir: t.context.dir
  });

  t.is(result.exitCode, 0, 'success');
  t.is(result.message, 'CHANGELOG.md updated!', 'expected message');

  let changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, hash))
    .concat([
      '### Features',
      `* initial ${hash}`
    ]);

  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog');

  const hash2 = t.context.commit('feat: second');
  const pkg = t.context.readPkg();

  pkg.version = '0.0.2';

  t.context.updatePkg(pkg);

  const result2 = updateChangelog({
    dir: t.context.dir
  });

  changelog = []
    .concat(getVersionHeader(t.context.readPkg().version, 'v0.0.1'))
    .concat([
      '### Features',
      `* second ${hash2}`
    ])
    .concat(changelog);

  t.is(result2.exitCode, 0, 'success 2');
  t.is(result2.message, 'CHANGELOG.md updated!', 'expected message 2');
  t.deepEqual(t.context.getChangelog(), changelog, 'expected changelog 2');
});
