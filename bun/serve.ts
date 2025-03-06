import { watch } from 'fs/promises';
import build from './build.ts';

const watcher = watch('./src', { recursive: true });

const server = Bun.serve({
   port: 3000,
   /*
   static: {
      "/ping_info.json": new Response(await Bun.file("ping_info.json").bytes()),
      "/condensed_info.json": new Response(await Bun.file("condensed_info.json").bytes()),
   },
   */
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
