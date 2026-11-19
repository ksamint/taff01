# Plan 0003 P3 · Board task access

- The board requests a task's access when its menu opens or a drag starts.
- A drop awaits the allowed statuses and checks the active session before sending a change.
- A production-mode baseline browser case observed one request on load for one card.
- Lint, typecheck and 20 focused board and optimistic state tests passed locally.
- The new three-locale browser case covers the request count, an authorized pending drop
  and a non-owner member whose task stays read-only.
- Candidate browser results and the full local gate are pending. The total board request
  budget also depends on P2.
