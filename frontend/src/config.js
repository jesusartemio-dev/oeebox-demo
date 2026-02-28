export const API_URL = import.meta.env.VITE_API_URL || '';

export const WS_URL = (() => {
  if (import.meta.env.VITE_API_URL) {
    const url = new URL(import.meta.env.VITE_API_URL);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.host}/ws`;
  }
  return `ws://${window.location.host}/ws`;
})();
