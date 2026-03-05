import { watch } from 'fs/promises';
import build from './build.ts';

const watcher = watch('./src', { recursive: true });

const server = Bun.serve({
   port: 3000,
   async fetch(req) {
      let path = new URL(req.url).pathname;
      let file = Bun.file(`${build.OUTPUT}${path}`);
      // Redirect missing paths to the SPA index.
      if (!await file.exists()) {
         file = Bun.file(`${build.OUTPUT}/index.html`);
      }
      return new Response(file);
   }
});
console.log(`Serving on port ${server.port}`);

await build();
for await (const _ of watcher) {
   console.log("Change detected, rebuilding...");
   await build();
}

process.on("SIGINT", () => {
   server.stop();
   process.exit(0);
});
