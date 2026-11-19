export function formatNumber(value: number | null, digits = 1): string {
  return value === null ? '—' : value.toFixed(digits);
}

export function signed(value: number | null): string {
  return value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '暂无';
}
