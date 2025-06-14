/**
 * URLフラグメントからパラメータを解析する
 * @param {Location} location - window.locationオブジェクト
 * @returns {{mode: string, salt: string|null, expdate: string|null, key: string, iv: string, epayload: string}|null}
*/
export function parseShareUrl(location) {
  const fragmentParams = new URLSearchParams(location.hash.substring(1));

  const key = fragmentParams.get('k') || fragmentParams.get('key');
  const iv = fragmentParams.get('i') || fragmentParams.get('iv');
  if (!key || !iv) {
    return null;
  }

  const queryParams = new URLSearchParams(location.search);

  const modeMap = { s: 'simple', c: 'cloud', d: 'dynamic', simple: 'simple', cloud: 'cloud', dynamic: 'dynamic' };
  const rawMode = fragmentParams.get('m') || fragmentParams.get('mode') || 's';

  return {
    mode: modeMap[rawMode] || 'simple',
    salt: fragmentParams.get('s') || fragmentParams.get('salt') || null,
    expdate: fragmentParams.get('x') || fragmentParams.get('expdate') || null,
    key: key,
    iv: iv,
    epayload: queryParams.get('p') || queryParams.get('epayload') || '',
  };
}
