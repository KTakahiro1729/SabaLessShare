import { parseShareUrl } from '../src/url.js';

describe('parseShareUrl', () => {
  test('simple mode url with data parameter', () => {
    const url = new URL('https://example.com/?data=aaa#k=k&i=i&m=s');
    const result = parseShareUrl(url);
    expect(result.mode).toBe('simple');
    expect(result.epayload).toBe('aaa');
  });

  test('cloud mode url with p parameter', () => {
    const url = new URL('https://example.com/?p=bbb#k=k&i=i&m=c');
    const result = parseShareUrl(url);
    expect(result.mode).toBe('cloud');
    expect(result.epayload).toBe('bbb');
  });

  test('both parameters present chooses by mode', () => {
    const url1 = new URL('https://example.com/?data=aaa&p=bbb#k=k&i=i&m=s');
    const url2 = new URL('https://example.com/?data=aaa&p=bbb#k=k&i=i&m=c');
    const r1 = parseShareUrl(url1);
    const r2 = parseShareUrl(url2);
    expect(r1.epayload).toBe('aaa');
    expect(r2.epayload).toBe('bbb');
  });
});
