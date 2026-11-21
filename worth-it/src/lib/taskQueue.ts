export function createTaskQueue(concurrency: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  function drain() {
    while (running < concurrency && waiting.length) waiting.shift()!();
  }
  return {
    run<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
      return new Promise((resolve, reject) => {
        let started = false;
        const abort = () => {
          if (started) return; // Running tasks receive the same signal and clean up their resources.
          const index = waiting.indexOf(start);
          if (index >= 0) waiting.splice(index, 1);
          signal.removeEventListener('abort', abort);
          reject(new Error('Cancelled'));
        };
        const start = () => {
          started = true;
          running++;
          signal.removeEventListener('abort', abort);
          void Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(() => {
              running--;
              drain();
            });
        };
        if (signal.aborted) {
          abort();
          return;
        }
        signal.addEventListener('abort', abort, { once: true });
        waiting.push(start);
        drain();
      });
    },
  };
}
