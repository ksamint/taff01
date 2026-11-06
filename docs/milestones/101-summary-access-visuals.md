# 101 — Local Linux summary and access references

- C6 captures the report, workspace People/Agents/Tokens tabs, token explanation and system access page: three locales × phone/desktop, 36 PNG references.
- Real access reads and controls are used; report data comes from the reviewed renderer fixtures. The system table keeps real organization/grant rows and only this test's token.
- Disposable reviewers temporarily gain system administration through the guarded loopback fixture; tokens are revoked and the role removed in teardown.
- Native Linux ARM64 Chromium 156.0.8078.80, Playwright 1.64.1/build1248, official image digest and source/spec/config hashes are recorded in the capture manifest.
- Tests run on macOS through a local browser WebSocket with only loopback network exposure. No emulation, GitHub Actions or runners.
- Capture: six cases passed in 17.2s; all 36 images inspected. fileye detects PNGs, records dimensions and SHA-256; original bytes are retained. No warnings.
- First comparison caught premature sidebar capture on two desktop system references; sidebar readiness is now asserted. Comparison without snapshot updates is required on the committed source before acceptance. Full v0.2.20 checks and deployment remain pending.
- C5 routing and the public page's separate JavaScript target are unchanged by this work.

- Fresh-database fixture correction: UUID-only organization ordering fails when a seed ID changes; explicit English business-name ordering with ID tie-breaks passes the two-case regression. Product ordering and real rows/controls are unchanged.
- Only three desktop system-table references changed; all 33 others matched byte-for-byte. The three changed images were inspected, and manifest hashes plus original/updated fileye bytes were retained.
- C6 setup reuses the release fixture’s server-directed 429 backoff; sign-up still must return 200 and product limits stay intact. Stale-build and normal-rate-limit attempts remain in focused evidence; final no-update comparison is required on committed source.
- Clean committed fixture `fcbcfe6` passed all six Linux comparisons in 50.2s with reference updates disabled and normal server-directed sign-up pacing; the complete final-source v0.2.20 gate remains pending.
