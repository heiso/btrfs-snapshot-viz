import { Link } from "react-router";

export function Header() {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xl">📦</span>
      <div className="flex items-center gap-1 text-xl">
        <Link
          to="/"
          className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          storage
        </Link>
        <span className="text-gray-500 dark:text-gray-400">/</span>
        <Link
          to="/"
          className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          snapshots
        </Link>
      </div>
    </div>
  );
}
