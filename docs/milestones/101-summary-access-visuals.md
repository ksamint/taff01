# 101 — Local Linux summary and access references

- C6 captures the report, workspace People/Agents/Tokens tabs, token explanation and system access page: three locales × phone/desktop, 36 PNG references.
- Real access reads and controls are used; report data comes from the reviewed renderer fixtures. The system table keeps real organization/grant rows and only this test's token.
- Disposable reviewers temporarily gain system administration through the guarded loopback fixture; tokens are revoked and the role removed in teardown.
- Native Linux ARM64 Chromium 156.0.8078.80, Playwright 1.64.1/build1248, official image digest and source/spec/config hashes are recorded in the capture manifest.
- Tests run on macOS through a local browser WebSocket with only loopback network exposure. No emulation, GitHub Actions or runners.
- Capture: six cases passed in 17.2s; all 36 images inspected. fileye detects PNGs, records dimensions and SHA-256; original bytes are retained. No warnings.
- First comparison caught premature sidebar capture on two desktop system references; sidebar readiness is now asserted. Comparison without snapshot updates is required on the committed source before acceptance. Full v0.2.20 checks and deployment remain pending.
- C5 routing and the public page's separate JavaScript target are unchanged by this work.
