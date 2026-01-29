interface BreadcrumbsProps {
  snapshot: string;
  directory: string;
  onNavigate: (path: string) => void;
}

export function Breadcrumbs({ snapshot, directory, onNavigate }: BreadcrumbsProps) {
  // Split directory into parts
  const parts = directory === '/' ? [] : directory.split('/').filter(Boolean);

  // Build breadcrumb items
  const items = [
    { label: 'Root', path: '/' },
    ...parts.map((part, index) => {
      const path = '/' + parts.slice(0, index + 1).join('/');
      return { label: part, path };
    })
  ];

  return (
    <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <div key={item.path} className="flex items-center gap-2">
          {index > 0 && (
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          )}
          <button
            onClick={() => onNavigate(item.path)}
            className={
              index === items.length - 1
                ? 'text-gray-900 dark:text-white font-medium'
                : 'text-blue-600 dark:text-blue-400 hover:underline'
            }
            disabled={index === items.length - 1}
          >
            {item.label}
          </button>
        </div>
      ))}
    </nav>
  );
}
