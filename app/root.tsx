import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { Header } from "./components/layout/Header";
import { RepoTabs } from "./components/layout/RepoTabs";
import { getAllSnapshots } from "./services/db.server";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico" },
];

export async function loader() {
  try {
    const snapshots = getAllSnapshots();
    return { snapshotCount: snapshots.length };
  } catch {
    return { snapshotCount: 0 };
  }
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>BTRFS Snapshot Viz</title>
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <header className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 pt-4">
        <Header />
        <RepoTabs snapshotCount={loaderData.snapshotCount} />
      </header>
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Outlet />
      </main>
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <main className="pt-16 p-4 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">{message}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-4">{details}</p>
        {stack && (
          <pre className="w-full p-4 overflow-x-auto bg-gray-50 dark:bg-gray-900 rounded-lg text-sm">
            <code>{stack}</code>
          </pre>
        )}
      </main>
    </div>
  );
}
