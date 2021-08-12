# @videojs/update-changelog

A wrapper around conventional-changelog-cli to better support prereleases.


<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Why?](#why)
- [Installation](#installation)
- [Usage](#usage)
  - [Command line](#command-line)
- [License](#license)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Why?
Created to work around issues with full version changelogs when prerelease tags exist.

See: https://github.com/conventional-changelog/standard-version/issues/203

## Installation

Install `@videojs/update-changelog`

```sh
$ npm i --save-dev @videojs/update-changelog
```

## Usage

### Command line
This package provides two binaries `videojs-update-changelog` and `vjs-update-changelog`. Both do the same thing.
Pass `--help` to binaries for more information.

## License

Apache-2.0. Copyright (c) Brightcove, Inc.
