import "@testing-library/jest-dom";

/**
 * jsdom ships no object URLs, and anything that previews a picked file before uploading it needs
 * them — the chat's attachment preview, the avatar cropper. Stubbed rather than avoided, because
 * "show it before you send it" is exactly the behaviour worth testing.
 */
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
}

/** jsdom has no layout, so scrolling a list to the newest message is a no-op here. */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
