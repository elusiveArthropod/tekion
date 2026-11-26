---
name: odyssey
description: ODYSSEY, the Think → Plan → Build loop. Use whenever the user says "/odyssey", "start an odyssey", "new problem", "new project", "let's build X" with no design yet, or wants to discuss an idea before building it. It runs six gated phases (Problem Discovery, Idea Exploration, Solution Design, Implementation, Testing, Closure), keeps a living state file so decisions are never re-argued, and asks the required details up front instead of guessing. Do NOT use for a one-off task with a known answer, a quick fix in existing code, or a status update; use it when the problem itself still needs understanding.
---

# ODYSSEY: Think → Plan → Build

A structured, collaborative way to take a problem from "we have a pain" to "it works and it is documented". The user brings domain knowledge and ideas; Claude brings structure, technical judgment and the discipline to not rush. It was distilled from the Sentinel alert-monitoring build (see `references/lessons.md`), where the discussion-first approach found the real failure modes before a line was built.

## The one rule

**Never move to the next phase without the user's explicit go.** Each phase ends with a short gate message: what was decided, what is still open, and the question "Move to <next phase>?". The user says go, or sends more input, and the loop continues. Skipping a gate is the failure mode this skill exists to prevent.

## State file: the memory of the odyssey

On the first invocation for a project, create `odyssey/<project-slug>/STATE.md` in the repository (ask for the slug if unclear) from `references/state-template.md`. It holds, in fixed sections: Problem, Goal and success criteria, Constraints, **Decisions (numbered, dated, with the reason)**, **Open questions (numbered)**, Proposed ideas not yet decided, Case catalog or scenario list, Solution design (flow, components, data), Build log (step, what was built, verified how, ids), Known gaps, Assets and credentials pointers (never secret values), Resume notes.

Rules for the state file:
- Update it at every gate and after every build step. Commit it with the code.
- Read it first whenever the skill is invoked on an existing project, then say in two lines where things stand and what the next action is. Do not re-ask what it already answers.
- Keep the three categories visibly separate: **proposed** (someone suggested it), **decided** (both agreed, numbered), **open** (needs an answer, named owner). Moving an item between categories is itself a line in the log.
- If the user contradicts a decision, say which decision number it changes and why, then record the new one. Do not silently drift.

When a shared spreadsheet or doc already exists for the project, the state file points at it and summarises; the detailed tables (case catalog, decisions, assets) can live there. The file is still the index.

## Phase 1: Problem Discovery

Goal: understand the actual problem, not the first solution idea.

1. Let the user describe the problem, the background, why it hurts now, and what "solved" looks like.
2. Before asking anything, **look at the evidence yourself** if it is reachable: the channel, the dashboard, the data, the existing automation, the repo. Ten minutes of reading real data beats ten questions. In Sentinel, reading the alert channel showed that nobody replied to any alert, that alerts carried no error text, and that failures came in clusters; none of that was in the brief.
3. Then ask the discovery questions from `references/intake.md` that the evidence did not answer. Ask them in one message, grouped, numbered, each with why it matters. Mark which ones block the design and which can wait.
4. Write down constraints, dependencies, assumptions and what is explicitly out of scope.
5. Gate: restate the problem in your own words, the goal, success criteria, scope, and the open questions. "Did I understand it right? Move to idea exploration?"

## Phase 2: Idea Exploration and Discussion

Goal: get every scenario and every bad idea on the table before designing.

1. Let the user share their ideas and approaches first. Record them as **proposed**.
2. Challenge them where they deserve it: name the failure mode, give the concrete example, propose the alternative. Agreeing by default is a disservice; so is contrarianism. "Yes, and here is the case it breaks on" is the usual shape.
3. Build the **case catalog**: every scenario the solution must handle, grouped by type, with how it is detected, what happens, who is involved. A spreadsheet with a status column (Proposed / Agreed / Needs discussion / Dropped) works well because the user's team can review it without the chat. Add the cases nobody mentioned: monitoring the monitor, the empty state, the storm, the thing that silently never runs, the human who never answers.
4. Discuss challenges, edge cases and limitations now. For each: handle it, defer it (say to which version), or accept it (say why).
5. Record every answer as a decision with its number. Keep asking follow-ups until the catalog stops growing.
6. Gate: "N cases agreed, M dropped, K open. Move to solution design?"

## Phase 3: Solution Design and Finalization

Goal: a design the user can explain to someone else before anything is built.

1. Propose the structure: the end-to-end flow, the components and what each owns, the data model (one object per concept, do not fold things together to look simple), the integrations, the schedulers and triggers, and the human touchpoints.
2. Draw it. Two levels: a **simple flow** for someone with no context (the five-question style: real or noise? new or known? who owns it? how bad? action), and a **detailed flow** for the build (components, reads/writes, state machine, data model). Produce editable files (draw.io), render them, and look at the render yourself before sending; fix overlaps and crossing lines.
3. Walk the user through it. Incorporate suggestions; iterate until they say they understand the whole flow. Capture each change as a decision.
4. Define the build order: smallest slice that proves the plumbing first, then the next, each with a verification step. Name the credentials, connections, channels and access each slice needs so the user can create them before the build starts.
5. Gate: "Design agreed. Here is the step list and what I need from you for step 1. Start building?"

## Phase 4: Implementation

Goal: working slices, each verified, with the reasoning visible.

1. Build **one slice at a time**. Finish it, verify it against real data or a real event, show the evidence (ids, records, timings), then move on.
2. Explain the technical decisions that matter and the trade-offs you took. Record platform gotchas as you hit them in the state file (or a CONFIG/notes file) so the next slice does not rediscover them.
3. When something fails: show the error, find the root cause, fix it, re-verify. Do not paper over with retries or silent fallbacks. If a workaround is unavoidable, say so and log it as a known gap.
4. Prefer deterministic code for anything that can be deterministic; reserve the LLM for interpretation and conversation. Design so that the LLM component can be down without losing data.
5. Watch the system's own health: if the thing you build can fail, it must be observable, and its own failures must not loop back into it. Audit your own components' run history before calling a step done.
6. Keep everything in the repo: code, definitions, instructions, config notes, diagrams. Commit per slice.
7. Gate per slice: "Step N built and verified (evidence). Next is step N+1 which needs X. Continue?"

## Phase 5: Testing and Refinement

Goal: it does what Phase 1 said success looks like.

1. Test against the original success criteria and the case catalog, not only against the happy path. Walk the catalog: which cases are covered, which are deferred, which are untested.
2. Run end-to-end with real inputs where safe. Use a shadow mode (decide but do not act) when the output reaches people.
3. Measure the thing that would embarrass you: false "ignore" decisions, missed events, load on the platform, volume growth.
4. Fix, re-verify, update the catalog statuses and the known gaps.
5. Gate: "Verified cases: … Open gaps: … Ready to close?"

## Phase 6: Closure and Documentation

Goal: someone else, or future you, can run, change and resume this.

1. Summarise what was built and how it works, in the user's language, with the flow diagram.
2. Document finalized flow, decisions with reasons, configurations, ids, connections, credentials pointers (never values), thresholds and where they live, how to pause and resume, and the runbook for the common operations.
3. List known limitations and pending improvements, each with a one-line reason it was deferred.
4. Produce the **assets list**: every created thing with id, kind, purpose, state. Put it where the team looks (the shared sheet), not only in the repo.
5. Update the state file's Resume notes: where to pick up, what to check first, what is paused.

## Working principles (apply in every phase)

- Do not rush into implementation before understanding the problem. If the user asks to build in Phase 1, say what you still need to know and why it changes the build, then ask.
- Do not assume requirements; ask when clarity is missing. Batch the questions.
- Do not blindly agree. Challenge constructively, with the concrete case.
- Prefer discussion and iteration over one-shot solutions, but once a decision is numbered, stop re-opening it unless new evidence appears.
- Keep proposed / decided / open visibly separate, always.
- Be proactive about problems before they appear: volume, loops, missing data, auth expiry, the component watching itself, what happens when nobody answers.
- Report faithfully. Failed is failed; unverified is unverified; a workaround is a workaround.
- Security hygiene: never paste or store secrets in chat, files or sheets; point at where the secret lives. If the user pastes one, say so and ask them to rotate it.
- The user contributes domain knowledge and ideas; Claude contributes structure, technical expertise and problem-solving. Say when a question is theirs to answer and when it is yours.

## Invocation

- `/odyssey` with a new problem: create the state file, start Phase 1.
- `/odyssey` on an existing project (state file present or named): read it, report status in two lines, continue from the recorded phase.
- `/odyssey status`: summarise decisions, open questions and next action from the state file.
- `/odyssey close`: run Phase 6 for the current project.

References: `references/intake.md` (discovery questions by problem type), `references/state-template.md` (the state file skeleton), `references/lessons.md` (what the Sentinel odyssey taught, including UnifyApps platform gotchas).
