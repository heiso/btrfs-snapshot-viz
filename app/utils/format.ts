/**
 * Format bytes to human-readable size string
 *
 * @param bytes - Size in bytes
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted size string (e.g., "1.2 KB", "234 MB", "15 GB")
 *
 * @example
 * formatSize(1024) // "1.0 KB"
 * formatSize(1536) // "1.5 KB"
 * formatSize(1048576) // "1.0 MB"
 * formatSize(5242880) // "5.0 MB"
 * formatSize(1073741824) // "1.0 GB"
 */
export function formatSize(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return '-' + formatSize(-bytes, decimals);

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  // Determine which unit to use
  if (bytes < k) {
    return `${bytes} B`;
  }

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  return `${size.toFixed(decimals)} ${sizes[i]}`;
}

/**
 * Format bytes to human-readable size with smart precision
 * Uses more decimal places for smaller values
 *
 * @param bytes - Size in bytes
 * @returns Formatted size string with smart precision
 *
 * @example
 * formatSizeSmart(512) // "512 B"
 * formatSizeSmart(1536) // "1.50 KB"
 * formatSizeSmart(1048576) // "1.0 MB"
 * formatSizeSmart(5368709120) // "5.0 GB"
 */
export function formatSizeSmart(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return '-' + formatSizeSmart(-bytes);

  const k = 1024;

  if (bytes < k) {
    return `${bytes} B`;
  }
  if (bytes < k * k) {
    // KB - show 2 decimals for precision
    return `${(bytes / k).toFixed(2)} KB`;
  }
  if (bytes < k * k * k) {
    // MB - show 1 decimal
    return `${(bytes / (k * k)).toFixed(1)} MB`;
  }
  // GB and above - show 1 decimal
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format a date to a readable string
 *
 * @param date - Date to format
 * @returns Formatted date string
 *
 * @example
 * formatDate(new Date('2026-01-29T12:00:00')) // "Jan 29, 2026 12:00 PM"
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

/**
 * Format a date to a relative time string (e.g., "2 days ago")
 *
 * @param date - Date to format
 * @returns Relative time string
 *
 * @example
 * formatRelativeTime(new Date(Date.now() - 3600000)) // "1 hour ago"
 * formatRelativeTime(new Date(Date.now() - 86400000)) // "1 day ago"
 */
export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

/**
 * Format a number with thousand separators
 *
 * @param num - Number to format
 * @returns Formatted number string
 *
 * @example
 * formatNumber(1234567) // "1,234,567"
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Parse human-readable size to bytes
 *
 * @param sizeStr - Size string (e.g., "1.5 KB", "10 MB")
 * @returns Size in bytes, or null if invalid
 *
 * @example
 * parseSize("1 KB") // 1024
 * parseSize("1.5 MB") // 1572864
 * parseSize("invalid") // null
 */
export function parseSize(sizeStr: string): number | null {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|PB)$/i);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  const multipliers: Record<string, number> = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024,
    'TB': 1024 * 1024 * 1024 * 1024,
    'PB': 1024 * 1024 * 1024 * 1024 * 1024
  };

  return value * (multipliers[unit] || 1);
}
