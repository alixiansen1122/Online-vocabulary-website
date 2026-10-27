import { useState } from "react";
import { Check, Download, Smartphone } from "lucide-react";

export default function AppInstallCard({ installation }) {
  const { installed, platform, canPrompt, install, message, busy } = installation;
  const [guideOpen, setGuideOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/");
      setCopyMessage("网址已复制，请在手机浏览器中打开。");
    } catch {
      setCopyMessage(`请复制浏览器地址栏中的网址：${window.location.origin}/`);
    }
  };
  return (
    <section className="mb-4 rounded-xl border border-orange-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="install-app-title">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><Smartphone className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="install-app-title" className="text-lg font-bold">安装 App</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">添加到手机主屏幕，一点即开，使用独立窗口背单词。</p>
        </div>
      </div>
      {installed ? <p className="mt-4 flex items-center gap-2 text-sm font-bold text-emerald-600"><Check className="h-5 w-5" />已安装 / 正在 App 中使用</p> : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => { setGuideOpen(true); if (canPrompt) install(); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
            <Download className="h-4 w-4" />{busy ? "正在打开安装窗口…" : canPrompt ? "安装到此设备" : "添加到主屏幕"}
          </button>
          <button type="button" onClick={copyLink} className="min-h-11 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold">复制网址</button>
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-500">网页版 App，无需下载 APK。学习、登录与云端同步需要联网。</p>
      <div role="status" className="mt-2 break-words text-sm text-slate-600">{message || copyMessage}</div>
      {!installed && <details className="mt-2 text-sm" open={guideOpen} onToggle={(event) => setGuideOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer py-2 font-semibold text-orange-600">查看安装步骤</summary>
        <div className="space-y-3 rounded-lg bg-slate-50 p-3 leading-6 text-slate-600">
          <p className={platform === "ios" ? "font-semibold" : ""}><strong>iPhone / iPad：</strong>在 Safari 中打开本站，点“分享” → “添加到主屏幕” → “添加”；若出现“作为网页 App 打开”，保持开启。</p>
          <p className={platform === "android" ? "font-semibold" : ""}><strong>Android：</strong>在 Chrome 或 Edge 中打开本站，点浏览器菜单 → “安装应用”或“添加到主屏幕”，按提示确认。</p>
          <p><strong>电脑：</strong>在 Chrome / Edge 地址栏或浏览器菜单中选择“安装应用”。</p>
          <p>微信等内置浏览器没有安装选项时，请复制网址到系统浏览器打开。安装后仍使用原来的账号登录。</p>
        </div>
      </details>}
    </section>
  );
}
