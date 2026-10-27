import { useEffect, useState } from "react";

function isStandalone() {
  return typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true);
}

function currentPlatform() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : /Android/.test(ua) ? "android" : "other";
}

export function useAppInstall() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [platform] = useState(currentPlatform);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(media.matches || window.navigator.standalone === true);
    const capture = (event) => { event.preventDefault(); setPromptEvent(event); };
    const completed = () => { setInstalled(true); setPromptEvent(null); setMessage("安装成功，可从主屏幕打开。"); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", completed);
    media.addEventListener("change", update);
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
        // Installation guidance remains usable if the browser disallows workers.
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", completed);
      media.removeEventListener("change", update);
    };
  }, []);

  const install = async () => {
    if (!promptEvent || busy) return;
    setBusy(true);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setMessage(choice.outcome === "accepted" ? "安装请求已提交，请在主屏幕或应用列表中查看。" : "已取消安装，稍后仍可从浏览器菜单添加。");
    } catch {
      setMessage("暂时无法弹出安装窗口，请按下方步骤从浏览器菜单添加。");
    } finally {
      setPromptEvent(null);
      setBusy(false);
    }
  };
  return { installed, platform, canPrompt: Boolean(promptEvent), install, message, busy };
}
