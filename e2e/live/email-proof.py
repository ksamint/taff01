#!/usr/bin/env python3
"""Private bridge: caller MUST capture stdout in process memory; never log it."""
import json,os,re,shlex,subprocess,sys,time
try:
 email,after=sys.argv[1:3]
 assert re.fullmatch(r'taff-v020-verify-[0-9a-f]{12}@example\.test',email)
 assert after.isdigit() and 0<=time.time()*1000-int(after)<=180000
 target=os.environ['TAFF_VERIFY_SSH_TARGET'];api=os.environ['TAFF_VERIFY_API_ID']
 assert re.fullmatch(r'[A-Za-z0-9_.@-]+',target) and re.fullmatch(r'[0-9a-f]{12,64}',api)
 remote=['sudo','-n','docker','exec','-i','-e','TAFF_RECIPIENT='+email,'-e','TAFF_REQUEST_AFTER='+after,api,'node','--input-type=module']
 script=r'''
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
'''
 result=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10',target,shlex.join(remote)],input=script.encode(),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=25)
 assert result.returncode==0
 parsed=json.loads(result.stdout)
 assert parsed.get('ok') and isinstance(parsed.get('token'),str)
 sys.stdout.write(json.dumps({'ok':True,'token':parsed['token']}))
except Exception:
 sys.stdout.write('{"ok":false}')
 sys.exit(1)
