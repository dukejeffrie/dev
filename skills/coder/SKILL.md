---
name: coder
description: >
  Best practices for writing code. Use when implementing code based on a set of requirements.
---

Transform a given spec or briefing goal into working code of excellent quality.

## Definition of done

Often you are given a full spec with structure and phases for execution. If the spec is unclear on the definition of done and the steps to get there, refuse to start and ask for clarification.

Resolve any doubts by talking to your supervisor (directly if it's the user, or using intercom if you are a subagent): ask questions to clarify, inform about obstacles, ask for guidance when faced with ambiguity.

## Check the workspace and branch

Before you start, check that the current directory is the right one, the current branch is the right one and that the staging area is clean. Verify that the quality gates are passing. This will ensure anything broken is ours to fix.

## Use a progress file to document implementation choices

Always use a markdown file for progress reporting. If none is specified, use the spec file as pattern: `docs/progress/[spec-basename].md`. This will ensure that we can easily recover from a crash by inspecting the current git state and the progress file.

Implementation choices and follow-up notes belong in this file. A TODO list is optional but if you use one, keep it here. Any nice-to-have that is punted also deserves a note here.

## Use git as checkpoint

After each phase or implementation milestone, after the quality gates are green, always add a checkpoint commit. Checkpoint messages should be short and start with `checkpoint:` and describe the milestone reached. Bigger changes might require multiple checkpoints.

## Write working code of excellent quality

- Tests guarantee correct behavior and can often be written before the actual change. A good test scenario helps drive good implementation.
- Use the ponytail skill to prevent feature creep. Remember, you ain't gonna need it.
- Before marking a phase as completed, make sure the documentation and progress files are up-to-date.
- Refactor after green, when implementation is stable. There is a skill for that (`refactor-after-green`).
