# dev
Development tools to share with the world.

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

The