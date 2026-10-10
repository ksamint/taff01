# Offline prototype assets

React and ReactDOM 18.3.1 production UMD files are extracted unchanged from the
public npm package tarballs. Both are MIT licensed; the original licences are
included. `support.js` retains their original SHA-384 integrity checks.

The complete variable Noto Sans TC font is copied unchanged from the pinned
Google Fonts revision recorded in `provenance.json`. Its full Unicode coverage
keeps prototype Chinese text offline without relying on an application-specific
subset or on the host's CJK fonts. It uses SIL OFL 1.1. The original Manrope
font remains in the prototype's design-system assets; its OFL is included here.

`provenance.json` records source URLs, archive paths where applicable, licences
and SHA-256 hashes. These are documentation/prototype assets, not application
client dependencies. No npm packages were installed to produce them.

The shared declarative runtime still contains an unused Babel loader for JSX
imports; this prototype imports its existing JavaScript design-system bundle,
so Babel is not requested. The reference runner rejects every external request,
including a future JSX import that attempts to activate that loader.
