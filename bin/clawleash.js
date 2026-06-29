#!/usr/bin/env node
"use strict";
// clawleash — approve/deny Claude Code permission prompts from your phone.
//
//   npx clawleash            start the daemon (installs hooks on first run)
//   npx clawleash url        print the phone URL(s) and exit
//   npx clawleash uninstall  remove clawleash hooks from ~/.claude/settings.json
const config = require("../src/config");
const hooks = require("../src/hooks-install");
const { startDaemon } = require("../src/daemon");
const { phoneUrls } = require("../src/netinfo");

function printUrls(cfg) {
  const urls = phoneUrls(cfg.port, cfg.token);
  if (!urls.length) {
    console.log("   No network address found — connect Wi-Fi or start Tailscale.");
    return;
  }
  console.log("   Open on your phone (Tailscale first):");
  for (const u of urls) console.log(`     ${u.url}${u.tailscale ? "   · Tailscale" : "   · same Wi-Fi only"}`);
}

function main() {
  const cmd = process.argv[2] || "start";
  const cfg = config.ensure();

  if (cmd === "uninstall") {
    hooks.uninstall();
    console.log("✔ Removed clawleash hooks from ~/.claude/settings.json");
    return;
  }
  if (cmd === "url") {
    printUrls(cfg);
    return;
  }

  // start
  if (!hooks.isInstalled(cfg.port)) {
    hooks.install(cfg.port);
    console.log("✔ Installed clawleash hooks into ~/.claude/settings.json");
  }
  const d = startDaemon({
    getConfig: () => config.load(),
    onLog: (m) => console.log("clawleash:", m),
  });
  d.listen(cfg.port, () => {
    const c = config.load();
    console.log(`\n🦀 clawleash running on 0.0.0.0:${cfg.port}\n`);
    printUrls(cfg);
    const ntfyStatus = c.ntfyTopic ? `${c.ntfyTopic}${c.ntfyToken ? " (auth)" : ""}` : "(not set)";
    console.log(`\n   Approvals: ${c.approvals ? "ON" : "off"}   |   ntfy push: ${ntfyStatus}`);
    console.log("   Scan the URL on your phone and Add to Home Screen.");
    console.log("   Ctrl-C to stop  ·  `npx clawleash uninstall` to remove hooks.\n");
  });
}

main();
