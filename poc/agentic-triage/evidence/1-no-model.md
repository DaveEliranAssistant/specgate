# SpecGate triage (optional, advisory)

Check: REVIEW REQUIRED (unchanged by triage)

Model: none — not-configured

| id | finding | rules label | reason | model suggestion |
|---|---|---|---|---|
| f1 | route-observation-changed POST /tickets | consumer\_break | Stricter contract: validation.length.maxLength | — |
| f2 | route-removed DELETE /tickets/:id | consumer\_break | Route removed; existing clients of this route will fail | — |
| f3 | route-observation-changed PATCH /tickets/:id | needs\_review | Loosened or ambiguous change: validation.optional | — |
| f4 | route-observation-changed GET /health | noise | Only handler name or registration location changed | — |
| f5 | route-observation-changed GET /tickets/:id | noise | Only handler name or registration location changed | — |
| f6 | route-added GET /audit | needs\_review | Additive route; not a break, but needs independent requirements before tests | — |
| f7 | source-changed src/helpers.mjs | noise | Source hash changed but no route-level delta was observed in the supported subset (comments/formatting/unobserved code). Still review if the file has unsupported code. | — |
| f8 | source-changed src/service.mjs | consumer\_break | Covered by route findings in the same file | — |

Labels are review aids, not approvals. The check result above is unchanged by triage; no baseline, test or assertion is modified.
