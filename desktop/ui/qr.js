"use strict";
// QR window: ask Rust for the phone link as an SVG QR + URL, render it. The Rust
// side re-emits "refresh-qr" each time the window is shown (the IP may change).

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const box = document.getElementById("box");
const urlEl = document.getElementById("url");

async function load() {
  try {
    const res = await invoke("phone_qr");
    box.innerHTML = res.svg;
    urlEl.textContent = res.url;
  } catch (e) {
    box.innerHTML = "";
    urlEl.textContent = String(e || "No phone link — start Tailscale or join the same Wi‑Fi.");
  }
}

document.getElementById("copy").addEventListener("click", () => {
  invoke("copy_phone_link").catch(() => {});
});
document.getElementById("close").addEventListener("click", () => {
  invoke("hide_self").catch(() => {});
});

listen("refresh-qr", load);
load();
