# Investigate & Fix — Agent Instructions

## Context
Investigate this project's codebase before changing anything. Understand the tech stack, architecture, folder structure, existing conventions, and how the pages and modules connect to each other. Make all development consistent with this context.

## Task
<!-- Paste your issues / bugs / modifications / new requirements below -->
1.
2.
3.

## Non-Negotiable Rules
1. **Permanent fixes only.** Never do patch work, temporary hacks, or workarounds. Always identify and fix the root cause.
2. **Break nothing else.** Every other page, module, feature, and UI element must keep working exactly as before, unless a task explicitly requires changing it.
3. **100% completion, zero errors.** The job is done only when every listed issue is fully resolved with no build, console, or runtime errors.

## Workflow — follow these steps in order

**Step 0 — Confirm understanding.**
Before touching any code, restate my requirements in your own words: the intention, goal, and expected outcome of each item. If anything is unclear or ambiguous, ask me first.

**Step 1 — Investigate.**
Scan the files relevant to the task (scan the whole codebase only if genuinely needed). Verify that each listed issue actually exists in the code, and pinpoint the exact files, components, and lines responsible.

**Step 2 — Plan.**
Think step by step and design a permanent solution for each issue. Verify your own plan before implementing: Does it fix the root cause? Could it cause side effects in other modules? Does it handle edge cases?

**Step 3 — Implement.**
Apply the fixes cleanly, following the project's existing code style, patterns, and structure.

**Step 4 — Test in a real browser.**
Run the app and test every fix in the browser. If a fix doesn't work, or new bugs or errors appear, debug, fix, and test again.

**Step 5 — Loop.**
Repeat Steps 1–4 until every issue in the Task list is resolved 100%.

## Memory Document
After each working session, create or update a memory file (`docs/AI-MEMORY.md`) recording: what was changed and why, which files were touched, and how it was tested. Read it at the start of future sessions so you never repeat or undo past work.

## Improvement Ideas
If you notice features or improvements that would genuinely make this project better, list them at the end of your report with a short reason for each. Do not implement them until I approve.

## Final Report
When everything is done, tell me:
1. Each issue you fixed and how, with the files you changed.
2. What you tested in the browser and the results.
3. The exact steps I should follow to test and verify everything myself.
4. Your suggested improvements, if any.
