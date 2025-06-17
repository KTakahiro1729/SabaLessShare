/**
 * URLフラグメントからパラメータを解析する
 * @param {Location} location - window.locationオブジェクト
 * @returns {{mode: string, salt: string|null, expdate: string|null, key: string, iv: string, epayload: string}|null}
*/
function getEpayloadByMode(mode, queryParams) {
  if (mode === 'cloud' || mode === 'dynamic') {
    return (
      queryParams.get('p') ||
      queryParams.get('epayload') ||
      queryParams.get('data') ||
      ''
    );
  }
  return (
    queryParams.get('data') ||
    queryParams.get('p') ||
    queryParams.get('epayload') ||
    ''
  );
}

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

  const mode = modeMap[rawMode] || 'simple';

  return {
    mode,
    salt: fragmentParams.get('s') || fragmentParams.get('salt') || null,
    expdate: fragmentParams.get('x') || fragmentParams.get('expdate') || null,
    key: key,
    iv: iv,
    epayload: getEpayloadByMode(mode, queryParams),
  };
}
