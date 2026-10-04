---
name: dev
description: Start a DTS-OS development task (bugs, changes, new requirements) under the owner's standing workflow in CLAUDE.md §30 — confirm understanding, investigate, plan, implement, verify in a real browser, update CLAUDE.md, report.
argument-hint: <numbered list of issues / changes / new requirements>
disable-model-invocation: true
---

# Development task

## Task (from the owner)

$ARGUMENTS

If the task above is empty, ask the owner for the list of issues / changes before doing anything else.

## How to do it

Follow **CLAUDE.md §30 Change Protocol** and **§29 Rules** exactly. They are already loaded, because CLAUDE.md
is part of every session. This command only puts the task in front of them. The steps, in short:

**Non-negotiable:** fix the root cause permanently (no patches, hacks or workarounds) · break nothing else ·
done means every item is 100% resolved, with no build, console or runtime errors.

0. **Confirm understanding:** restate each item (intention, goal, expected outcome). Ask first if anything is unclear.
1. **Read context:** HANDOFF.md if it exists (the session-start hook prints it), then the module file for each affected module (`.claude/rules/*.md`, see the Context map at the top of CLAUDE.md). Read the file if it has not loaded by itself.
2. **Investigate:** confirm each issue exists in the code; pin down the exact files and lines. Correct the context where it is outdated.
3. **Plan, then check the plan:** does it fix the root cause? Could it affect other modules? What edge cases does it need to handle?
4. **Implement** in the project's existing style (§28).
5. **Verify:** run the unit tests, and run every UI fix in a real browser through the throwaway harness (§28). Debug, fix and test again until it passes.
6. **Check for regressions:** `npm run build`, `npx vitest run`, `npx tsc -p tsconfig.check.json --noEmit`.
7. **Loop** steps 2–6 until every item is done.
8. **Update the context:** the module file (its sections, §24 rules, §25/§27 bullets), §32 in CLAUDE.md if the state changed, and a dated entry at the top of `docs/DEVELOPMENT-HISTORY.md`. Never write to `docs/AI-MEMORY.md`.
9. **Report** in the §30 format. List suggested improvements with a reason for each, and implement none without approval. End with the §34 line: start a new chat, or continue in this one.
