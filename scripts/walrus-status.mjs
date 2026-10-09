// Diagnostic script to check Walrus Memory status and inspect stored blobs on Sui Mainnet.
// Run with: npm run walrus:status (or node scripts/walrus-status.mjs)

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { MemWal } from "@mysten-incubation/memwal";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.vercel");
  const env = { ...process.env };
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && !env[match[1]]) {
        let value = (match[2] || "").trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
        } else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        env[match[1]] = value;
      }
    }
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const accountId = env.MEMWAL_ACCOUNT_ID;
  const privateKey = env.MEMWAL_PRIVATE_KEY;
  const enabled = env.MEMWAL_ENABLED === "true";

  console.log("==================================================");
  console.log("       Walrus Memory Mainnet Diagnostic Check     ");
  console.log("==================================================\n");

  console.log(`MEMWAL_ENABLED:     ${enabled}`);
  console.log(`MEMWAL_ACCOUNT_ID:  ${accountId ? "[SET]" : "<not set>"}`);
  console.log(`MEMWAL_PRIVATE_KEY: ${privateKey ? "[SET]" : "<not set>"}\n`);

  // 1. Check relayer config
  console.log("1. Checking official Walrus Memory Relayer...");
  try {
    const configRes = await fetch("https://relayer.memory.walrus.xyz/config", { signal: AbortSignal.timeout(15000) });
    if (!configRes.ok) throw new Error(`GET /config returned ${configRes.status}`);
    const config = await configRes.json();
    console.log(`   ✓ Relayer URL:      https://relayer.memory.walrus.xyz`);
    console.log(`   ✓ Target Network:   ${config.network.toUpperCase()}`);
    console.log(`   ✓ On-chain Package: ${config.packageId}`);
    console.log(`   ✓ Sui Transport:    ${config.suiTransport} via ${config.suiRpcUrl || config.suiGrpcUrl}`);
  } catch (err) {
    console.error("   Relayer config check failed.");
    process.exit(1);
  }

  // 2. Check relayer health
  console.log("\n2. Checking Relayer Health...");
  try {
    const healthRes = await fetch("https://relayer.memory.walrus.xyz/health", { signal: AbortSignal.timeout(15000) });
    if (!healthRes.ok) throw new Error("Relayer health request failed");
    const health = await healthRes.json();
    console.log(`   ✓ Health Status:    ${health.status}`);
    console.log(`   ✓ Operating Mode:   ${health.mode}`);
    console.log(`   ✓ Write Status:     ${health.writes}`);
  } catch (err) {
    console.error("   Relayer health check failed.");
    process.exit(1);
  }

  if (!enabled || !accountId || !privateKey) {
    console.log("\n⚠️  No credentials configured in .env.vercel.");
    return;
  }

  // 3. Test Account & Credentials
  console.log("\n3. Verifying On-Chain Account & Delegate Key...");
  const client = MemWal.create({ key: privateKey, accountId });

  try {
    const owner = await client.resolveOwner();
    console.log("   Account resolved successfully.");

    const nsResult = await client.listNamespaces();
    const count = nsResult.namespaces?.length ?? 0;
    console.log(`   ✓ Active Namespaces: ${count}`);

    // 4. Inspect Written Walrus Blobs
    console.log("\n4. Inspecting Written Walrus Blobs on Mainnet...");
    const sampleNs = nsResult.namespaces?.find(n => /^sp-u\d+-studied$/.test(n.name) && n.memory_count > 0)?.name;
    if (!sampleNs) {
      console.log("   No indexed study material yet; generate or upload study content first.");
      return;
    }

    console.log("   Checking one study namespace without displaying student data.");
    const recallRes = await client.recall({ query: "recent study material", limit: 1, namespace: sampleNs, sort: "recent" });

    if (recallRes.results && recallRes.results.length > 0) {
      console.log(`   ✓ Retrieved ${recallRes.results.length} stored Walrus blob(s):`);
      for (const item of recallRes.results) {
        console.log(`\n     ------------------------------------------------`);
        
        // Verify on Walrus mainnet aggregator
        try {
          const aggUrl = `https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${item.blob_id}`;
          const headRes = await fetch(aggUrl, { method: "HEAD", signal: AbortSignal.timeout(15000) });
          const size = headRes.headers.get("content-length");
          console.log(`     • Aggregator:  ✓ Verified HTTP ${headRes.status} (${size} bytes)`);
        } catch (e) {
          console.log("     Aggregator verification failed.");
        }
      }
      console.log(`     ------------------------------------------------`);
    } else {
      console.log("   (No blobs matched query in sample namespace)");
    }

    console.log("\n==================================================");
    console.log("   EXISTING MEMORY READBACK CHECK COMPLETED       ");
    console.log("==================================================");
  } catch (err) {
    console.error("   Account or memory readback failed. No student data or credentials were printed.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Diagnostic script failed. No credentials or student data were printed.");
  process.exit(1);
});
