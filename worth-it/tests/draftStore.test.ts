import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftStore, type PollDraft } from '../src/lib/draftStore';
const draft: PollDraft = {
  requestId: 'post',
  itemName: 'Shoes',
  price: '999',
  question: 'Worth it?',
  storeLink: '',
  useCase: '',
  priority: '',
  budget: '',
  media: [{ id: 'image', kind: 'image', file: { uri: 'blob:temporary' } }],
};
function fixture() {
  let value: string | null = null;
  const files = new Set<string>();
  const deps = {
    async read() {
      return value;
    },
    async write(next: string) {
      value = next;
    },
    async remove() {
      value = null;
    },
    async persist(item: { id: string }) {
      files.add(item.id);
    },
    async open(item: { id: string }) {
      if (!files.has(item.id)) throw Error('missing');
      return { uri: 'blob:restored' };
    },
    async erase(item: { id: string }) {
      files.delete(item.id);
    },
  };
  return {
    deps,
    files,
    get value() {
      return value;
    },
  };
}
test('restoring a draft reopens durable media rather than expired blob URLs', async () => {
  const f = fixture();
  const store = createDraftStore(f.deps);
  await store.save(draft);
  assert.ok(!f.value!.includes('blob:temporary'));
  const restored = await createDraftStore(f.deps).load();
  assert.equal(restored!.draft.media[0].file.uri, 'blob:restored');
  assert.equal(restored!.draft.requestId, 'post');
  assert.equal(restored!.draft.price, '999');
});
test('missing media preserves text and gives a missing-file count', async () => {
  const f = fixture();
  await createDraftStore(f.deps).save(draft);
  f.files.clear();
  const restored = await createDraftStore(f.deps).load();
  assert.equal(restored!.missing, 1);
  assert.equal(restored!.draft.question, 'Worth it?');
});
test('clearing a draft waits for saves and removes only its durable draft files', async () => {
  const f = fixture();
  const store = createDraftStore(f.deps);
  const saving = store.save(draft);
  const clearing = store.clear();
  await Promise.all([saving, clearing]);
  assert.equal(f.value, null);
  assert.equal(f.files.size, 0);
});
test('storage failures do not turn an unsaved draft into success', async () => {
  const f = fixture();
  f.deps.write = async () => {
    throw Error('disk full');
  };
  await assert.rejects(createDraftStore(f.deps).save(draft), /disk full/);
});
