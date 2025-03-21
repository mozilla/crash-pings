import { watch } from 'fs/promises';
import build from './build.ts';

const watcher = watch('./src', { recursive: true });

const server = Bun.serve({
   port: 3000,
   fetch(req) {
      var path = new URL(req.url).pathname;
      if (path === "/") {
         path = "/index.html";
      }
      return new Response(Bun.file(`${build.OUTPUT}${path}`));
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
