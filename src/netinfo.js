"use strict";
// Local network introspection: enumerate reachable IPs and build phone URLs,
// Tailscale (100.64.0.0/10) first, then LAN.
const os = require("os");

function isTailscaleIp(ip) {
  const m = /^100\.(\d+)\./.exec(ip || "");
  return !!m && +m[1] >= 64 && +m[1] <= 127;
}

function phoneUrls(port, token) {
  const ifs = os.networkInterfaces() || {};
  const out = [];
  for (const name of Object.keys(ifs)) {
    for (const ni of ifs[name] || []) {
      if (ni.family !== "IPv4" || ni.internal) continue;
      const tailscale = isTailscaleIp(ni.address);
      out.push({
        ip: ni.address,
        tailscale,
        kind: tailscale ? "tailscale" : "lan",
        url: `http://${ni.address}:${port}/?k=${token}`,
      });
    }
  }
  return out.sort((a, b) => (b.tailscale ? 1 : 0) - (a.tailscale ? 1 : 0));
}

module.exports = { isTailscaleIp, phoneUrls };
