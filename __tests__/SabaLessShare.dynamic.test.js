import { jest } from '@jest/globals';

jest.unstable_mockModule('argon2-browser', () => ({
  default: {
    hash: async ({ pass, salt }) => {
      const data = new Uint8Array([
        ...new TextEncoder().encode(pass),
        ...new Uint8Array(salt)
      ]);
      const hash = await crypto.subtle.digest('SHA-256', data);
      return { hash: new Uint8Array(hash) };
    },
    ArgonType: { Argon2id: 2 }
  }
}));

const { createDynamicLink, receiveDynamicData, updateDynamicLink } = await import('../src/dynamic.js');

function createMockAdapter() {
  const dataMap = new Map();
  const pointerMap = new Map();
  return {
    create: jest.fn(async (data) => {
      const id = crypto.randomUUID();
      if (data.ciphertext) {
        dataMap.set(id, data);
      } else {
        pointerMap.set(id, data);
      }
      return id;
    }),
    read: jest.fn(async (id) => {
      if (dataMap.has(id)) return dataMap.get(id);
      if (pointerMap.has(id)) return pointerMap.get(id);
      throw new Error('Not found');
    }),
    update: jest.fn(async (id, newData) => {
      pointerMap.set(id, newData);
    })
  };
}

describe('Dynamic Sharing API', () => {
  it('creates and receives dynamic data', async () => {
    const adapter = createMockAdapter();
    const data = new TextEncoder().encode('dynamic');

    const result = await createDynamicLink({ data: data.buffer, adapter });

    expect(adapter.create).toHaveBeenCalledTimes(2);

    const location = new URL(result.shareLink);
    const received = await receiveDynamicData({ location, adapter, passwordPromptHandler: async () => null });
    expect(new TextDecoder().decode(received)).toBe('dynamic');
  });

  it('supports password protected links', async () => {
    const adapter = createMockAdapter();
    const password = 'secret';
    const data = new TextEncoder().encode('secure data');

    const result = await createDynamicLink({ data: data.buffer, adapter, password });

    const location = new URL(result.shareLink);
    const received = await receiveDynamicData({ location, adapter, passwordPromptHandler: async () => password });
    expect(new TextDecoder().decode(received)).toBe('secure data');
  });

  it('updates dynamic link data', async () => {
    const adapter = createMockAdapter();
    const password = 'pw';
    const data = new TextEncoder().encode('initial');
    const updated = new TextEncoder().encode('updated');

    const result = await createDynamicLink({ data: data.buffer, adapter, password });

    await updateDynamicLink({
      pointerFileId: result.pointerFileId,
      newData: updated.buffer,
      key: result.key,
      salt: result.salt,
      password,
      adapter
    });

    const location = new URL(result.shareLink);
    const received = await receiveDynamicData({ location, adapter, passwordPromptHandler: async () => password });
    expect(new TextDecoder().decode(received)).toBe('updated');
    expect(adapter.update).toHaveBeenCalledTimes(1);
  });
});
