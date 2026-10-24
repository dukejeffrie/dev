---
name: refactor-after-green
description: Use this skill whenever implementing a new behavior, fixing a bug, or making any code change that involves writing or modifying tests. Encodes a code-first, small-batch loop where refactoring happens after every green, using a named menu of small structural moves. Apply this instead of writing all the code first, or writing all the tests first, or deferring cleanup to the end.
---

# Refactor-After-Green

## Why this exists

Controlled experiments comparing agent coding workflows (Finster, 2026 —
see `agentic-dev-team` experiment reports) found that for a coding agent,
test-first ordering by itself contributes nothing measurable to code
quality. What *does* move the numbers is refactoring after every green,
combined with small batch size. Splitting the work across a separate
coder/tester agent cost up to 3x more with no quality gain. This skill
encodes the workflow that won on quality-per-dollar: one agent, one
behavior at a time, refactor every time the suite is green.

Do not skip the refactor step to save time. That step is the mechanism,
not the ceremony.

## The loop

For each unit of work, repeat this cycle for **one behavior at a time**:

1. **Pick the smallest next behavior.** Not "the endpoint" — one
   decision the endpoint has to make (one validation rule, one branch,
   one field). If you can't describe it in one sentence, it's too big;
   split it.
2. **Write the code for that one behavior.**
3. **Write its test.** Confirm it passes along with the full existing
   suite. If anything is red, fix it before moving on — do not stack a
   second behavior on top of a red suite.
4. **Refactor.** With the suite green, look at the code you just
   touched (and only that code) through the lens of the move menu
   below. Apply what's clearly warranted. Re-run the suite after every
   individual move, not just at the end of the refactor step.
5. **Stop and commit** (or otherwise checkpoint) before starting the
   next behavior. This is the batch boundary — keep it small enough
   that a revert costs you minutes, not hours.

Test-first vs. code-first ordering is a preference, not a requirement —
pick whichever the team wants, but never skip step 4.

## Hard invariants

- **Never let a refactor step change what a test asserts.** If a test
  needs to change, that's a new behavior decision, not a refactor —
  go back to step 1 and treat it as its own cycle. This held with zero
  violations across the source experiments and is the one rule not to
  bend.
- **One behavior per cycle.** If you notice yourself writing code for
  two behaviors before the first test, stop and split the batch.
- **Don't defer refactoring "until the feature is done."** Every arm in
  the source experiments that deferred cleanup to one final pass landed
  in the worst-performing cluster on changeability.
- **Coverage and mutation score are not refactor-quality signals.**
  High coverage or a high mutation score can coexist with code that's
  expensive to change later. Don't use either as a reason to skip or
  shortcut the refactor step, and don't chase them as a goal.

## Refactor move menu

Small, named, reversible moves — pick from this list rather than
open-endedly "cleaning up." Apply the smallest move that removes the
smell you actually see; don't reach for a bigger one speculatively.

**Naming & readability**
- Rename variable / function / class to say what it does now, not what
  it did when it was written
- Extract variable — name an expression that's doing too much inline
- Replace magic literal with a named constant

**Structure**
- Extract function — pull a chunk that has its own name-worthy purpose
- Inline function / variable — when the indirection no longer earns
  its keep
- Guard clause — replace nested conditionals with early returns
- Consolidate duplicate conditional fragments
- Replace conditional with polymorphism — only once you have >=2 real
  variants, not preemptively

**Data & interfaces**
- Introduce parameter object — when a function's argument list is
  growing with each new behavior
- Encapsulate variable — stop letting shared state be reached into
  directly
- Split responsibility — if the file/class you're touching now serves
  two unrelated reasons to change, separate them (don't do this
  mid-cycle unless the current behavior forces it)

**Tests**
- Extract test helper / builder — when three tests build the same
  fixture by hand
- Rename test to describe the behavior, not the implementation detail

If nothing on this list applies, that's a valid outcome of step 4 — not
every green needs a change, but every green deserves the look.

## Batch-size check

Before writing code, ask: *could this be smaller?* Signs a batch is too
big:
- You're touching more than ~1 file class/module to make the first test
  pass
- You can't name the behavior in one sentence without "and"
- You're tempted to write two tests before running the suite once

## When to reach for heavier process

This loop is the default for small-to-medium, well-specified changes.
For large multi-file work, or when requirements are genuinely unclear,
escalate — but escalate the *specification* step, not the refactor
step: an ambiguous spec produces bad results under any workflow,
including this one. Get a clear decision on the ambiguous point before
writing code, rather than letting the agent (or yourself) silently
default to a happy-path assumption.
