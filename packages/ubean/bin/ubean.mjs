#!/usr/bin/env node
/**
 * ubean CLI binary (command: `ubean`).
 *
 * This binary is a forwarding entry — the actual command implementation
 * lives in `@ubean/cli`. Importing `@ubean/cli/cli` triggers `runMain(main)`
 * at module top-level, so a bare import is sufficient.
 *
 * Design rationale:
 *   1. The `ubean` package is the aggregator — bin and lib come from
 *      the same package, so users install one package and get everything.
 *   2. CLI implementation is centralized in `@ubean/cli` for maintainability.
 */
import '@ubean/cli/cli';
