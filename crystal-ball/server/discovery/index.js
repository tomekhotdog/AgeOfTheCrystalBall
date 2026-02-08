// server/discovery/index.js
// Discovery interface -- returns the appropriate discovery backend
// based on the SIMULATE environment variable and platform.

/**
 * Create and return a discovery instance.
 *
 * - If `process.env.SIMULATE === 'true'`, loads the SimulatorDiscovery.
 * - If on macOS (darwin), loads MacOSDiscovery for real process discovery.
 * - Otherwise, returns a stub that yields an empty session list.
 *
 * @returns {Promise<{ discoverSessions(): Promise<object[]> }>}
 */
export async function createDiscovery() {
  if (process.env.SIMULATE === "true") {
    const { SimulatorDiscovery } = await import("./simulator.js");
    return new SimulatorDiscovery();
  }

  if (process.platform === "darwin") {
    const { MacOSDiscovery } = await import("./macos.js");
    return new MacOSDiscovery();
  }

  if (process.platform === "linux") {
    const { LinuxDiscovery } = await import("./linux.js");
    return new LinuxDiscovery();
  }

  // Stub -- real discovery not yet implemented for this platform
  return {
    async discoverSessions() {
      return [];
    },
  };
}
