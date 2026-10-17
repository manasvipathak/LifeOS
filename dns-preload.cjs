'use strict';

// This file is loaded through Node's CommonJS --require preload option.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dns = require('node:dns');

dns.setServers(['8.8.8.8']);
process.stderr.write(
  `[lifeos-dns-preload] pid=${process.pid} entry=${process.argv[1] ?? 'node'} servers=${dns.getServers().join(',')}\n`,
);
