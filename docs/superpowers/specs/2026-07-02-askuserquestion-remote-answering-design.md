# Remote answering of AskUserQuestion — design

**Date:** 2026-07-02
**Status:** approved-to-start (user said "開始吧"; author proceeding on best-judgment defaults)

## Problem

clawleash relays Claude Code permission prompts to the phone / desktop toast, but
only ever shows **Allow / Deny** (+ optional "always allow" rule suggestions).

When Claude Code asks the user to **choose a direction** — the `AskUserQuestion`
tool — the prompt carries a list of options, but clawleash treats it as a plain
allow/deny request. The user can't pick an option remotely; the run stalls at the
terminal. This defeats the whole point of clawleash for long autonomous runs.

The sibling project `clawd-on-desk` (clawleash's origin) already solves this. This
spec ports that mechanism.

## Key facts (verified against clawd-on-desk + a real hook payload)

- `AskUserQuestion` and `ExitPlanMode` are **tools**. They arrive through the
  **same `PermissionRequest` HTTP hook** clawleash already registers
  (`matcher: ""`, `/hook/permission`). **No hook re-registration is needed.**
- `AskUserQuestion` `tool_input` shape:
  ```jsonc
  { "questions": [
      { "question": "…", "header": "…", "multiSelect": false,
        "options": [ { "label": "…", "description": "…" } ] } ] }
  ```
- To answer without the terminal, respond to the hook with:
  ```jsonc
  { "hookSpecificOutput": { "hookEventName": "PermissionRequest",
      "decision": { "behavior": "allow",
        "updatedInput": { ...toolInput, "answers": { "<question text>": "<label>" } } } } }
  ```
  `updatedInput` sits inside `decision`, next to `behavior`. clawleash's daemon
  already emits that envelope for `updatedPermissions`; it just needs an
  `updatedInput` path too.

## Scope

**v1 — single-select `AskUserQuestion`.** The "choose a direction" case.
- Render each question's options as tap buttons on phone + desktop toast.
- Tapping an option (for a one-question, single-select prompt) submits the answer
  and returns `updatedInput` → the run continues remotely.
- Always keep a **"Go to Terminal"** escape (maps to `deny` → CC falls back to its
  terminal prompt), for anything v1 can't answer.

**Fast-follow (out of scope for v1, degrade to "Go to Terminal"):**
- `multiSelect: true` questions (need multi-pick + submit; answer-format unverified).
- `"Other"` free-text answers.
- Multi-question prompts (answer all, then submit).
- `ExitPlanMode` (show plan text, Approve / keep-planning).

v1 detects these cases and shows the question text + a "Go to Terminal" button so
nothing breaks; it just doesn't answer them remotely yet.

## Changes

| File | Change |
|---|---|
| `src/permissions.js` | Store `questions` on a pending entry. Add `buildAnswerUpdatedInput(toolInput, answers)` (mirrors clawd-on-desk `buildElicitationUpdatedInput`). `resolve(id, { answers })` → settles `{ decision: "allow", updatedInput }`. Expose `questions` (normalized: caps + text clamp) in `list()`, plus an `answerable` flag (true only for single-select, single-question, no-Other). |
| `src/daemon.js` | In `/hook/permission`, when `tool_name === "AskUserQuestion"` pass `questions` into `registry.request`. In the response, add `...(decision.updatedInput ? { updatedInput } : {})` inside `decision`. In `/api/permission`, accept an `answers` payload (POST body JSON) → `resolve(id, { answers })`. |
| `src/mobile.js` | If a pending card has `questions`, render the question header/text + option buttons (single-select → one tap posts the answer). Keep Allow/Deny hidden for questions; show a "Go to Terminal" button. Non-answerable questions show text + "Go to Terminal" only. |
| `desktop/ui/toast.js` + `desktop/src-tauri/src/lib.rs` | Same rendering in the toast. Add a Tauri command `answer_question(id, answers)` that POSTs to `/api/permission`. |
| `test/` | Unit tests for `buildAnswerUpdatedInput` and `resolve(id,{answers})` (single-select happy path; missing answer; caps/clamp). |

## Normalization / guardrails (from clawd-on-desk lessons)

- Max **4 questions**, **5 options** per question.
- Clamp text: header ≤ 48, question ≤ 240, label ≤ 80, description ≤ 160 chars.
- Prevents the phone/toast layout from blowing up on a large prompt.

## Data flow

```
CC AskUserQuestion tool
  → PermissionRequest hook → POST /hook/permission (tool_name, tool_input.questions)
  → registry.request stores questions, marks pending
  → /api/status exposes pending.questions (+ answerable)
  → phone / toast renders option buttons
  → user taps option → POST /api/permission { answers: { "<q>": "<label>" } }
  → registry.resolve(id, { answers }) → { decision:"allow", updatedInput }
  → daemon responds decision.updatedInput → CC continues with chosen answer
```

Timeout / disconnect → existing behavior (`res.destroy()`), CC falls back to
terminal. "Go to Terminal" button = explicit `deny`.

## Testing

- Unit: `buildAnswerUpdatedInput`, `resolve` answer path, normalization caps.
- Manual: inject a fake `AskUserQuestion` payload (extend
  `desktop/scripts/fake-permission.sh`) → confirm option buttons render on phone +
  toast and that tapping returns the right `updatedInput`.
- Manual: capture a **real** AskUserQuestion hook payload
  (`$TMPDIR/clawleash-last-perm.json`) to confirm the `questions`/`answers` shape
  before finalizing the UI submit format.
