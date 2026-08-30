import { redirect } from "next/navigation";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth.js";

const localUser = {
  userId: "local-preview-owner",
  email: "preview@vocabulary.local",
  displayName: "本地预览用户",
  fullName: "本地预览用户",
};

export async function getAppUser() {
  const user = await getChatGPTUser();
  if (user) return user;
  return globalThis.process?.env?.NODE_ENV === "development" ? localUser : null;
}

export async function requireAppUser(returnTo = "/") {
  const user = await getAppUser();
  if (user) return user;
  redirect(chatGPTSignInPath(returnTo));
}
