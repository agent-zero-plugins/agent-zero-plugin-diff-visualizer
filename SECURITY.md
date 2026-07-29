# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately via **GitHub Security Advisories**:
*Security → Report a vulnerability* on this repository. Do not open public issues
for security reports.

You can expect an acknowledgement within 7 days.

## Scope & security posture

- The plugin runs **entirely client-side** inside the Agent Zero chat UI plus two
  small Python system-prompt extensions. It has **no API handlers, no tools, no
  secrets, no configuration, and no persisted state**.
- Rendered diff content is produced by `diff2html` from the raw fence text. The
  plugin never executes fence content.
- The only network dependency is the pinned `diff2html@3.4.51` bundle from
  jsDelivr, lazy-loaded at first render. If it fails to load, diff blocks stay as
  readable plain code (no fallback fetching, no retries against other hosts).
- Supply-chain surface: the CDN pin is exact-version. Bumping it is a reviewed
  code change, never automatic.

## Supported versions

Only the latest release receives security fixes.
