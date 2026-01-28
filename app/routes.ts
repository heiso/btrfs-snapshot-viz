import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("snapshots/:subvolume", "routes/snapshots.tsx"),
  route("compare/:oldSnapshot/:newSnapshot", "routes/compare.tsx"),
  route("diff", "routes/diff.tsx"),
  route("api/stream-changes", "routes/api.stream-changes.ts"),
] satisfies RouteConfig;
