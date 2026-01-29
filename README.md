# BTRFS Snapshot Visualizer

A web-based tool to visualize btrfs snapshots and discover incremental changes between them.

## Features

- **Browse btrfs subvolumes and their snapshots**
- **Vertical timeline view of snapshots** (mobile-friendly)
- **Compare any two snapshots** to see file changes
- **View unified diffs** for text files
- **GitHub-like file explorer** - browse files at any snapshot point in time
- **Complete file history tracking** - see when files were created, modified, deleted, or renamed
- **Size evolution tracking** - visualize how files grow/shrink over time
- **Incremental indexing** - fast SQLite-based file history with auto-indexing
- **Binary file detection** (won't try to diff binaries)
- **Mock mode** for development/demo without a btrfs filesystem

### Navigation Flow

1. **Timeline** → Browse files in any snapshot
2. **Compare** → See changes between snapshots → View file history
3. **File Browser** → Navigate directories → View file history
4. **File History** → Complete timeline → Compare specific snapshots
5. All views interconnected for seamless exploration

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

### Docker Compose (Recommended)

The easiest way to run with persistent database:

**Demo Mode** (mock data, no btrfs required):
```bash
docker-compose up
```

Access at `http://localhost:3000`

**Production Mode** (with real btrfs filesystem):

Edit `docker-compose.yml` and uncomment the `btrfs-viz-production` service, then:

```bash
docker-compose up btrfs-viz-production
```

The database will persist in `./data/file-history.db`.

### Manual Docker Usage

#### Build

```bash
docker build -t btrfs-snapshot-viz .
```

#### Run (Mock Mode)

```bash
docker run -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  btrfs-snapshot-viz
```

#### Run (Real Mode)

To use with a real btrfs filesystem:

```bash
docker run -p 3000:3000 \
  --privileged \
  -e DEMO=false \
  -e BTRFS_ROOT=/mnt/btrfs \
  -v /path/to/your/btrfs:/mnt/btrfs:ro \
  -v $(pwd)/data:/app/data \
  btrfs-snapshot-viz
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEMO` | `true` in Docker, `false` otherwise | Use mock data instead of real btrfs commands |
| `BTRFS_ROOT` | `/` | Root path for btrfs subvolume commands |
| `BTRFS_DISPLAY_PATH` | `BTRFS_ROOT` | Path shown in copy commands (e.g., `/srv/dev-disk-by-uuid-...`) |
| `FILE_HISTORY_DB` | `./data/file-history.db` | Path to SQLite database for file history index |
| `PORT` | `3000` | Server port |

## File History Indexing

The file history feature uses an SQLite database to track all file changes across snapshots.

### Auto-Indexing

Index the latest snapshot automatically (e.g., after creating a new snapshot):

```bash
npm run index-snapshot /@snapshots
```

You can add this to your snapshot creation script:

```bash
#!/bin/bash
btrfs subvolume snapshot /path/to/source /@snapshots/$(date +%Y-%m-%d_%H:%M:%S)
npm run index-snapshot /@snapshots
```

### Manual Index Management

- **First-time build**: The UI will prompt you to build the index when you first view a subvolume
- **Rebuild index**: Use the settings menu (⚙️) on the snapshots page to force rebuild
- **Check status**: The index status banner shows progress automatically

The index builds incrementally - it only processes new snapshots, making updates very fast.

## How It Works

1. **Snapshot Discovery**: Uses `btrfs subvolume list` to find all subvolumes and snapshots
2. **Change Detection**: Uses `btrfs send -p <old> <new> | btrfs receive --dump` to get incremental changes between snapshots
3. **File Diffing**: Reads files directly from snapshot paths and generates unified diffs
4. **File History**: Indexes all file changes into SQLite database for fast timeline queries and rename tracking

## Tech Stack

- React Router v7 (framework mode)
- React 19
- TypeScript
- Tailwind CSS
- Vite
- SQLite (better-sqlite3) for file history indexing
