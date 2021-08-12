#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
const crypto = require('crypto');
const shell = require('shelljs');
const exitHook = require('exit-hook');
const semver = require('semver');
const tempdir = path.join(shell.tempdir(), crypto.randomBytes(20).toString('hex'));

const updateChangelog = function(options) {
  const cwd = options.dir;
  const pkg = require(path.join(cwd, 'package.json'));
  const isPrerelease = semver.prerelease(pkg.version);

  if (isPrerelease && !options.runOnPrerelease) {
    console.log('Not updating changelog, this is as this is a prerelease.');
    return;
  }

  // exit on first error
  shell.set('-e');

  exitHook(() => shell.rm('-rf', tempdir));
  shell.cd(cwd);
  shell.mkdir('-p', tempdir);

  // copy .git, package.json, and package-lock.json
  shell.cp('-R', path.join(cwd, '.git'), path.join(tempdir, '.git'));
  shell.cp(path.join(cwd, 'package.json'), path.join(tempdir, 'package.json'));
  shell.cp(path.join(cwd, 'package-lock.json'), path.join(tempdir, 'package-lock.json'));

  // symlink node_modules
  shell.ln('-sf', path.join(cwd, 'node_modules'), path.join(tempdir, 'node_modules'));

  // move to tempdir
  shell.cd(tempdir);

  // delete all prerelease tags to prevent prerelease CHANGELOG entries
  // unless asked not to.
  if (!isPrerelease) {
    const tagResult = shell.exec('git tag -l', {silent: true});
    const tags = tagResult.stdout.split(/\r?\n/);

    tags.forEach(function(tag) {
      if (semver.prerelease(tag)) {
        shell.exec(`git tag -d '${tag}'`, {silent: true});
      }
    });
  }

  let command = 'npx conventional-changelog -p videojs';

  if (!options.stdout) {
    command += ' -i CHANGELOG.md -s';
  }

  // only regenerate the number of releases asked for.
  if (typeof options.releaseCount === 'number') {
    command += ` -r ${options.releaseCount}`;
  }

  // update the changelog
  const changelogResult = shell.exec(command, {silent: true});

  if (options.stdout) {
    console.log(changelogResult.stdout);
    return;
  }

  // copy over the updated changelog
  shell.cp(path.join(tempdir, 'CHANGELOG.md'), path.join(cwd, 'CHANGELOG.md'));

  let message = 'CHANGELOG.md updated';

  // add to git commit if asked for
  if (options.gitAdd) {
    shell.exec('git add CHANGELOG.md', {silent: true});
    message += ' and added to commit';
  }

  console.log(`${message}!`);
};

module.exports = updateChangelog;
