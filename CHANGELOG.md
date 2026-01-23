# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.3] - 2026-01-23

### Fixed
- Improved robustness of Cloudflare Workers fix by ensuring response bodies are cancelled in `catch` blocks if an error occurs before consumption.
- Prevents potential stalls if `response.text()` or subsequent parsing logic fails.

## [1.1.2] - 2026-01-23

### Fixed
- Fixed stalled HTTP response warning in Cloudflare Workers by properly cancelling response bodies when HTTP errors occur.

## [1.1.1] - Previous Release

### Changed
- Previous version changes (add details if available)

## [1.1.0] - Previous Release

### Changed
- Previous version changes (add details if available)
