import type { FileDiff } from "~/types";

interface DiffViewerProps {
  diff: FileDiff;
}

interface DiffLine {
  type: "context" | "add" | "remove" | "header";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function parseDiff(unifiedDiff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  const diffLines = unifiedDiff.split("\n");

  let oldLine = 0;
  let newLine = 0;

  for (const line of diffLines) {
    if (line.startsWith("---") || line.startsWith("+++")) {
      lines.push({ type: "header", content: line });
    } else if (line.startsWith("@@")) {
      // Parse hunk header: @@ -start,count +start,count @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      lines.push({ type: "header", content: line });
    } else if (line.startsWith("-")) {
      lines.push({
        type: "remove",
        content: line.slice(1),
        oldLineNum: oldLine++,
      });
    } else if (line.startsWith("+")) {
      lines.push({
        type: "add",
        content: line.slice(1),
        newLineNum: newLine++,
      });
    } else if (line.startsWith(" ") || line === "") {
      lines.push({
        type: "context",
        content: line.slice(1) || "",
        oldLineNum: oldLine++,
        newLineNum: newLine++,
      });
    }
  }

  return lines;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  if (diff.isBinary) {
    return (
      <div className="p-8 text-center bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <svg
          className="w-16 h-16 mx-auto text-gray-400 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Binary file
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Cannot display diff for binary files
        </p>
      </div>
    );
  }

  if (diff.tooLarge) {
    return (
      <div className="p-8 text-center bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <svg
          className="w-16 h-16 mx-auto text-gray-400 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          File too large
        </h3>
        <p className="text-gray-500 dark:text-gray-400">{diff.error}</p>
      </div>
    );
  }

  if (diff.error) {
    return (
      <div className="p-8 text-center bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        <h3 className="text-lg font-medium text-red-900 dark:text-red-200 mb-2">
          Error loading diff
        </h3>
        <p className="text-red-700 dark:text-red-300">{diff.error}</p>
      </div>
    );
  }

  if (!diff.unifiedDiff) {
    return (
      <div className="p-8 text-center bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-gray-500 dark:text-gray-400">
          No differences found
        </p>
      </div>
    );
  }

  const lines = parseDiff(diff.unifiedDiff);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <tbody>
            {lines.map((line, idx) => (
              <tr
                key={idx}
                className={
                  line.type === "add"
                    ? "bg-green-50 dark:bg-green-900/20"
                    : line.type === "remove"
                      ? "bg-red-50 dark:bg-red-900/20"
                      : line.type === "header"
                        ? "bg-blue-50 dark:bg-blue-900/20"
                        : ""
                }
              >
                {/* Line numbers */}
                <td className="w-12 px-2 py-0.5 text-right text-gray-400 dark:text-gray-500 select-none border-r border-gray-200 dark:border-gray-700">
                  {line.type !== "header" && line.type !== "add"
                    ? line.oldLineNum || ""
                    : ""}
                </td>
                <td className="w-12 px-2 py-0.5 text-right text-gray-400 dark:text-gray-500 select-none border-r border-gray-200 dark:border-gray-700">
                  {line.type !== "header" && line.type !== "remove"
                    ? line.newLineNum || ""
                    : ""}
                </td>

                {/* Diff indicator */}
                <td className="w-6 px-1 py-0.5 text-center select-none">
                  {line.type === "add" && (
                    <span className="text-green-600 dark:text-green-400">+</span>
                  )}
                  {line.type === "remove" && (
                    <span className="text-red-600 dark:text-red-400">-</span>
                  )}
                </td>

                {/* Content */}
                <td className="px-2 py-0.5 whitespace-pre">
                  <span
                    className={
                      line.type === "add"
                        ? "text-green-800 dark:text-green-200"
                        : line.type === "remove"
                          ? "text-red-800 dark:text-red-200"
                          : line.type === "header"
                            ? "text-blue-800 dark:text-blue-200 font-semibold"
                            : "text-gray-800 dark:text-gray-200"
                    }
                  >
                    {line.content}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
