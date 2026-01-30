import type { Route } from "./+types/snapshots";
import { getAllSnapshots } from "../../services/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  const snapshots = getAllSnapshots();
  return Response.json({ snapshots });
}
