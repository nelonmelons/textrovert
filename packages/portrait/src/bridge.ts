import type { Portrait } from "./types";

/**
 * The embedded build (vite build --mode embed) runs inside the app's WebView or iframe. It gets its data from the host
 * and hands person taps and haptics back to it; README.md documents the contract.
 */
export const EMBEDDED = import.meta.env.MODE === "embed";

export type HostMessage =
  | { type: "textrovert:ready" }
  | { type: "textrovert:open-person"; personId: string; name: string }
  | { type: "textrovert:haptic"; style: "light" | "medium" };

type Native = { ReactNativeWebView?: { postMessage: (data: string) => void }; textrovertPortrait?: (data: Portrait | string) => void };

/** Posts to the native WebView when there is one, else to the parent frame. */
export function toHost(message: HostMessage) {
  const native = (window as unknown as Native).ReactNativeWebView;
  if (native) native.postMessage(JSON.stringify(message));
  else if (window.parent !== window) window.parent.postMessage(message, "*");
}

/** Resolves with the portrait the host injects: window.textrovertPortrait(data) or a "textrovert:portrait" message. */
export function portraitFromHost(): Promise<Portrait> {
  return new Promise((resolve) => {
    const take = (data: Portrait | string) => resolve(typeof data === "string" ? (JSON.parse(data) as Portrait) : data);
    (window as unknown as Native).textrovertPortrait = take;
    window.addEventListener("message", (event) => {
      const data = event.data as { type?: string; portrait?: Portrait | string } | null;
      if (data?.type === "textrovert:portrait" && data.portrait) take(data.portrait);
    });
    toHost({ type: "textrovert:ready" });
  });
}
