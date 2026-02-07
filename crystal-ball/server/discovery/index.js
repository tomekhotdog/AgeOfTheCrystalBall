// server/discovery/index.js
// Discovery interface — returns the appropriate discovery backend
// based on the SIMULATE environment variable.

/**
 * Create and return a discovery instance.
 *
 * - If `process.env.SIMULATE === 'true'`, loads the SimulatorDiscovery.
 * - Otherwise, returns a stub that yields an empty session list
 *   (real platform discovery is deferred to a later milestone).
 *
 * @returns {Promise<{ discoverSessions(): Promise<object[]> }>}
 */
export async function createDiscovery() {
  if (process.env.SIMULATE === "true") {
    const { SimulatorDiscovery } = await import("./simulator.js");
    return new SimulatorDiscovery();
  }

  // Stub — real discovery not yet implemented
  return {
    async discoverSessions() {
      return [];
    },
  };
}
