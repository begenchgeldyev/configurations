import { createSync } from "./sync.js";

// V2's Plugin.define is an identity helper. Export the same structural contract
// directly so this small local plugin needs no separately installed SDK runtime.
export default {
  id: "local.proxy-model-sync",
  async setup(ctx) {
    const sync = createSync(ctx);
    await sync.start();
    return () => sync.stop();
  },
};
