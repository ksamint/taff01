# Organization cleanup and login defaults — 2026-10-17 UTC

- Working: 32 leftover R1 organizations are archived; Table AI, 侍天TIANSIGHT, APUCH and personal workspaces remain. History is retained.
- Cause: earlier live verification retained organizations because no supported archive operation existed. The live cleanup harness now archives its newly created organizations.
- Login: a joined organization is preferred; otherwise the named personal workspace opens. Users can save an explicit default across devices, and system administrators can set it for members. Manual switching survives refresh; fresh authentication uses the saved default.
- Security: defaults require target membership, private preferences notify only their user, delegated changes record the administrator, archived workspaces reject REST/MCP access, and ordinary personal-workspace invitations remain available.
- Validation: source `dee8c00f152bb7db73edfc3f13d40a48ad6bc8f1`, PRs #58/#59 and exact-source CI green; 1,689 tests, 270 browser cases, 166 visuals. Two-session default persistence and 22 unique live cases passed with the metadata-repair attribution recorded in docs/deploy.md.
- Released: v0.2.9, final organization inventory verified, native lock released and runtime healthy. The MCP version now comes from package metadata, with an initialize-response regression test.
- Missing work for the request: none. Open decisions: none.
