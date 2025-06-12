/**
 * URLフラグメントからパラメータを解析する
 * @param {Location} location - window.locationオブジェクト
 * @returns {{mode: string, salt: string|null, expdate: string|null, key: string, iv: string, payloadUrl: string}|null}
 */
export function parseShareUrl(location) {
  const fragmentParams = new URLSearchParams(location.hash.substring(1));

  const key = fragmentParams.get('key');
  const iv = fragmentParams.get('iv');
  if (!key || !iv) {
    return null;
  }

  return {
    mode: fragmentParams.get('mode') || 'simple',
    salt: fragmentParams.get('salt') || null,
    expdate: fragmentParams.get('expdate') || null,
    key: key,
    iv: iv,
    payloadUrl: location.href.split('#')[0],
  };
}
