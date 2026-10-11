// This coordinates rendering only. The API remains the authority for identity and access.
export function createSessionState(read, apply) {
  let version = 0;
  let pending = 0;
  async function restore() {
    const ticket = ++version;
    if (pending) return;
    try {
      const data = await read();
      if (ticket === version && !pending) apply(data.user);
    } catch {
      if (ticket === version && !pending) apply(null);
    }
  }
  return {
    restore,
    invalidate() { version++; },
    get busy() { return pending > 0; },
    async mutate(work) {
      version++; pending++;
      try { return await work(); }
      finally { pending--; await restore(); }
    },
  };
}
