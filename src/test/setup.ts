// jsdom lacks a few browser APIs the UI relies on.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub;
window.scrollTo = (): void => {};
