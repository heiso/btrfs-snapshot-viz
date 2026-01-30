import { type RouteConfig, index, route, prefix } from "@react-router/dev/routes";

export default [
  // Main file browser (redirects to latest snapshot)
  index("routes/home.tsx"),

  // File browser at specific snapshot/path (splat handles both cases)
  route("browse/:snapshotId/*?", "routes/browse.tsx"),

  // View file content
  route("file/:snapshotId/*", "routes/file.tsx"),

  // File history
  route("history/*", "routes/history.tsx"),

  // Snapshots list and detail
  route("snapshots", "routes/snapshots.tsx"),
  route("snapshots/:id", "routes/snapshot-detail.tsx"),

  // Compare snapshots
  route("compare", "routes/compare.tsx"),

  // Search
  route("search", "routes/search.tsx"),

  // API routes
  ...prefix("api", [
    route("snapshots", "routes/api/snapshots.ts"),
    route("index-snapshot", "routes/api/index-snapshot.ts"),
  ]),
] satisfies RouteConfig;
