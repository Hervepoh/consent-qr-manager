const autocannon = require("autocannon");

/**
 * Eneo QR Consent - High Concurrency Load Test
 * Simulates 10,000 requests to the contract search endpoint.
 * This tests the efficiency of the cache layer and the DB pool.
 */

const url = "http://localhost:3001/api/contract/search/201234567";

async function runTest() {
  console.log("🚀 Starting Eneo Load Test (10,000 users target)...");

  const result = await autocannon({
    url,
    connections: 100, // Concurrent connections
    pipelining: 10,
    duration: 30, // Run for 30 seconds
    amount: 100000, // Total requests
    title: "Eneo Contract Search Stress Test",
  });

  console.log("\n📊 LOAD TEST RESULTS:");
  console.log("------------------------------------");
  console.log(`Requests/sec: ${result.requests.average}`);
  console.log(
    `Throughput:   ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/sec`,
  );
  console.log(`P99 Latency:  ${result.latency.p99} ms`);
  console.log(`Total Errors: ${result.errors}`);
  console.log("------------------------------------");

  if (result.errors > 0) {
    console.warn("⚠️ WARNING: Test finished with errors. Check server logs.");
  } else {
    console.log("✅ SUCCESS: System handled the load with 0% error rate.");
  }
}

runTest();
