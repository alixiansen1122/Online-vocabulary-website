import App from "../src/App.jsx";
import { requireAppUser } from "./app-auth.js";
import { chatGPTSignOutPath } from "./chatgpt-auth.js";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireAppUser("/");
  return (
    <App
      currentUser={{ displayName: user.displayName, email: user.email }}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
