const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const env = {
  apiBase: API_BASE.replace(/\/$/, ''),
};
