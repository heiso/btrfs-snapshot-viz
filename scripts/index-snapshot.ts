#!/usr/bin/env tsx

/**
 * CLI script to auto-index the latest snapshot
 *
 * Usage:
 *   npm run index-snapshot /@snapshots
 *   tsx scripts/index-snapshot.ts /@snapshots
 *
 * This script is designed to be called after creating a new snapshot
 * to automatically keep the file history index up-to-date.
 */

import { indexLatestSnapshot, getIndexMetadata } from '../app/services/file-history.server';
import { getSnapshots } from '../app/services/index.server';

async function main() {
  const subvolumePath = process.argv[2];

  if (!subvolumePath) {
    console.error('Usage: npm run index-snapshot <subvolume-path>');
    console.error('Example: npm run index-snapshot /@snapshots');
    process.exit(1);
  }

  console.log(`Indexing latest snapshot for: ${subvolumePath}`);

  try {
    // Get current status
    const snapshots = await getSnapshots(subvolumePath);
    const metadata = await getIndexMetadata(subvolumePath);

    console.log(`Total snapshots: ${snapshots.length}`);
    console.log(`Indexed snapshots: ${metadata?.indexed_snapshots || 0}`);

    const latestSnapshot = snapshots[snapshots.length - 1];
    if (!latestSnapshot) {
      console.log('No snapshots found');
      process.exit(0);
    }

    console.log(`Latest snapshot: ${latestSnapshot.path}`);

    // Check if already indexed
    if (metadata?.last_indexed_snapshot === latestSnapshot.path) {
      console.log('✅ Latest snapshot is already indexed');
      process.exit(0);
    }

    // Index the latest snapshot
    console.log('Indexing...');
    await indexLatestSnapshot(subvolumePath);

    console.log('✅ Index updated successfully');
    console.log(`Last indexed: ${latestSnapshot.path}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Index update failed:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
