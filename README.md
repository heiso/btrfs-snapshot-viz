# BTRFS Snapshot Visualizer

A web-based tool to visualize btrfs snapshots and discover incremental changes between them.

## Features

- Browse btrfs subvolumes and their snapshots
- Vertical timeline view of snapshots (mobile-friendly)
- Compare any two snapshots to see file changes
- View unified diffs for text files
- Binary file detection (won't try to diff binaries)
- Mock mode for development/demo without a btrfs filesystem

## Getting Started

### Installation

```bash
npm install
```

### Development (Mock Mode)

Run with sample data - no btrfs filesystem required:

```bash
DEMO=true npm run dev
```

### Development (Real Mode)

Requires a btrfs filesystem and root privileges for btrfs commands:

```bash
sudo npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

```bash
npm run build
npm run start
```

## Docker

### Build

```bash
docker build -t btrfs-snapshot-viz .
```

### Run (Mock Mode)

```bash
docker run -p 3000:3000 btrfs-snapshot-viz
```

### Run (Real Mode)

To use with a real btrfs filesystem, you need to:
1. Run as privileged (for btrfs commands)
2. Mount your btrfs filesystem into the container

```bash
docker run -p 3000:3000 \
  --privileged \
  -e DEMO=false \
  -e BTRFS_ROOT=/mnt/btrfs \
  -v /path/to/your/btrfs:/mnt/btrfs:ro \
  btrfs-snapshot-viz
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEMO` | `true` in Docker, `false` otherwise | Use mock data instead of real btrfs commands |
| `BTRFS_ROOT` | `/` | Root path for btrfs subvolume commands |
| `BTRFS_DISPLAY_PATH` | `BTRFS_ROOT` | Path shown in copy commands (e.g., `/srv/dev-disk-by-uuid-...`) |
| `PORT` | `3000` | Server port |

## How It Works

1. **Snapshot Discovery**: Uses `btrfs subvolume list` to find all subvolumes and snapshots
2. **Change Detection**: Uses `btrfs send -p <old> <new> | btrfs receive --dump` to get incremental changes between snapshots
3. **File Diffing**: Reads files directly from snapshot paths and generates unified diffs

## Tech Stack

- React Router v7 (framework mode)
- React 19
- TypeScript
- Tailwind CSS
- Vite
