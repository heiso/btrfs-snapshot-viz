import { Link } from "react-router";

interface BreadcrumbsProps {
  snapshotId: number;
  currentPath: string;
}

export function Breadcrumbs({ snapshotId, currentPath }: BreadcrumbsProps) {
  const parts = currentPath.split("/").filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-sm mb-4">
      <Link
        to={`/browse/${snapshotId}`}
        className="text-blue-600 dark:text-blue-400 hover:underline"
      >
        root
      </Link>
      {parts.map((part, index) => {
        const path = parts.slice(0, index + 1).join("/");
        const isLast = index === parts.length - 1;

        return (
          <span key={path} className="flex items-center gap-1">
            <span className="text-gray-500 dark:text-gray-400">/</span>
            {isLast ? (
              <span className="text-gray-900 dark:text-gray-100 font-medium">{part}</span>
            ) : (
              <Link
                to={`/browse/${snapshotId}/${path}`}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {part}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
