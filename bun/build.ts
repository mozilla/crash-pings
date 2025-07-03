import { rm } from 'fs/promises';

const OUTPUT = './dist';
const ENTRYPOINT = './src/index.html';
const DEV = Bun.env.NODE_ENV !== 'production';

type BuildFunction = {
   (): Promise<boolean>;
   OUTPUT: string;
};

async function build(): Promise<boolean> {
   await rm(OUTPUT, { recursive: true, force: true });
   try {
      const result = await Bun.build({
         entrypoints: [ENTRYPOINT],
         outdir: OUTPUT,
         splitting: !DEV,
         minify: !DEV,
         sourcemap: DEV ? "linked" : "none",
         throw: true,
      });
      return result.success;
   } catch (e) {
      const error = e as AggregateError;
      console.error("Build failed");
      console.error(error);
      return false;
   }
}

build.OUTPUT = OUTPUT;

export default build as BuildFunction;

if (import.meta.main) {
   await build();
}
