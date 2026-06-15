'use strict';

import nodepath from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = nodepath.dirname(__filename);

import express from 'express';

const app = express();

app.use((req, res, next) => {
  res.error = (status, message) => {
    res.status(status);
    res.send(message);
  };
  next();
});

app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store',
  });
  next();
});

app.use(
  express.static(nodepath.resolve(__dirname, './public'), {
    etag: false,
    lastModified: false,
  }),
);

app.use(express.json());
app.use(express.urlencoded());

/* 오류 처리 */
app.all('/{*all}', (req, res) => {
  throw new Error('404 Not Found');
});
app.use((err, req, res, next) => {
  let message = err.message || err;
  let status = Number(message.substring(0, 3));
  if (status && 99 < status && status < 1000) {
    message = message.substring(4);
  } else {
    status = 500;
  }
  if (status >= 500) {
    console.error(err);
  }
  res.error(status, message);
});

export default app;
