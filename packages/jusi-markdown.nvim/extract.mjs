import { parentPort, workerData } from 'node:worker_threads';
import { extract } from './markdown.mjs';
try { parentPort.postMessage({ document: extract(workerData) }); }
catch (error) { parentPort.postMessage({ error: error.message }); }
