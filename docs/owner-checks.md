# Owner checks after a release

Checks that need the owner's own account. They never hold the deploy lock
([release closeout](release-closeout.md), last paragraph); run them after the
lock is released and record the result as a one-line docs PR in the release
milestone (`docs/milestones/NN-vX.Y.Z.md`, "Owner checks" line) and in
`docs/deploy.md` beside the release's pending items.

Pending since: Claude.ai connector, owner decision 2026-10-21 ("Run that check
later without the lock"); owner summary download, v0.2.21 onward (the
verification account has no summaries).

## 1. Owner summary download (DS-8, DS-5)

Needs: an owner account that is an admin of a workspace with at least one
audience tag, a tagged project and one generated summary.

1. Open `/orgs/summaries`, pick a recipient, open its newest summary.
2. **Copy text**: paste it anywhere; the last lines show the watermark and the
   64-character content hash.
3. **Save image**: the file is `taff-summary-<id>.png`, 1080 px wide, at most
   400 KB, with the diagonal watermark and the short hash in the footer.
4. On a phone, open `/summaries` from Me and repeat step 3.
5. Record: date, release, summary id prefix (8 characters), both results.
   Do not paste the summary, the hash or the image into the record.

## 2. Claude.ai connector usage (ADR 0022, 0023)

Needs: the owner's Claude.ai account with custom connectors allowed.

1. In Claude.ai, add a custom connector with the URL `https://taff.apuch.cn/mcp`.
2. Complete sign-in and the admin approval screen in Taff.
3. In a Claude.ai chat, ask it to list Taff tools; expect 38, including
   `context.get`. Run `context.get` once.
4. In Taff, open `/me/mcp`: the Claude.ai grant is listed.
5. Revoke it there; the next Claude.ai tool call fails with an authorization
   error. Reconnect the connector; tools work again.
6. Record: date, release, tool count, and pass/fail for steps 3–5. Never
   record tokens, codes or the Authorization header.

## 3. Exported view image (VE-3, from v0.2.24)

1. On a phone, open a project, tap Export image, then Send, and pick WeChat
   (or any chat). The image arrives as a picture, not a file link.
2. Record: date, release, target app, pass/fail.

## 4. Twin live view image (owner-only after unlock)

Have Twin call `views.image` with both read scopes and post one returned PNG
to an owner-selected test chat. Check agent watermark, filename and readable
content; record date, release and pass/fail. This task does not send messages.

## 5. XIDING on a phone (OT-2, from the v0.2.26 plan X3)

1. Sign in on a phone, switch to XIDING, open Projects → More → Sectors.
2. Six sectors show in order, each with its 營運設置 setup task.
3. Quick Add `+財務與現金 <any title>`; the task appears under 財務與現金.
4. Record: date, release, pass/fail. Archive the test task afterwards.
