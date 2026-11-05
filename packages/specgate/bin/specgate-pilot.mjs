#!/usr/bin/env node
import { pilotMain } from "../src/pilot-cli.mjs";
await pilotMain(process.argv.slice(2));
