import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-select and clear "0" on focus for number inputs
document.addEventListener("focusin", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.tagName === "INPUT" && el.type === "number") {
    if (el.value === "0") {
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    requestAnimationFrame(() => el.select());
  }
});

createRoot(document.getElementById("root")!).render(<App />);
