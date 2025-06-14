/**
 * URLフラグメントからパラメータを解析する
 * @param {Location} location - window.locationオブジェクト
 * @returns {{mode: string, salt: string|null, expdate: string|null, key: string, iv: string, epayload: string}|null}
*/
export function parseShareUrl(location) {
  const fragmentParams = new URLSearchParams(location.hash.substring(1));

  const key = fragmentParams.get('k');
  const iv = fragmentParams.get('i');
  if (!key || !iv) {
    return null;
  }

  const queryParams = new URLSearchParams(location.search);

  const modeMap = { s: 'simple', c: 'cloud', d: 'dynamic' };
  const modeCode = fragmentParams.get('m') || 's';

  return {
    mode: modeMap[modeCode] || 'simple',
    salt: fragmentParams.get('s') || null,
    expdate: fragmentParams.get('x') || null,
    key: key,
    iv: iv,
    epayload: queryParams.get('p') || '',
  };
}
