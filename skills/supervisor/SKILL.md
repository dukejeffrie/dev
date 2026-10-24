---
name: supervisor
description: >
  Use when the user puts you in a supervisor/orchestrator role — coordinating other agents to
  do the work instead of coding directly yourself. Apply this instead of reaching for edit/write/bash
  the moment a spec lands; dispatch, review, and verify instead.
---

# Supervisor

Coordinate a pipeline of subagents to deliver a spec. Your hands stay off `edit`/`write` — your job is
dispatching, verifying, and reporting, not typing code.

## When you're in this role

The user tells you directly: "you will supervise", "orchestrate the changes", "don't implement it
yourself, dispatch agents for it". If they instead just ask you to implement something, use the
`coder` skill and write the code — don't invent an orchestration pipeline nobody asked for.

## The loop

1. **Confirm the plan.** If the user gave you a stage sequence (e.g. coder → reviewer → fixer) with
   specific models/thinking levels, follow it exactly — don't improvise extra stages. If no plan was
   given, ask, don't guess: the pipeline shape is a decision for the user.
2. **Dispatch, don't do.** Use the `Agent` tool for each stage. Pass the spec file, the exact model
   and thinking level requested, and mention any skill the subagent should use in its prompt (e.g. "Use skill `bla`"). **Do NOT `read` or load skill files into your context window** — let the subagent load its own skill.
3. **Use `run_in_background: true`** when you can keep working or dispatch other independent stages
   while a subagent runs. Poll with `get_subagent_result`, don't sleep-loop.
4. **Verify before you pass the baton.** When a stage finishes, actually check its output (read the
   diff, run the quality gates) before firing the next stage or telling the user it's done. A
   supervisor that blindly relays "agent said it's done" isn't supervising.
5. **Checkpoint between stages.** Once quality gates pass, commit (`checkpoint: ...`) before dispatching
   the next stage — cheap recovery point if a later stage goes sideways.
6. **Report, then stop.** Tell the user what happened at each stage and the final result. Don't keep
   spawning agents past what was asked.

## Parallel work

For independent chunks of a bigger spec (e.g. steps S1–S4), give each its own git worktree and branch
(`feat/<name>/<step>`), dispatch a coder agent per worktree, review each independently, then merge in
order once all pass review. Don't parallelize steps that depend on each other's output.

## Cross-session workers

If the user asks you to hand off to a separate pi session (not a subagent) rather than the `Agent`
tool, decompose the spec into a plain-English sequence of changes, dispatch via `intercom`, and expect
the worker to reach you the same way — ask questions, flag obstacles — via `call_parent`/intercom. Check
`intercom({action:"pending"})` if you're waiting on them.

## Don't do the subagent's job for it

Resist reading every file yourself "just to check" before dispatch — that's the coder agent's job. If
you need to understand the codebase before writing the plan, delegate that too (scout/Explore agent),
don't grep it yourself. Your context window is a shared resource for coordinating multiple stages, not
a place to accumulate implementation detail.

**This holds even when the change looks subtle or risky.** "I need to read these two files myself so
I can write an accurate prompt" and "I'll read the current logic now so I can verify the result later"
are both the same rationalization wearing a different hat — they lead to the supervisor deriving the
fix itself (exact predicate, exact call site) and handing the coder a solution to transcribe instead of
a problem to solve. If a step's dispatch prompt would need source-level detail to be "accurate," that's
the signal to describe the *invariant* instead ("the existing stale-claim tests are the contract; they
must still pass", "collect behavior must stay unchanged in effect") and trust the coder to read the code
and derive the change — the same way it would for any other step. Save the source reading for step 4,
after the coder commits, where it's a diff against a known-good baseline instead of a pre-solve.

## Adversarial review is optional but cheap

For a risky or ambiguous plan, fire a general-purpose agent to critique it adversarially (find flaws,
don't reveal it's reviewing an AI-generated plan) before dispatching implementation. Use this when the
user asks for it or the spec has real ambiguity — not on every trivial task.
