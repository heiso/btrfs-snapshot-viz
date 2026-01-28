import type {
  Subvolume,
  Snapshot,
  FileChange,
  SnapshotComparison,
  FileDiff,
} from "~/types";

// Generate a UUID-like string
function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Mock subvolumes
const mockSubvolumes: Subvolume[] = [
  {
    id: 256,
    path: "/@",
    parentId: 5,
    uuid: uuid(),
    parentUuid: null,
    createdAt: new Date("2024-01-01T10:00:00"),
    isSnapshot: false,
  },
  {
    id: 257,
    path: "/@home",
    parentId: 5,
    uuid: uuid(),
    parentUuid: null,
    createdAt: new Date("2024-01-01T10:00:00"),
    isSnapshot: false,
  },
];

// Generate mock snapshots for each subvolume
function generateMockSnapshots(subvolumePath: string): Snapshot[] {
  const baseDate = new Date("2024-06-01T00:00:00");
  const snapshots: Snapshot[] = [];

  // Create 15 snapshots over a month
  for (let i = 0; i < 15; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i * 2);
    date.setHours(Math.floor(Math.random() * 24));

    snapshots.push({
      id: 300 + i,
      path: `/.snapshots/${subvolumePath.replace("/", "")}/${date.toISOString().split("T")[0]}_${String(i).padStart(3, "0")}`,
      parentId: 256,
      uuid: uuid(),
      parentUuid: i > 0 ? snapshots[i - 1].uuid : null,
      createdAt: date,
      isSnapshot: true,
      sourceSubvolume: subvolumePath,
    });
  }

  return snapshots;
}

const snapshotCache = new Map<string, Snapshot[]>();

export function getSubvolumes(): Subvolume[] {
  return mockSubvolumes;
}

export function getSnapshots(subvolumePath: string): Snapshot[] {
  if (!snapshotCache.has(subvolumePath)) {
    snapshotCache.set(subvolumePath, generateMockSnapshots(subvolumePath));
  }
  return snapshotCache.get(subvolumePath)!;
}

// Mock file changes between snapshots
const mockFileChanges: Record<string, FileChange[]> = {
  default: [
    { type: "write", path: "/etc/hostname" },
    { type: "write", path: "/etc/fstab" },
    { type: "mkdir", path: "/var/log/journal/new-session" },
    { type: "write", path: "/var/log/syslog", size: 102400 },
    { type: "unlink", path: "/tmp/old-cache-file" },
  ],
  config: [
    { type: "write", path: "/etc/pacman.conf" },
    { type: "write", path: "/etc/mkinitcpio.conf" },
    { type: "write", path: "/etc/sudoers" },
    { type: "write", path: "/etc/locale.gen" },
  ],
  home: [
    { type: "write", path: "/home/user/.bashrc" },
    { type: "write", path: "/home/user/.config/nvim/init.lua", size: 5200 },
    { type: "mkdir", path: "/home/user/Projects/new-project" },
    { type: "write", path: "/home/user/Projects/new-project/README.md" },
    { type: "write", path: "/home/user/Projects/new-project/package.json" },
    {
      type: "rename",
      path: "/home/user/Documents/report-final.pdf",
      oldPath: "/home/user/Documents/report-draft.pdf",
    },
    { type: "unlink", path: "/home/user/.cache/old-file" },
    { type: "write", path: "/home/user/Pictures/photo.jpg", size: 2500000 },
  ],
  packages: [
    { type: "write", path: "/usr/bin/neovim" },
    { type: "write", path: "/usr/lib/libfoo.so.1" },
    { type: "link", path: "/usr/lib/libfoo.so" },
    { type: "mkdir", path: "/usr/share/doc/new-package" },
    { type: "write", path: "/usr/share/doc/new-package/README" },
    { type: "write", path: "/var/lib/pacman/local/new-package/desc" },
  ],
};

export function getChanges(
  oldSnapshotPath: string,
  newSnapshotPath: string
): SnapshotComparison {
  const allSnapshots = [
    ...getSnapshots("/@"),
    ...getSnapshots("/@home"),
  ];

  const oldSnapshot = allSnapshots.find((s) => s.path === oldSnapshotPath);
  const newSnapshot = allSnapshots.find((s) => s.path === newSnapshotPath);

  if (!oldSnapshot || !newSnapshot) {
    throw new Error("Snapshot not found");
  }

  // Pick a random set of changes based on path
  const changeKeys = Object.keys(mockFileChanges);
  const selectedKey = changeKeys[Math.abs(oldSnapshot.id) % changeKeys.length];
  const changes = [...mockFileChanges[selectedKey]];

  // Add some variation
  if (newSnapshot.id % 3 === 0) {
    changes.push(
      ...mockFileChanges[changeKeys[(oldSnapshot.id + 1) % changeKeys.length]]
    );
  }

  const summary = {
    added: changes.filter(
      (c) => c.type === "mkdir" || c.type === "link" || c.type === "symlink"
    ).length,
    modified: changes.filter(
      (c) => c.type === "write" || c.type === "truncate"
    ).length,
    deleted: changes.filter((c) => c.type === "unlink" || c.type === "rmdir")
      .length,
    renamed: changes.filter((c) => c.type === "rename").length,
  };

  return {
    oldSnapshot,
    newSnapshot,
    changes,
    summary,
  };
}

// Mock file contents for diff
const mockFileContents: Record<string, { old: string; new: string }> = {
  "/etc/hostname": {
    old: "archlinux",
    new: "my-workstation",
  },
  "/etc/fstab": {
    old: `# /etc/fstab: static file system information.
UUID=abc123 / btrfs defaults,subvol=@ 0 0
UUID=abc123 /home btrfs defaults,subvol=@home 0 0
`,
    new: `# /etc/fstab: static file system information.
UUID=abc123 / btrfs defaults,subvol=@,compress=zstd 0 0
UUID=abc123 /home btrfs defaults,subvol=@home,compress=zstd 0 0
UUID=def456 /mnt/data ext4 defaults 0 2
`,
  },
  "/home/user/.bashrc": {
    old: `# ~/.bashrc
export PATH="$HOME/.local/bin:$PATH"
alias ll='ls -la'
alias gs='git status'

# Prompt
PS1='\\u@\\h:\\w\\$ '
`,
    new: `# ~/.bashrc
export PATH="$HOME/.local/bin:$PATH"
export EDITOR=nvim

alias ll='ls -la'
alias gs='git status'
alias gd='git diff'
alias gc='git commit'

# Better prompt with git branch
parse_git_branch() {
    git branch 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \\(.*\\)/(\\1)/'
}
PS1='\\u@\\h:\\w\\$(parse_git_branch)\\$ '

# FZF integration
[ -f ~/.fzf.bash ] && source ~/.fzf.bash
`,
  },
  "/home/user/.config/nvim/init.lua": {
    old: `-- Neovim config
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.tabstop = 2
vim.opt.shiftwidth = 2

-- Key mappings
vim.g.mapleader = " "
`,
    new: `-- Neovim config
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.opt.expandtab = true
vim.opt.smartindent = true
vim.opt.termguicolors = true

-- Key mappings
vim.g.mapleader = " "
vim.keymap.set('n', '<leader>ff', ':Telescope find_files<CR>')
vim.keymap.set('n', '<leader>fg', ':Telescope live_grep<CR>')
vim.keymap.set('n', '<leader>e', ':NvimTreeToggle<CR>')

-- Plugins
require('lazy').setup({
  'nvim-telescope/telescope.nvim',
  'nvim-tree/nvim-tree.lua',
  'neovim/nvim-lspconfig',
})
`,
  },
  "/home/user/Projects/new-project/README.md": {
    old: "",
    new: `# New Project

A new project created after the snapshot.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
  },
  "/home/user/Projects/new-project/package.json": {
    old: "",
    new: `{
  "name": "new-project",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.2.0"
  }
}
`,
  },
  "/etc/pacman.conf": {
    old: `[options]
HoldPkg = pacman glibc
Architecture = auto

[core]
Include = /etc/pacman.d/mirrorlist

[extra]
Include = /etc/pacman.d/mirrorlist
`,
    new: `[options]
HoldPkg = pacman glibc
Architecture = auto
ParallelDownloads = 5
Color

[core]
Include = /etc/pacman.d/mirrorlist

[extra]
Include = /etc/pacman.d/mirrorlist

[multilib]
Include = /etc/pacman.d/mirrorlist
`,
  },
};

export function getFileDiff(
  _oldSnapshotPath: string,
  _newSnapshotPath: string,
  filePath: string
): FileDiff {
  // Check if it's a binary file (by extension or size hint)
  const binaryExtensions = [".jpg", ".png", ".gif", ".pdf", ".bin", ".so"];
  const isBinary = binaryExtensions.some((ext) =>
    filePath.toLowerCase().endsWith(ext)
  );

  if (isBinary) {
    return {
      path: filePath,
      isBinary: true,
    };
  }

  // Check if we have mock content for this file
  const mockContent = mockFileContents[filePath];
  if (mockContent) {
    return {
      path: filePath,
      isBinary: false,
      oldContent: mockContent.old,
      newContent: mockContent.new,
      unifiedDiff: generateUnifiedDiff(
        filePath,
        mockContent.old,
        mockContent.new
      ),
    };
  }

  // Generate some placeholder content for unknown files
  return {
    path: filePath,
    isBinary: false,
    oldContent: `# Old content of ${filePath}\nLine 1\nLine 2\n`,
    newContent: `# New content of ${filePath}\nLine 1 modified\nLine 2\nLine 3 added\n`,
    unifiedDiff: generateUnifiedDiff(
      filePath,
      `# Old content of ${filePath}\nLine 1\nLine 2\n`,
      `# New content of ${filePath}\nLine 1 modified\nLine 2\nLine 3 added\n`
    ),
  };
}

// Simple unified diff generator
function generateUnifiedDiff(
  path: string,
  oldContent: string,
  newContent: string
): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  let diff = `--- a${path}\n+++ b${path}\n`;

  // Simple diff - show all changes (not a real diff algorithm)
  const maxLines = Math.max(oldLines.length, newLines.length);
  let inHunk = false;
  let hunkOldStart = 1;
  let hunkNewStart = 1;
  let hunkContent = "";
  let oldCount = 0;
  let newCount = 0;

  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      if (inHunk && hunkContent) {
        diff += `@@ -${hunkOldStart},${oldCount} +${hunkNewStart},${newCount} @@\n`;
        diff += hunkContent;
        hunkContent = "";
        oldCount = 0;
        newCount = 0;
      }
      inHunk = false;
      hunkOldStart = i + 2;
      hunkNewStart = i + 2;
    } else {
      if (!inHunk) {
        inHunk = true;
      }
      if (oldLine !== undefined) {
        hunkContent += `-${oldLine}\n`;
        oldCount++;
      }
      if (newLine !== undefined) {
        hunkContent += `+${newLine}\n`;
        newCount++;
      }
    }
  }

  if (hunkContent) {
    diff += `@@ -${hunkOldStart},${oldCount} +${hunkNewStart},${newCount} @@\n`;
    diff += hunkContent;
  }

  return diff;
}
