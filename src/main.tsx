import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ── Register Service Worker for PWA ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
