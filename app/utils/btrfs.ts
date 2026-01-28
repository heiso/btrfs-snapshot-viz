/**
 * Build the btrfs send command for comparing two snapshots
 */
export function buildBtrfsSendCommand(
  btrfsRoot: string,
  oldSnapshotPath: string,
  newSnapshotPath: string
): string {
  return `btrfs send -p "${btrfsRoot}${oldSnapshotPath}" "${btrfsRoot}${newSnapshotPath}" | btrfs receive --dump | grep -vE "^(utimes|chmod|chown|update_extent) "`;
}
