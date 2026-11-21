import type { NewPollMedia, PollCategory } from "./types";
export type DraftMedia = NewPollMedia & { id: string };
export interface PollDraft {
  creationDraft?:import("./creationDraft").CreationDraft;
  requestId: string;
  itemName: string;
  price: string;
  question: string;
  storeLink: string;
  category?: PollCategory;
  useCase: string;
  priority: string;
  budget: string;
  media: DraftMedia[];
  productFields?: import("./productDetails").ProductFields;
}
interface Deps {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
  persist(item: DraftMedia): Promise<void>;
  open(item: DraftMedia): Promise<{ uri: string; release?: () => void }>;
  erase(item: DraftMedia): Promise<void>;
}
export function createDraftStore(deps: Deps) {
  let queue = Promise.resolve();
  let stored: DraftMedia[] = [];
  const persisted = new Set<string>();
  const releases: (() => void)[] = [];
  function serial<T>(action: () => Promise<T>): Promise<T> {
    const task = queue.then(action);
    queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  return {
    load: () =>
      serial(async () => {
        const value = await deps.read();
        if (!value) return null;
        const draft = JSON.parse(value) as PollDraft;
        if (!draft.requestId || !Array.isArray(draft.media))
          throw new Error("Could not restore the saved draft.");
        stored = draft.media;
        for (const item of stored) persisted.add(item.id);
        const media: DraftMedia[] = [];
        let missing = 0;
        for (const item of draft.media) {
          try {
            const handle = await deps.open(item);
            if (handle.release) releases.push(handle.release);
            media.push({
              ...item,
              file: { ...item.file, uri: handle.uri },
            } as DraftMedia);
          } catch {
            missing++;
          }
        }
        return { draft: { ...draft, media }, missing };
      }),
    save: (draft: PollDraft) =>
      serial(async () => {
        for (const item of draft.media)
          if (!persisted.has(item.id)) {
            await deps.persist(item);
            persisted.add(item.id);
          }
        // Persist only durable media identifiers, never expiring blob URLs or base64.
        const record = {
          ...draft,
          media: draft.media.map((item) => ({
            id: item.id,
            kind: item.kind,
            sourceUrl: item.sourceUrl,
            file: { uri: "", mimeType: item.file.mimeType },
          })),
        };
        await deps.write(JSON.stringify(record));
        const removed = stored.filter(
          (item) => !draft.media.some((next) => next.id === item.id),
        );
        stored = draft.media;
        await Promise.allSettled(removed.map(deps.erase));
      }),
    clear: () =>
      serial(async () => {
        await deps.remove();
        await Promise.allSettled(stored.map(deps.erase));
        stored = [];
        persisted.clear();
      }),
    release: () => {
      void queue.then(() => {
        for (const release of releases.splice(0)) release();
      });
    },
  };
}
