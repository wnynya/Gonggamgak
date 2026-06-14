'use strict';

import http from 'node:http';
import express from './express.js';
let PORT = Number(process.env.PORT) || 80;
for (let i = 0; i < process.argv.length; i++) {
  if (
    process.argv[i] == '-p' &&
    process.argv.length > i + 1 &&
    process.argv[i + 1]
  ) {
    PORT = process.argv[i + 1];
    i++;
  }
}

http.createServer(express).listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
