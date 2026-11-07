// Private bridge for the live harness: reads one verification token for a
// freshly generated recipient from the production fallback mail sink over the
// operator's authorized SSH alias. The caller keeps the result in memory and
// never logs it. Any failure answers {ok: false}; nothing else is reported.
import { execFile } from "node:child_process";

export type EmailProof = { ok: true; token: string } | { ok: false };
export type ProofRunner = (
  command: string,
  args: string[],
  options: { input: string; env: NodeJS.ProcessEnv; timeout: number },
) => Promise<{ code: number; stdout: string }>;

// Runs inside the API container with Node; reads only the fallback sink.
const REMOTE_SCRIPT = String.raw`
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
const email=process.env.TAFF_RECIPIENT,after=Number(process.env.TAFF_REQUEST_AFTER);
let token;
try {
 const path=process.env.EMAIL_LOG_PATH||'/app/.taff-mail/messages.jsonl';
 for(let attempt=0;attempt<10&&!token;attempt++) {
  const info=await stat(path);if(!info.isFile()||info.size>10*1024*1024)throw 0;
  const reader=createInterface({input:createReadStream(path),crlfDelay:Infinity});
  for await(const line of reader){
   let value;try{value=JSON.parse(line)}catch{continue}
   if(value.to!==email||Date.parse(value.createdAt)<after-1000)continue;
   const text=String(value.text||'');
   const match=text.split('\n').find(x=>x.includes('#verifyEmail='));
   if(match){const url=new URL(match.trim());if(url.origin==='https://taff.apuch.cn')token=new URLSearchParams(url.hash.slice(1)).get('verifyEmail');}
  }
  if(!token)await new Promise(resolve=>setTimeout(resolve,500));
 }
}catch{}
process.stdout.write(JSON.stringify(token?{ok:true,token}:{ok:false}));
`;

/** POSIX shell quoting, as Python's shlex.quote. */
export function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", `'"'"'`)}'`;
}

const runProcess: ProofRunner = (command, args, options) =>
  new Promise((resolve) => {
    const child = execFile(
      command,
      args,
      {
        env: options.env,
        timeout: options.timeout,
        maxBuffer: 8192,
        encoding: "utf8",
      },
      (error, stdout) =>
        resolve({
          code: error ? Number(error.code ?? 1) || 1 : 0,
          stdout: String(stdout),
        }),
    );
    child.stdin?.end(options.input);
  });

export async function readEmailProof(
  email: string,
  after: string,
  env: NodeJS.ProcessEnv,
  run: ProofRunner = runProcess,
  now: () => number = Date.now,
): Promise<EmailProof> {
  try {
    const target = env.TAFF_VERIFY_SSH_TARGET ?? "";
    const api = env.TAFF_VERIFY_API_ID ?? "";
    const age = now() - Number(after);
    if (
      !/^taff-v020-verify-[0-9a-f]{12}@example\.test$/.test(email) ||
      !/^\d+$/.test(after) ||
      age < 0 ||
      age > 180_000 ||
      !/^[A-Za-z0-9_.@-]+$/.test(target) ||
      !/^[0-9a-f]{12,64}$/.test(api)
    )
      return { ok: false };
    const remote = [
      "sudo",
      "-n",
      "docker",
      "exec",
      "-i",
      "-e",
      `TAFF_RECIPIENT=${email}`,
      "-e",
      `TAFF_REQUEST_AFTER=${after}`,
      api,
      "node",
      "--input-type=module",
    ]
      .map(shellQuote)
      .join(" ");
    const result = await run(
      "ssh",
      ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", target, remote],
      { input: REMOTE_SCRIPT, env, timeout: 25_000 },
    );
    if (result.code !== 0) return { ok: false };
    const parsed = JSON.parse(result.stdout) as {
      ok?: unknown;
      token?: unknown;
    };
    return parsed.ok && typeof parsed.token === "string"
      ? { ok: true, token: parsed.token }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}
