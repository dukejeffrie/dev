import { spawn, type ChildProcess } from "node:child_process";
import type { ExtensionAPI, ExtensionContext, AgentToolResult } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";

/**
 * aws-session.ts
 *
 * `aws_ensure_session` — a single tool that guarantees the AWS CLI login-session
 * is valid before the agent runs AWS commands.
 *
 * Why it exists: the user's AWS CLI uses the `aws login` OAuth credential
 * provider (login_session in ~/.aws/config, cached tokens in ~/.aws/login/cache).
 * Its silent refresh intermittently fails with
 *   CreateOAuth2Token ... invalid, expired, revoked, or malformed / INVALID_REQUEST
 *   Password: ... reading password: inappropriate ioctl for device
 * even though the credentials are fine — and self-heals on retry. The agent
 * spent many turns (and tokens) re-running `aws` / `aws login` to figure that out.
 *
 * This tool hides all of it: one call checks validity, retries the transient
 * flake internally, fires `aws login` + asks the user when a real sign-in is
 * needed, and returns only a terse verdict (no attempt log, no command output,
 * no stderr) so the model isn't flooded with noise.
 */

const TRANSIENT_RE =
  /CreateOAuth2Token|INVALID_REQUEST|inappropriate ioctl for device|invalid, expired, revoked, or malformed|reading password/i;

const HARD_ERROR_RE = /AccessDenied|UnauthorizedOperation|is not authorized|command not found|No such file|not found/i;

const CHECK_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 4; // 1 initial + 3 internal retries
const BACKOFF_MS = [1_000, 2_000, 4_000];
const SIGN_IN_POLL_MS = 180_000; // wait up to 3 min for the user to finish sign-in
const URL_WAIT_MS = 10_000;

type ExecFn = (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

function isTransient(code: number, stderr: string): boolean {
  const s = stderr || "";
  return code === 254 || TRANSIENT_RE.test(s);
}

function isHard(code: number, stderr: string): boolean {
  return HARD_ERROR_RE.test(stderr || "");
}

function identityFrom(stdout: string): string {
  try {
    const j = JSON.parse(stdout) as { Account?: string; Arn?: string };
    const arn = j.Arn ?? "";
    const user = arn.split(":user/")[1] ?? arn.split(":assumed-role/")[1] ?? arn;
    return user + (j.Account ? ` (${j.Account})` : "");
  } catch {
    return stdout.trim().slice(0, 200);
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((res) => {
    if (signal?.aborted) return res();
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true });
  });
}

/** Check `get-caller-identity`, retrying the transient flake internally. */
async function checkSession(
  exec: ExecFn,
  signal: AbortSignal | undefined,
): Promise<{ ok: boolean; attempts: number; identity?: string; lastStderr: string; lastCode?: number }> {
  let lastStderr = "";
  let lastCode = -1;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const r = await exec(["sts", "get-caller-identity", "--output", "json"]);
    if (r.code === 0) return { ok: true, attempts: attempt, identity: identityFrom(r.stdout), lastStderr };
    lastStderr = r.stderr;
    lastCode = r.code;
    if (isHard(r.code, lastStderr) || attempt === MAX_ATTEMPTS || !isTransient(r.code, lastStderr)) {
      return { ok: false, attempts: attempt, lastStderr, lastCode };
    }
    await delay(BACKOFF_MS[attempt - 1] ?? 2_000, signal);
  }
  return { ok: false, attempts: MAX_ATTEMPTS, lastStderr, lastCode };
}

/** Run `aws login` in the background (it opens the browser / prints a URL). */
function startSignIn(): { child: ChildProcess; urlPromise: Promise<string> } {
  const child = spawn("aws", ["login"], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  child.unref();
  let out = "";
  let resolveUrl: (u: string) => void = () => {};
  const urlPromise = new Promise<string>((res) => { resolveUrl = res; });

  const maybeEmit = () => {
    const m = out.match(/https:\/\/[^\s"]+/);
    if (m) resolveUrl(m[0]);
  };
  child.stdout?.on("data", (d) => { out += d; maybeEmit(); });
  child.stderr?.on("data", (d) => { out += d; maybeEmit(); });
  child.on("error", () => resolveUrl(""));

  // If the URL never shows, give up after a short wait rather than blocking.
  setTimeout(() => resolveUrl(urlMatchOf(out)), URL_WAIT_MS);
  return { child, urlPromise };
}

function urlMatchOf(out: string): string {
  return out.match(/https:\/\/[^\s"]+/)?.[0] ?? "";
}

function killChild(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  try { child.kill("SIGTERM"); } catch { /* already gone */ }
}

async function waitForSignIn(
  exec: ExecFn,
  signal: AbortSignal | undefined,
  pollMs: number,
): Promise<{ ok: boolean; identity?: string }> {
  const start = Date.now();
  while (Date.now() - start < pollMs) {
    if (signal?.aborted) return { ok: false };
    const r = await exec(["sts", "get-caller-identity", "--output", "json"]);
    if (r.code === 0) return { ok: true, identity: identityFrom(r.stdout) };
    await delay(2_000, signal);
  }
  return { ok: false };
}

interface Details {
  verdict: "ok" | "needs-auth" | "needs-attention";
  identity?: string;
  attemptCount: number;
  stagedSignIn: boolean;
  signInUrl: string;
}

function okResult(identity: string | undefined, attempts: number, stagedSignIn: boolean): AgentToolResult<Details> {
  return {
    content: [{ type: "text", text: `OK — valid AWS session${identity ? ` for ${identity}` : ""}` }],
    details: { verdict: "ok", identity, attemptCount: attempts, stagedSignIn, signInUrl: "" },
  };
}

function needsAuthResult(attempts: number, url: string, stagedSignIn: boolean): AgentToolResult<Details> {
  const text = url
    ? `Needs authentication — complete AWS sign-in:\n${url}`
    : "Needs authentication — a browser prompt should have opened. Complete sign-in, then call aws_ensure_session again.";
  return {
    content: [{ type: "text", text }],
    details: { verdict: "needs-auth", attemptCount: attempts, stagedSignIn, signInUrl: url },
  };
}

function needsAttentionResult(message: string, attempts: number): AgentToolResult<Details> {
  return {
    content: [{ type: "text", text: `Needs attention — ${message}` }],
    details: { verdict: "needs-attention", attemptCount: attempts, stagedSignIn: false, signInUrl: "" },
  };
}

export default function (pi: ExtensionAPI): void {
  // Dedup concurrent calls: two parallel aws_ensure_session calls would both
  // poke the same login cache and could race its refresh (a root-cause theory
  // for the flake). Coalesce into one in-flight run.
  let inflight: Promise<AgentToolResult<Details>> | null = null;

  pi.registerTool({
    name: "aws_ensure_session",
    label: "AWS Session",
    description:
      "Ensure the AWS CLI login session is valid before running AWS commands. Checks `aws sts get-caller-identity`, " +
      "silently retries transient AWS login-session refresh flakes (CreateOAuth2Token / INVALID_REQUEST / " +
      "'inappropriate ioctl for device'), and if a real sign-in is needed, fires `aws login` and asks the user " +
      "to complete it, waiting until the session is valid (up to 3 min). Returns a terse verdict only.",
    promptSnippet: "Validate/refresh the AWS CLI login session; retries transient flakes and prompts the user to sign in if needed.",
    promptGuidelines: [
      "Use aws_ensure_session when an `aws` CLI command fails with a session/credential error (CreateOAuth2Token, INVALID_REQUEST, 'inappropriate ioctl for device', expired/invalid grant) — it retries internally and won't leak output.",
      "Call aws_ensure_session instead of re-running `aws` or `aws login` repeatedly; one call handles retries and, if needed, asks the user to sign in.",
    ],
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, signal, onUpdate, ctx) {
      if (inflight) return inflight;
      inflight = run(pi, ctx, signal, onUpdate).finally(() => { inflight = null; });
      return inflight;
    },

    renderCall(_args, theme: any) {
      return new Text(theme.fg("toolTitle", theme.bold("aws_ensure_session")), 0, 0);
    },
    renderResult(result: AgentToolResult<Details>, { expanded }: any, theme: any) {
      const d = (result as any).details as Details | undefined;
      const status = d?.verdict === "ok"
        ? theme.fg("success", "OK")
        : d?.verdict === "needs-attention"
          ? theme.fg("error", "Needs attention")
          : theme.fg("warning", "Needs authentication");
      let text = status;
      if (!expanded) text += ` · ${d?.attemptCount ?? 1} attempt(s)`;
      if (expanded && d?.verdict === "needs-auth" && d.signInUrl) text += "\n" + theme.fg("dim", d.signInUrl);
      return new Text(text, 0, 0);
    },
  });

  async function run(
    pi: ExtensionAPI,
    ctx: ExtensionContext,
    signal: AbortSignal | undefined,
    onUpdate: ((u: { content: { type: string; text: string }[] }) => void) | undefined,
  ): Promise<AgentToolResult<Details>> {
    const exec: ExecFn = (args) =>
      pi.exec("aws", args, { cwd: ctx.cwd, signal, timeout: CHECK_TIMEOUT_MS })
        .then((r) => ({ code: r.code, stdout: r.stdout, stderr: r.stderr }));

    // 1) quick validity check + internal retry of the transient flake
    const check = await checkSession(exec, signal);
    if (check.ok) return okResult(check.identity, check.attempts, false);

    // 2) not valid after retries → really needs sign-in (or a hard problem)
    if (isHard(check.lastCode ?? -1, check.lastStderr)) {
      const msg = (check.lastStderr || "AWS command failed").trim().split("\n")[0].slice(0, 200);
      return needsAttentionResult(msg, check.attempts);
    }

    // 3) fire `aws login`, ask the user, poll until valid
    if (signal?.aborted) return needsAttentionResult("aborted before sign-in", check.attempts);
    const { child, urlPromise } = startSignIn();
    onUpdate?.({ content: [{ type: "text", text: "Waiting for sign-in…" }] });
    const signInUrl = await urlPromise;

    if (ctx.hasUI && signInUrl) {
      ctx.ui.notify(
        "AWS sign-in required — complete it in your browser, then I'll re-check automatically.",
        "warning",
      );
    }

    try {
      const waited = await waitForSignIn(exec, signal, SIGN_IN_POLL_MS);
      if (waited.ok) return okResult(waited.identity, check.attempts + 1, true);
      if (signal?.aborted) return needsAttentionResult("aborted while waiting for sign-in", check.attempts);
      return needsAuthResult(check.attempts, signInUrl, true);
    } finally {
      killChild(child);
    }
  }
}
