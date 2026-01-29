import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("snapshots/:subvolume", "routes/snapshots.tsx"),
  route("compare/:oldSnapshot/:newSnapshot", "routes/compare.tsx"),
  route("diff", "routes/diff.tsx"),
  route("browse/:snapshot/*", "routes/browse.tsx"),
  route("api/stream-changes", "routes/api.stream-changes.ts"),
  route("api/files/:snapshotPath", "routes/api.files.ts"),
  route("api/file-history", "routes/api.file-history.ts"),
  route("api/file-content", "routes/api.file-content.ts"),
  route("api/index-snapshot", "routes/api.index-snapshot.ts"),
  route("api/rebuild-index", "routes/api.rebuild-index.ts"),
] satisfies RouteConfig;
