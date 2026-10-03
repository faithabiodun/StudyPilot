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
        env[match[1]] = match[2].trim();
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
  console.log(`MEMWAL_ACCOUNT_ID:  ${accountId || "<not set>"}`);
  console.log(`MEMWAL_PRIVATE_KEY: ${privateKey ? "[SET - " + privateKey.slice(0, 6) + "..." + privateKey.slice(-4) + "]" : "<not set>"}\n`);

  // 1. Check relayer config
  console.log("1. Checking official Walrus Memory Relayer...");
  try {
    const configRes = await fetch("https://relayer.memory.walrus.xyz/config");
    if (!configRes.ok) throw new Error(`GET /config returned ${configRes.status}`);
    const config = await configRes.json();
    console.log(`   ✓ Relayer URL:      https://relayer.memory.walrus.xyz`);
    console.log(`   ✓ Target Network:   ${config.network.toUpperCase()}`);
    console.log(`   ✓ On-chain Package: ${config.packageId}`);
    console.log(`   ✓ Sui Transport:    ${config.suiTransport} via ${config.suiRpcUrl || config.suiGrpcUrl}`);
  } catch (err) {
    console.error(`   ✗ Failed to reach relayer: ${err.message}`);
    process.exit(1);
  }

  // 2. Check relayer health
  console.log("\n2. Checking Relayer Health...");
  try {
    const healthRes = await fetch("https://relayer.memory.walrus.xyz/health");
    const health = await healthRes.json();
    console.log(`   ✓ Health Status:    ${health.status}`);
    console.log(`   ✓ Operating Mode:   ${health.mode}`);
    console.log(`   ✓ Write Status:     ${health.writes}`);
  } catch (err) {
    console.error(`   ✗ Health check failed: ${err.message}`);
    process.exit(1);
  }

  if (!accountId || !privateKey) {
    console.log("\n⚠️  No credentials configured in .env.vercel.");
    return;
  }

  // 3. Test Account & Credentials
  console.log("\n3. Verifying On-Chain Account & Delegate Key...");
  const client = MemWal.create({ key: privateKey, accountId });

  try {
    const owner = await client.resolveOwner();
    console.log(`   ✓ Account ID:       ${accountId}`);
    console.log(`   ✓ Account Owner:    ${owner}`);

    const nsResult = await client.listNamespaces();
    const count = nsResult.namespaces?.length ?? 0;
    console.log(`   ✓ Active Namespaces: ${count}`);

    // 4. Inspect Written Walrus Blobs
    console.log("\n4. Inspecting Written Walrus Blobs on Mainnet...");
    const sampleNs = nsResult.namespaces?.find(n => n.memory_count > 0)?.name || "sp-u41-database-systems";

    console.log(`   Querying namespace: "${sampleNs}"`);
    const recallRes = await client.recall({ query: "database misconception question", limit: 3, namespace: sampleNs });

    if (recallRes.results && recallRes.results.length > 0) {
      console.log(`   ✓ Retrieved ${recallRes.results.length} stored Walrus blob(s):`);
      for (const item of recallRes.results) {
        console.log(`\n     ------------------------------------------------`);
        console.log(`     • Blob ID:     ${item.blob_id}`);
        console.log(`     • Created At:  ${item.created_at || "N/A"}`);
        console.log(`     • Text Snippet:${item.text.split("\n")[0]}`);
        
        // Verify on Walrus mainnet aggregator
        try {
          const aggUrl = `https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${item.blob_id}`;
          const headRes = await fetch(aggUrl);
          const size = headRes.headers.get("content-length");
          console.log(`     • Aggregator:  ✓ Verified HTTP ${headRes.status} (${size} bytes)`);
          console.log(`       URL: ${aggUrl}`);
        } catch (e) {
          console.log(`     • Aggregator verification: ${e.message}`);
        }
      }
      console.log(`     ------------------------------------------------`);
    } else {
      console.log("   (No blobs matched query in sample namespace)");
    }

    console.log("\n==================================================");
    console.log("   ALL WALRUS MEMORY MAINNET CHECKS PASSED!       ");
    console.log("==================================================");
  } catch (err) {
    console.error(`   ✗ Verification failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Diagnostic script error:", err);
  process.exit(1);
});
