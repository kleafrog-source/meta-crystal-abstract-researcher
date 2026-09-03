# Security

PLAYER is a local-first browser app. Songs are stored in IndexedDB, and share links encode song data in
the URL hash.

## Reporting a Vulnerability

If you find a security issue, please open a private report through the repository host if supported, or
contact the maintainer directly.

Please include:

- A short description of the issue
- Steps to reproduce it
- The expected impact
- Any relevant browser, OS, or deployment details

## Scope

Useful reports include issues in share-link handling, song import/export, persistence, dependency
integration, and any behavior that could execute untrusted code outside the expected Strudel editing
model.
