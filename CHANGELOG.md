# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] - 2026-01-23

### Fixed
- Fixed stalled HTTP response warning in Cloudflare Workers by properly cancelling response bodies when HTTP errors occur
- Added `response.body?.cancel()` calls before throwing errors in `getDecodingParams()`, `decodeUrl()`, and `decodeBatch()` methods

## [1.1.1] - Previous Release

### Changed
- Previous version changes (add details if available)

## [1.1.0] - Previous Release

### Changed
- Previous version changes (add details if available)
