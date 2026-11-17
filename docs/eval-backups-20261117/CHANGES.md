# Eval + instruction changes, 17 Nov 2026

Source runs: New Features (Nov) 59852cc241e846f980db4226 (NF-03 failed); ADMIN EVAL bb71b4a10f9a47d98cf1a05d (A-N-05, A-Z-05, A-Z-07, A-Z-09 failed); Department EVAL ea936c0d60a3427e96306c02 (D-05).
Rule: fix in the eval where the agent's answer is acceptable; change instructions only where the eval would have to accept a wrong answer.

## Eval (applied, verified: saved text == intended)
| Item | Change | Case |
|---|---|---|
| Metric P2P \| Answer Relevancy (e_6ae06cf9d4501754c758f443) v6 | Rule (g): asking "what kind of number" only when the Input doesn't name the record type; standard not-found message is fully relevant when it does | A-Z-07 |
| Test case A-Z-09 input | "ZIP POs over $100,000 this year → fetch next 10" -> "ZIP POs over $100,000 this year" | A-Z-09 |
| Test case A-Z-09 expected | Nice-to-include no longer asks for a next page; defines what "clearly flag" unconverted amounts means | A-Z-09 |
| Test case A-Z-05 expected | Billing status moved to nice-to-include; Zip has no currency field: INR or an explicit "Zip doesn't record currency" note is acceptable; USD label or guessed-as-fact currency is not | A-Z-05 |
| Test case D-05 expected | Snapshot INR unbilled ₹27,72,373.19 (10x too small) -> ₹2,77,23,731.87; USD PO count 3 -> 4 | D-05 |

## Agent instructions (draft v98 saved, NOT deployed; live is v97)
- Line 352 added (vendor credits): approval comes from approvalstatus, never status; empty approval status = none pending. Case NF-03.
- Line 415 extended: "This bill isn't linked to a PO."; never name fields/tables checked; no access speculation unless the tool reports hidden records. Case A-N-05.
- Not changed: no Zip-currency rule (A-Z-05/A-Z-09 handled in the eval).

## Backups (old versions)
testcase_A-Z-05.json, testcase_A-Z-09.json, testcase_D-05.json, metric_answer_relevancy.json, agent_v97.json / agent_instructions_v97.md. New draft text: agent_instructions_new_draft.md.
