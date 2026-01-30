import { redirect } from "react-router";
import type { Route } from "./+types/index-snapshot";
import { indexAllSnapshots } from "../../services/indexer.server";

export async function action({ request }: Route.ActionArgs) {
  try {
    const { indexed, errors } = await indexAllSnapshots();

    if (errors.length > 0) {
      console.error("Indexing errors:", errors);
    }

    return redirect("/");
  } catch (error) {
    console.error("Indexing failed:", error);
    return redirect("/?error=indexing-failed");
  }
}
