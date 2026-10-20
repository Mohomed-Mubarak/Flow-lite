import { guard } from '@/lib/api';

export const dynamic = 'force-dynamic';

// A small floating chat bubble that opens an iframe of the public chat page.
// Embed with: <script src="https://YOUR-APP/api/chat/<path>/widget.js" async></script>
function widgetJs(chatUrl: string): string {
  return `(function(){
  if (window.__flowliteWidget) return;
  window.__flowliteWidget = true;
  var d = document;
  function ready(fn){ if (d.body) fn(); else d.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    var open = false;
    var btn = d.createElement('button');
    btn.setAttribute('aria-label', 'Open chat');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
    btn.style.cssText = 'position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;background:#5b5bf0;border:none;box-shadow:0 6px 20px rgba(0,0,0,.28);cursor:pointer;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:0;';
    var frame = d.createElement('iframe');
    frame.src = ${JSON.stringify(chatUrl)};
    frame.title = 'Chat';
    frame.style.cssText = 'position:fixed;right:20px;bottom:88px;width:380px;height:600px;max-width:calc(100vw - 32px);max-height:calc(100vh - 120px);border:0;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.3);z-index:2147483000;display:none;background:#fff;color-scheme:light;';
    function toggle() {
      open = !open;
      frame.style.display = open ? 'block' : 'none';
      btn.setAttribute('aria-expanded', String(open));
      btn.innerHTML = open
        ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"></path><path d="M6 6l12 12"></path></svg>'
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
    }
    btn.addEventListener('click', toggle);
    d.body.appendChild(frame);
    d.body.appendChild(btn);
  });
})();`;
}

async function _GET(req: Request, ctx: { params: Promise<{ path: string }> }) {
  const { path } = await ctx.params;
  const origin = new URL(req.url).origin;
  const chatUrl = `${origin}/chat/${encodeURIComponent(path)}`;
  return new Response(widgetJs(chatUrl), {
    headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' },
  });
}

export const GET = guard(_GET);
