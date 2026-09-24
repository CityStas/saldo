const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatTime(timestamp: number): string {
  return timeFormatter.format(new Date(timestamp));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} мс`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} с`;
  return `${Math.round(seconds / 60)} мин`;
}
