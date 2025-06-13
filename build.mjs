import { build } from 'esbuild';

const ignoreNodeBuiltIns = {
  name: 'ignore-node-builtins',
  setup(build) {
    build.onResolve({ filter: /^(fs|path|crypto)$/ }, args => ({ path: args.path, external: true }));
  },
};

build({
  entryPoints: ['docs/main.js'],
  bundle: true,
  outfile: 'docs/bundle.js',
  allowOverwrite: true,
  format: 'iife',
  plugins: [ignoreNodeBuiltIns],
  loader: { '.wasm': 'base64' },
}).catch(() => process.exit(1));

