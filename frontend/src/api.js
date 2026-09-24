// Frontend API Client for FastAPI backend without any broker credentials

const BASE_URL = '';

export async function startScan(params = {}) {
  const res = await fetch(`${BASE_URL}/api/scanner/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeframe: params.timeframe || '10m',
      risk_reward: parseFloat(params.risk_reward) || 2.0,
      volume_multiplier: parseFloat(params.volume_multiplier) || 1.5,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Failed to start scanner');
  }
  return data;
}

export async function stopScan() {
  const res = await fetch(`${BASE_URL}/api/scanner/stop`, {
    method: 'POST',
  });
  return res.json();
}

export async function fetchScanStatus() {
  const res = await fetch(`${BASE_URL}/api/scanner/status`);
  if (!res.ok) {
    throw new Error('Failed to fetch scan status');
  }
  return res.json();
}

export async function fetchScanProgress() {
  const res = await fetch(`${BASE_URL}/api/scanner/progress`);
  if (!res.ok) {
    throw new Error('Failed to fetch scan progress');
  }
  return res.json();
}

export async function fetchScanResults(params = {}) {
  const query = new URLSearchParams();
  if (params.status && params.status !== 'ALL') {
    query.set('status', params.status);
  }
  if (params.search) {
    query.set('search', params.search);
  }

  const url = `${BASE_URL}/api/scanner/results${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch scan results');
  }
  return res.json();
}

export async function fetchMarketStatus() {
  const res = await fetch(`${BASE_URL}/api/market/status`);
  if (!res.ok) {
    throw new Error('Failed to fetch market status');
  }
  return res.json();
}

export async function fetchUniverse() {
  const res = await fetch(`${BASE_URL}/api/universe`);
  if (!res.ok) {
    throw new Error('Failed to fetch stock universe');
  }
  return res.json();
}
