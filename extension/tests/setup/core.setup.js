import fs from 'fs';
import path from 'path';

// Use __dirname directly since this is a test setup file
const dirs = [
  path.join(__dirname, '../../logs/test'),
  path.join(__dirname, '../../coverage/core')
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Use global Jest functions directly
global.beforeAll(() => {
  if (!global.gc) {
    console.warn('Garbage collection not available. Memory tests may be unreliable.');
  }
});

global.afterAll(() => {
  if (global.gc) {
    global.gc();
  }
});