# SpecGate triage (optional, advisory)

Check: REVIEW REQUIRED (unchanged by triage)

Model: groq (SIMULATED response, no network) — suggested; 2 invalid suggestion(s) dropped

| id | finding | rules label | reason | model suggestion |
|---|---|---|---|---|
| f1 | route-observation-changed POST /tickets | consumer\_break | Stricter contract: validation.length.maxLength | consumer\_break — Max length shrank; clients sending 41-80 chars now get 400. |
| f2 | route-removed DELETE /tickets/:id | approved\_change | Route removal approved by demo/CHANGELOG.md#remove-delete | — |
| f3 | route-observation-changed PATCH /tickets/:id | needs\_review | Loosened or ambiguous change: validation.optional | approved\_change ⚠ disagrees — Change intent says PATCH title becomes optional. |
| f4 | route-observation-changed GET /health | noise | Only handler name or registration location changed | noise — Handler rename and line move only. |
| f5 | route-observation-changed GET /tickets/:id | noise | Only handler name or registration location changed | — |
| f6 | route-added GET /audit | needs\_review | Additive route; not a break, but needs independent requirements before tests | approved\_change ⚠ disagrees — Intent mentions adding /audit. |
| f7 | source-changed src/helpers.mjs | noise | Source hash changed but no route-level delta was observed in the supported subset (comments/formatting/unobserved code). Still review if the file has unsupported code. | — |
| f8 | source-changed src/service.mjs | consumer\_break | Covered by route findings in the same file | noise ⚠ disagrees — Wrong on purpose: model tries to downgrade a break. |

Labels are review aids, not approvals. The check result above is unchanged by triage; no baseline, test or assertion is modified.
