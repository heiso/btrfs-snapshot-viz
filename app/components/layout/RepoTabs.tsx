import { NavLink } from "react-router";

interface RepoTabsProps {
  snapshotCount?: number;
}

export function RepoTabs({ snapshotCount }: RepoTabsProps) {
  return (
    <nav className="flex gap-2 border-b border-gray-200 dark:border-gray-700 -mx-6 px-6">
      <TabLink to="/" end>
        <CodeIcon />
        Code
      </TabLink>
      <TabLink to="/snapshots">
        <HistoryIcon />
        Snapshots
        {snapshotCount !== undefined && (
          <span className="bg-gray-100 dark:bg-gray-800 px-1.5 rounded-full text-xs">
            {snapshotCount}
          </span>
        )}
      </TabLink>
      <TabLink to="/compare">
        <CompareIcon />
        Compare
      </TabLink>
    </nav>
  );
}

function TabLink({
  to,
  children,
  end,
}: {
  to: string;
  children: React.ReactNode;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px ${
          isActive
            ? "text-gray-900 dark:text-gray-100 border-orange-500"
            : "text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-100"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
      <path d="M0 2.75A.75.75 0 0 1 .75 2h10.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 2.75Zm0 5A.75.75 0 0 1 .75 7h10.5a.75.75 0 0 1 0 1.5H.75A.75.75 0 0 1 0 7.75Zm0 5A.75.75 0 0 1 .75 12h10.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75Z" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
      <path d="M1.643 3.143.427 1.927A.25.25 0 0 0 0 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 0 0 .177-.427L2.715 4.215a6.5 6.5 0 1 1-1.18 4.458.75.75 0 1 0-1.493.154 8.001 8.001 0 1 0 1.6-5.684ZM7.75 4a.75.75 0 0 0-.75.75v2.992l2.028.812a.75.75 0 0 0 .557-1.392l-1.085-.434V4.75A.75.75 0 0 0 7.75 4Z" />
    </svg>
  );
}

function CompareIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
      <path d="M9.573.677A.75.75 0 0 1 10.25.25h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 1 1-1.5 0V2.56L8.78 6.78a.75.75 0 0 1-1.06-1.06L11.94 1.5h-1.69a.75.75 0 0 1-.677-.823ZM.75 5.5a.75.75 0 0 0-.75.75v8a.75.75 0 0 0 .75.75h8a.75.75 0 0 0 .75-.75v-8a.75.75 0 0 0-.75-.75h-8Zm.75 7.25v-5.5h5.5v5.5h-5.5Z" />
    </svg>
  );
}
