const test = require('ava');
const path = require('path');
const shell = require('shelljs');
const crypto = require('crypto');
const semver = require('semver');
const fs = require('fs');
const {promisify} = require('util');
const cliPath = require.resolve('../src/cli.js');
const sp = require('@brandonocasey/spawn-promise');
const rootDir = path.join(__dirname, '..');
const today = new Date();
const padStart = (val, len, padding = ' ') => (padding.repeat(len) + val.toString()).slice(-len);
const day = padStart(today.getDate(), 2, '0');
const month = padStart((today.getMonth() + 1), 2, '0');
const year = today.getFullYear();
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

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
  return Promise.resolve().then(function() {
    // 60s timeout
    t.timeout(60000);
    t.context.getChangelog = function() {
      return readFileAsync(path.join(t.context.dir, 'CHANGELOG.md'), 'utf8').then(function(result) {
        return Promise.resolve(result
          .trim()
          .split(/\r?\n/)
          .map((v) => v.trim().replace(/^#+/, '').trim())
          .filter((v) => !!v));
      });
    };

    t.context.run = function(args = []) {
      return sp(cliPath, args, {encoding: 'utf8', cwd: t.context.dir});
    };

    t.context.commits = [];

    t.context.commit = (msg) => {
      return sp('git', ['add', '--all'], {cwd: t.context.dir}).then(function(result) {
        return sp('git', ['commit', '--allow-empty', '-m', msg], {cwd: t.context.dir});
      }).then(function(result) {
        return sp('git', ['log', '-n1', '--format=format:%h'], {cwd: t.context.dir});
      }).then(function(result) {
        t.context.commits.push(result.stdout.toString().trim());
        return Promise.resolve();
      });
    };

    t.context.writePkg = (pkg) => {
      return writeFileAsync(path.join(t.context.dir, 'package.json'), JSON.stringify(pkg, null, 2));
    };

    t.context.readPkg = () => {
      return readFileAsync(path.join(t.context.dir, 'package.json')).then(function(result) {
        return Promise.resolve(JSON.parse(result));
      });
    };

    t.context.updatePkg = (cb) => {
      return t.context.readPkg().then(function(pkg) {
        return Promise.resolve(cb(pkg));
      }).then(function(pkg) {
        return t.context.writePkg(pkg);
      });
    };

    return Promise.resolve().then(function() {
      t.context.dir = path.join(shell.tempdir(), crypto.randomBytes(20).toString('hex'));
      shell.cp('-R', path.join(rootDir, 'test', 'fixture'), t.context.dir);
      shell.ln('-sf', path.join(rootDir, 'node_modules'), path.join(t.context.dir, 'node_modules'));
    }).then(function() {
      return writeFileAsync(path.join(t.context.dir, 'CHANGELOG.md'), '');
    }).then(function() {
      return sp('git', ['init'], {cwd: t.context.dir});
    }).then(function() {
      return sp('git', ['config', 'user.email', 'foobar@test.com'], {cwd: t.context.dir});
    }).then(function(result) {
      return sp('git', ['config', 'user.name', 'Foo Bar'], {cwd: t.context.dir});
    });
  });
});

test.afterEach.always((t) => {
  return Promise.resolve().then(function() {
    shell.rm('-rf', t.context.dir);
    return Promise.resolve();
  });
});

test('works for regular changelog update', (t) => {
  return t.context.commit('feat: initial').then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      const expectedLog = []
        .concat(getVersionHeader('0.0.0'))
        .concat([
          'Features',
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
      t.deepEqual(changelog, expectedLog, 'expected changelog');
      return Promise.resolve();
    });
  });
});

test('git add works', (t) => {
  return t.context.commit('feat: initial').then(function() {
    return t.context.run(['--add']);
  }).then(function(result) {
    return Promise.all([
      sp('git', ['diff', '--staged', '--name-only'], {cwd: t.context.dir}),
      t.context.getChangelog()
    ]).then(function([stageResult, changelog]) {
      const expectedLog = []
        .concat(getVersionHeader('0.0.0'))
        .concat([
          'Features',
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated and added to commit!', 'expected stdout');
      t.deepEqual(changelog, expectedLog, 'expected changelog');
      t.is(stageResult.stdout.toString().trim(), 'CHANGELOG.md', 'only changelog in staged');
      return Promise.resolve();
    });
  });
});

test('adds commits', (t) => {
  return t.context.commit('feat: initial').then(function() {
    return t.context.commit('feat: foobar');
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      const expectedLog = []
        .concat(getVersionHeader('0.0.0'))
        .concat([
          'Features',
          `* foobar ${t.context.commits[1]}`,
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
      t.deepEqual(changelog, expectedLog, 'expected changelog');
      return Promise.resolve();
    });
  });
});

test('works for release', (t) => {
  return t.context.commit('feat: initial').then(function() {
    return t.context.updatePkg(function(pkg) {
      pkg.version = '0.0.1';
      return pkg;
    });
  }).then(function(result) {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      const expectedLog = []
        .concat(getVersionHeader('0.0.1'))
        .concat([
          'Features',
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
      t.deepEqual(changelog, expectedLog, 'expected changelog');
      return Promise.resolve();
    });
  });
});

test('works for prerelease with preid and runOnPrerelease', (t) => {
  return t.context.commit('feat: initial').then(function() {
    return t.context.updatePkg(function(pkg) {
      pkg.version = '0.0.1-beta.0';
      return pkg;
    });
  }).then(function() {
    return t.context.run(['--run-on-prerelease']);
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      const expectedLog = []
        .concat(getVersionHeader('0.0.1-beta.0'))
        .concat([
          'Features',
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
      t.deepEqual(changelog, expectedLog, 'expected changelog');
      return Promise.resolve();
    });
  });
});

test('works for prerelease without preid and runOnPrerelease', (t) => {
  return t.context.commit('feat: initial').then(function() {
    return t.context.updatePkg(function(pkg) {
      pkg.version = '0.0.1-0';
      return pkg;
    });
  }).then(function() {
    return t.context.run(['--run-on-prerelease']);
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      const expectedLog = []
        .concat(getVersionHeader('0.0.1-0'))
        .concat([
          'Features',
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
      t.deepEqual(changelog, expectedLog, 'expected changelog');
      return Promise.resolve();
    });
  });
});

test('does nothing on prerelease without runOnPrerelease', (t) => {
  return t.context.commit('feat: initial').then(function() {
    return t.context.updatePkg(function(pkg) {
      pkg.version = '0.0.1-0';
      return pkg;
    });
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'Not updating changelog. This is a prerelease and --run-on-prerelease not set.', 'expected stdout');

      t.deepEqual(changelog, [], 'empty changelog');
      return Promise.resolve();
    });
  });
});

test('add a new release', (t) => {
  let expectedLog;

  return t.context.commit('feat: initial').then(function() {
    return sp('npm', ['version', 'patch'], {cwd: t.context.dir});
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      expectedLog = []
        .concat(getVersionHeader('0.0.1', t.context.commits[0]))
        .concat([
          'Features',
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 1');
      t.deepEqual(changelog, expectedLog, 'expected changelog 1');

      return Promise.resolve();
    });
  }).then(function() {
    return t.context.commit('feat: second');
  }).then(function() {
    return sp('npm', ['version', 'patch'], {cwd: t.context.dir});
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      expectedLog = []
        .concat(getVersionHeader('0.0.2', 'v0.0.1'))
        .concat([
          'Features',
          `* second ${t.context.commits[1]}`
        ])
        .concat(expectedLog);

      t.is(result.status, 0, 'status 2');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 2');
      t.deepEqual(changelog, expectedLog, 'expected changelog 2');

      return Promise.resolve();
    });
  }).then(function() {
    // truncate CHANGELOG  to verify that it will still work.
    return writeFileAsync(path.join(t.context.dir, 'CHANGELOG.md'), '');
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      expectedLog = []
        .concat(getVersionHeader('0.0.2', 'v0.0.1'))
        .concat([
          'Features',
          `* second ${t.context.commits[1]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 3');
      t.deepEqual(changelog, expectedLog, 'expected changelog 3 ');
      return Promise.resolve();
    });
  });
});

test('release after a prerelease includes prerelease changes', (t) => {
  let expectedLog;

  return t.context.commit('feat: initial').then(function() {
    return sp('npm', ['version', 'patch'], {cwd: t.context.dir});
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      expectedLog = []
        .concat(getVersionHeader('0.0.1', t.context.commits[0]))
        .concat([
          'Features',
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 1');
      t.deepEqual(changelog, expectedLog, 'expected changelog 1');

      return Promise.resolve();
    });
  }).then(function() {
    return t.context.commit('feat: second');
  }).then(function() {
    return sp('npm', ['version', 'prerelease'], {cwd: t.context.dir});
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    t.context.getChangelog().then(function(changelog) {
      t.is(result.status, 0, 'status 2');
      t.is(
        result.stdout.trim(),
        'Not updating changelog. This is a prerelease and --run-on-prerelease not set.',
        'expected stdout 2'
      );
      t.deepEqual(changelog, expectedLog, 'expected changelog 2');

      return Promise.resolve();
    });
  }).then(function() {
    return t.context.commit('fix: third');
  }).then(function() {
    return sp('npm', ['version', 'prerelease'], {cwd: t.context.dir});
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      t.is(result.status, 0, 'status 3');
      t.is(
        result.stdout.trim(),
        'Not updating changelog. This is a prerelease and --run-on-prerelease not set.',
        'expected stdout 3'
      );
      t.deepEqual(changelog, expectedLog, 'expected changelog 3');

      return Promise.resolve();
    });
  }).then(function() {
    return sp('npm', ['version', 'patch'], {cwd: t.context.dir});
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      expectedLog = []
        .concat(getVersionHeader('0.0.2', 'v0.0.1'))
        .concat([
          'Features',
          `* second ${t.context.commits[1]}`,
          'Bug Fixes',
          `* third ${t.context.commits[2]}`
        ])
        .concat(expectedLog);

      t.is(result.status, 0, 'status 4');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 4');
      t.deepEqual(changelog, expectedLog, 'expected changelog 4');
      return Promise.resolve();
    });
  });
});

['patch', 'minor', 'major'].forEach(function(versionType) {
  test(`${versionType} release after a prerelease includes prelease changes and release changes`, (t) => {
    let expectedLog;

    return t.context.commit('feat: initial').then(function() {
      return sp('npm', ['version', 'patch'], {cwd: t.context.dir});
    }).then(function(result) {
      return t.context.run();
    }).then(function(result) {
      return t.context.getChangelog().then(function(changelog) {
        expectedLog = []
          .concat(getVersionHeader('0.0.1', t.context.commits[0]))
          .concat([
            'Features',
            `* initial ${t.context.commits[0]}`
          ]);

        t.is(result.status, 0, 'status');
        t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 1');
        t.deepEqual(changelog, expectedLog, 'expected changelog 1');
        return Promise.resolve();
      });
    }).then(function() {
      return t.context.commit('feat: second');
    }).then(function() {
      return sp('npm', ['version', 'prerelease'], {cwd: t.context.dir});
    }).then(function() {
      return t.context.run();
    }).then(function(result) {
      return t.context.getChangelog().then(function(changelog) {
        t.is(result.status, 0, 'status 2');
        t.is(
          result.stdout.trim(),
          'Not updating changelog. This is a prerelease and --run-on-prerelease not set.',
          'expected stdout 2'
        );
        t.deepEqual(changelog, expectedLog, 'expected changelog 2');
        return Promise.resolve();
      });
    }).then(function() {
      return t.context.commit('feat: third');
    }).then(function() {
      return sp('npm', ['version', versionType], {cwd: t.context.dir});
    }).then(function() {
      return t.context.run();
    }).then(function(result) {
      return Promise.all([
        t.context.readPkg(),
        t.context.getChangelog()
      ]).then(function([pkg, changelog]) {
        expectedLog = []
          .concat(getVersionHeader(pkg.version, 'v0.0.1'))
          .concat([
            'Features',
            `* second ${t.context.commits[1]}`,
            `* third ${t.context.commits[2]}`
          ])
          .concat(expectedLog);

        t.is(result.status, 0, 'status');
        t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 3');
        t.deepEqual(changelog, expectedLog, 'expected changelog 3');
        return Promise.resolve();
      });
    });
  });
});

test('can include prerelease and release in CHANGELOG.md', (t) => {
  let expectedLog;

  return t.context.commit('feat: initial').then(function() {
    return sp('npm', ['version', 'patch'], {cwd: t.context.dir});
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      expectedLog = []
        .concat(getVersionHeader('0.0.1', t.context.commits[0]))
        .concat([
          'Features',
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 1');
      t.deepEqual(changelog, expectedLog, 'expected changelog 1');

      return Promise.resolve();
    });
  }).then(function() {
    return t.context.commit('feat: second');
  }).then(function() {
    return sp('npm', ['version', 'prerelease'], {cwd: t.context.dir});
  }).then(function() {
    return t.context.run(['--run-on-prerelease']);
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      expectedLog = []
        .concat(getVersionHeader('0.0.2-0', 'v0.0.1'))
        .concat([
          'Features',
          `* second ${t.context.commits[1]}`
        ])
        .concat(expectedLog);
      t.deepEqual(changelog, expectedLog, 'expected changelog 2');
      t.is(result.status, 0, 'status 2');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 2');
      return Promise.resolve();
    });
  }).then(function() {
    return t.context.commit('fix: third');
  }).then(function() {
    return sp('npm', ['version', 'prerelease'], {cwd: t.context.dir});
  }).then(function() {

    return t.context.run(['--run-on-prerelease']);
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      expectedLog = []
        .concat(getVersionHeader('0.0.2-1', 'v0.0.2-0'))
        .concat([
          'Bug Fixes',
          `* third ${t.context.commits[2]}`
        ])
        .concat(expectedLog);

      t.is(result.status, 0, 'status 3');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 3');

      t.deepEqual(changelog, expectedLog, 'expected changelog 3');
      return Promise.resolve();
    });
  }).then(function() {
    return t.context.commit('feat: forth');
  }).then(function() {
    return sp('npm', ['version', 'patch'], {cwd: t.context.dir});
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      expectedLog = []
        .concat(getVersionHeader('0.0.2', 'v0.0.1'))
        .concat([
          'Features',
          `* forth ${t.context.commits[3]}`,
          `* second ${t.context.commits[1]}`,
          'Bug Fixes',
          `* third ${t.context.commits[2]}`
        ])
        .concat(expectedLog);

      t.is(result.status, 0, 'status 4');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 4');

      t.deepEqual(changelog, expectedLog, 'expected changelog 4');
      return Promise.resolve();
    });
  });
});

test('Creates a CHANGELOG.md if it does not exist', (t) => {
  return t.context.commit('feat: initial').then(function() {
    shell.rm(path.join(t.context.dir, 'CHANGELOG.md'));

    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      const expectedLog = []
        .concat(getVersionHeader('0.0.0'))
        .concat([
          'Features',
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
      t.deepEqual(changelog, expectedLog, 'expected changelog');
      return Promise.resolve();
    });
  });
});

test('status without node_modules', (t) => {
  return t.context.commit('feat: initial').then(function() {

    shell.rm('-rf', path.join(t.context.dir, 'node_modules'));
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      const expectedLog = []
        .concat(getVersionHeader('0.0.0'))
        .concat([
          'Features',
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');

      t.deepEqual(changelog, expectedLog, 'expected changelog');
      return Promise.resolve();
    });
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
  return t.context.commit('feat: initial').then(function() {
    shell.rm(path.join(t.context.dir, 'package.json'));
    return t.context.run();
  }).then(function(result) {
    t.is(result.status, 1, 'status');
    t.is(
      result.stdout.trim(),
      'Cannot run as package.json does not exist.',
      'expected stdout'
    );
  });
});

test('does not fail without package-lock.json', (t) => {
  return t.context.commit('feat: initial').then(function() {
    shell.rm(path.join(t.context.dir, 'package-lock.json'));

    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      const expectedLog = []
        .concat(getVersionHeader('0.0.0'))
        .concat([
          'Features',
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
      t.deepEqual(changelog, expectedLog, 'expected changelog');
      return Promise.resolve();
    });
  });
});

test('fails with invalid package.json', (t) => {
  return t.context.commit('feat: initial').then(function() {
    return writeFileAsync(path.join(t.context.dir, 'package.json'), 'invalid-data');
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    t.is(result.status, 1, 'status');
    t.true((/^Could not read package.json/).test(result.stdout.trim()), 'expected stdout');
  });
});

test('fails with invalid package version', (t) => {
  return t.context.commit('feat: initial').then(function() {
    return t.context.updatePkg(function(pkg) {
      pkg.version = 'foo';
      return pkg;
    });
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    t.is(result.status, 1, 'status');
    t.is(result.stdout.trim(), 'version in package.json foo is invalid!', 'expected stdout');
  });
});

test('does not fail with invalid version tags', (t) => {
  return t.context.commit('feat: initial').then(function() {
    return Promise.all([
      sp('git', ['tag', 'foo'], {cwd: t.context.dir}),
      sp('git', ['tag', '3.0r1'], {cwd: t.context.dir}),
      sp('git', ['tag', '3b'], {cwd: t.context.dir}),
      sp('git', ['tag', '3.0b'], {cwd: t.context.dir})
    ]);
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      const expectedLog = []
        .concat(getVersionHeader('0.0.0'))
        .concat([
          'Features',
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');
      t.deepEqual(changelog, expectedLog, 'expected changelog');
      return Promise.resolve();
    });
  });
});

test('does not add commits twice', (t) => {
  let expectedLog;

  return t.context.commit('feat: initial').then(function() {
    return t.context.commit('feat: foobar');
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      expectedLog = []
        .concat(getVersionHeader('0.0.0'))
        .concat([
          'Features',
          `* foobar ${t.context.commits[1]}`,
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');

      t.deepEqual(changelog, expectedLog, 'expected changelog');
      return Promise.resolve();
    });
  }).then(function(result) {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      t.is(result.status, 0, 'status 2 ');
      t.is(result.stdout.trim(), 'CHANGELOG.md not updated as it already has an entry for v0.0.0.', 'expected stdout 2');
      t.deepEqual(changelog, expectedLog, 'expected changelog');
      return Promise.resolve();
    });
  });
});

test('does not duplicate releases for versions before tag creation', (t) => {
  let expectedLog;

  return t.context.commit('feat: initial').then(function() {
    return sp('npm', ['version', 'patch'], {cwd: t.context.dir});
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      expectedLog = []
        .concat(getVersionHeader('0.0.1', t.context.commits[0]))
        .concat([
          'Features',
          `* initial ${t.context.commits[0]}`
        ]);

      t.is(result.status, 0, 'status');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout');

      t.deepEqual(changelog, expectedLog, 'expected changelog');
      return Promise.resolve();
    });
  }).then(function() {
    return t.context.commit('feat: second');
  }).then(function() {
    return t.context.updatePkg(function(pkg) {
      pkg.version = '0.0.2';
      return pkg;
    });
  }).then(function() {
    return t.context.run();
  }).then(function(result) {
    return t.context.getChangelog().then(function(changelog) {
      expectedLog = []
        .concat(getVersionHeader('0.0.2', 'v0.0.1'))
        .concat([
          'Features',
          `* second ${t.context.commits[1]}`
        ])
        .concat(expectedLog);

      t.is(result.status, 0, 'status 2');
      t.is(result.stdout.trim(), 'CHANGELOG.md updated!', 'expected stdout 2');
      t.deepEqual(changelog, expectedLog, 'expected changelog 2');
      return Promise.resolve();
    });
  });
});
