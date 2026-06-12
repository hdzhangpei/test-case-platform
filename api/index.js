import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// Dynamically import the compiled serve module
const { runServe } = await import(resolve(PROJECT_ROOT, 'tools/api-test-framework/dist/commands/serve.js'));

const port = process.env.PORT ? parseInt(process.env.PORT) : 3456;

runServe({ projectRoot: PROJECT_ROOT, port });
