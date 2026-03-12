export async function fetchJsonStrict(url) {
  const response = await fetch(url);
  const text = await response.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON (${response.status}) ${url}: ${text.slice(0, 220)}`);
  }

  if (!response.ok || json?.ok === false) {
    throw new Error(json?.error || json?.message || `HTTP ${response.status}`);
  }

  return json;
}
