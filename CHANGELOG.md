# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Fixed `decodeBatch()` source/result mismatches caused by Google News returning multi-payload `batchexecute` rows in non-deterministic order.

### Changed
- Canary job summaries now use links intended to open in a new browser tab.

## [1.2.2] - 2026-06-16

### Fixed
- Fixed `decodeBatch()` failing due to Google News API response format changes (switched from `wrb.fr` from `w779db`).
- Improved parsing robustness by filtering for the action code `Fbv4je`.

### Added
- Comprehensive unit tests for `decodeBatch()` covering both new and legacy response formats.

## [1.2.0] - 2026-03-31

### Changed
- Updated `node-html-parser` from 7.0.1 to 7.1.0.
- Added `engines` field to `package.json` requiring Node.js >= 18 (for built-in `fetch`).
- Added unit tests with mocked HTTP responses.
- Backfilled incomplete changelog entries.

## [1.1.3] - 2026-01-23

### Fixed
- Improved robustness of Cloudflare Workers fix by ensuring response bodies are cancelled in `catch` blocks if an error occurs before consumption.
- Prevents potential stalls if `response.text()` or subsequent parsing logic fails.

## [1.1.2] - 2026-01-23

### Fixed
- Fixed stalled HTTP response warning in Cloudflare Workers by properly cancelling response bodies when HTTP errors occur.

## [1.1.1] - 2026-01-22

### Changed
- Updated README with usage documentation and feature list.
- Version bump for npm publish.

## [1.1.0] - 2026-01-22

### Added
- Batch decoding support via `decodeBatch()` method — sends multiple requests in a single `batchexecute` call.
- Random delays between parameter fetches to avoid rate limiting.

## [1.0.1] - 2026-01-21

### Fixed
- Fixed `node-html-parser` dependency version specification.

## [1.0.0] - 2026-01-21

### Added
- Initial release — Google News URL decoder ported from Python `googlenewsdecoder`.
- `GoogleDecoder` class with `decode()` and `getBase64Str()` methods.
- CLI support for decoding URLs via command line.
