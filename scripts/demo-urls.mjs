#!/usr/bin/env node
/**
 * Print LAN / demo URLs without starting the server.
 * Usage: npm run demo:urls
 */
import { printNetworkAccessUrls } from '../client/server/src/utils/networkUrls.js';

const port = Number(process.env.PORT) || 3000;
printNetworkAccessUrls(port);
