import en from "../../locales/en/common.json";
import zhCN from "../../locales/zh-CN/common.json";
import zhHK from "../../locales/zh-HK/common.json";

export const dynamic = "force-static";
export function GET() {
  const messages = JSON.stringify({
    en: en.pwa,
    "zh-CN": zhCN.pwa,
    "zh-HK": zhHK.pwa,
  }).replaceAll("<", String.fromCharCode(92) + "u003c");
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Taff</title><style>body{margin:0;background:#fff;color:#0a1626;font:16px/1.6 system-ui,sans-serif}main{max-width:32rem;padding:10vh 24px;margin:auto}img{width:64px;height:64px}h1{font-size:28px;line-height:1.2}p{color:#3c4759}a{color:inherit}a:focus-visible{outline:2px solid #a88b52;outline-offset:6px}@media(prefers-color-scheme:dark){body{background:#0a1626;color:#fff}p{color:#d7e3fa}}</style><main><img src="/icons/taff-192.png" alt=""><h1 id="title"></h1><p id="hint"></p><a id="retry" href="/"></a></main><script>const messages=${messages};let key;try{const saved=localStorage.getItem('taff-locale');if(['en','zh-CN','zh-HK'].includes(saved))key=saved}catch{}if(!key){const lang=(navigator.languages||[navigator.language]).find(x=>/^(en|zh)/i.test(x));key=lang&&/^zh/i.test(lang)?(/zh.*(?:HK|TW|MO|Hant)/i.test(lang)?'zh-HK':'zh-CN'):'en'}const t=messages[key];document.documentElement.lang=key;document.getElementById('title').textContent=t.offlineTitle;document.getElementById('hint').textContent=t.offlineHint;document.getElementById('retry').textContent=t.reconnect;</script></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
        "Content-Security-Policy":
          "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      },
    },
  );
}
