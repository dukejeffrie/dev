
Development tools to share with the world.

# Skills

I use the skills below on my day-to-day work. Most of them are inspired by skills from other people.

- coder: writes code. Assumes your project has coding standards reachable via AGENTS.md, and that you like the worker to write progress files.
- refactor-after-green: incentivizes the agent to refactor every time they get to green.
- supervisor: tells the agent to avoid doing and focus on orchestration.

# Subagents

I have used them with[@tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) but should be easy to adapt.

### Explore

To replace the native explore in many of the tools. It pins down a cheap and fast model and resolves some anti-patterns when using `rg` instead of `grep`.

### Coder

A subagent with auto-loaded `coder`and `refactor-after-green`skill. To use in supervisor/worker ensembles.

# Pi extensions

These are some extensions for [pi.dev](https://pi.dev).
 They are located in `./pi/agent/extensions`.
### aws-ensure-session

A tool that the agent can call instead of `aws login` that automatically loops, ensures the token is refreshed,and minimizes token use. The instructions I added to my `AGENTS.md` are as follows:

```markdown
- **AWS sessions:** Use the `aws_ensure_session` tool to guarantee the AWS CLI login-session is valid
  before running `aws` commands, and whenever an `aws` command fails with a session/credential error.
  It returns a terse verdict hiding the complexity — `OK`, `Needs authentication`, or `Needs attention`.
  Don't re-run `aws`/`aws login` repeatedly to diagnose aws side errors; call the tool once and act
  on its verdict.
```
