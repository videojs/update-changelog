#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
const crypto = require('crypto');
const shell = require('shelljs');
const exec = require('child_process').execSync;
const exitHook = require('exit-hook');
const semver = require('semver');
const fs = require('fs');
const getDefaults = require('./get-defaults.js');
const conventionalCliPkg = require('conventional-changelog-cli/package.json');
const conventionalCliPath = require.resolve(path.join('conventional-changelog-cli', conventionalCliPkg.bin['conventional-changelog']));

/**
 * Move over to a temporary directory so that
 * we can delete git tags without worrying about modifying
 * local git changes.
 */
const createTempDir = function(cwd) {
  const tempdir = path.join(shell.tempdir(), crypto.randomBytes(20).toString('hex'));

  exitHook(() => shell.rm('-rf', tempdir));
  shell.mkdir('-p', tempdir);

  // copy .git, package.json, and package-lock.json
  shell.cp('-R', path.join(cwd, '.git'), path.join(tempdir, '.git'));
  shell.cp(path.join(cwd, 'package.json'), path.join(tempdir, 'package.json'));
  shell.cp(path.join(cwd, 'package-lock.json'), path.join(tempdir, 'package-lock.json'));

  // symlink node_modules
  shell.ln('-sf', path.join(cwd, 'node_modules'), path.join(tempdir, 'node_modules'));

  // symlink CHANGELOG.md
  shell.ln('-sf', path.join(cwd, 'CHANGELOG.md'), path.join(tempdir, 'CHANGELOG.md'));

  return tempdir;
};

const getPkgAndErrorCheck = function(cwd) {
  if (!cwd || !shell.test('-d', cwd)) {
    return `Cannot run as directory '${cwd}' does not exist.`;
  } else if (!shell.test('-d', path.join(cwd, '.git'))) {
    return `Cannot run as .git directory does not exist in directory '${cwd}'.`;
  } else if (!shell.test('-f', path.join(cwd, 'package.json'))) {
    return `Cannot run as package.json does not exist in directory '${cwd}'.`;
  } else if (!shell.test('-f', path.join(cwd, 'package-lock.json'))) {
    return `Cannot run as package-lock.json does not exist in directory '${cwd}'.`;
  }

  try {
    exec('git log', {cwd, stdio: 'ignore'});
  } catch (e) {
    return `There are no commits in the git repo for directory '${cwd}'.`;
  }

  let pkg;

  try {
    pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json')));
  } catch (e) {
    return `Could not read package.json in ${cwd}. It threw an error:\n${e.stack}`;
  }

  if (!semver.valid(pkg.version)) {
    return `version in package.json ${pkg.version} is invalid!`;
  }

  return pkg;
};

const updateChangelog = function(options = {}) {
  options = Object.assign(getDefaults(), options);

  let cwd = options.dir;
  const pkg = getPkgAndErrorCheck(cwd);

  // if pkg is a string and not an object, it is an error.
  if (typeof pkg === 'string') {
    return {
      message: pkg,
      exitCode: 1
    };
  }

  const isPrerelease = semver.prerelease(pkg.version);

  if (isPrerelease && !options.runOnPrerelease) {
    return {
      message: 'Not updating changelog. This is a prerelease and --run-on-prerelease not set.',
      exitCode: 0
    };
  }

  if (!shell.test('-f', path.join(cwd, 'CHANGELOG.md'))) {
    shell.touch(path.join(cwd, 'CHANGELOG.md'));
  } else {
    const changelog = fs.readFileSync(path.join(cwd, 'CHANGELOG.md'), 'utf8');
    const regex = RegExp(`<a name="${pkg.version}"></a>`);

    if (regex.test(changelog)) {
      return {
        message: `CHANGELOG.md not updated as it already has an entry for v${pkg.version}.`,
        exitCode: 0
      };
    }
  }

  // exit on first error
  shell.set('-e');

  const tagResult = exec('git tag -l', {cwd});
  const tagsToDelete = [];
  let releaseCount = 1;
  let previous = '0.0.0';
  const tags = [];

  tagResult.toString().trim().split(/\r?\n/).forEach(function(tag) {
    // skip if:
    // tag is a falsy value
    // tag is not a version tag
    if (!tag || !semver.valid(tag)) {
      return;
    }

    // if the current version already has a tag
    // we need to re-generate the changelog for two versions
    // as any state after a tag has "unreleased changes"
    if (semver.eq(tag, pkg.version)) {
      releaseCount = 2;
      return;
    }

    if (!semver.prerelease(tag) && semver.gt(tag, previous)) {
      previous = tag;
    }

    tags.push(tag);
  });

  tags.forEach(function(tag) {
    // delete preleases tags of between the previous version and the
    // current version so that we get all prerelease changes
    // included in the current release.
    if (semver.prerelease(tag) && semver.gt(tag, previous)) {
      tagsToDelete.push(tag);
    }
  });

  // delete all prerelease tags to prevent prerelease CHANGELOG entries
  // unless asked not to.
  if (!isPrerelease && tagsToDelete.length) {
    cwd = createTempDir(cwd);
    exec(`git tag -d ${tagsToDelete.join(' ')}`, {cwd});
  }

  exec(`${conventionalCliPath} -p videojs -i CHANGELOG.md -s -r ${releaseCount}`, {cwd});

  let message = 'CHANGELOG.md updated';

  // add to git commit if asked for
  if (options.gitAdd) {
    // make sure to add the changelog in the original directory
    // using options.dir;
    exec('git add CHANGELOG.md', {cwd: options.dir});
    message += ' and added to commit';
  }

  message += '!';

  return {message, exitCode: 0};
};

module.exports = updateChangelog;
