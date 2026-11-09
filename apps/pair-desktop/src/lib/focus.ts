/**
 * Focuses an input as soon as it appears. `autofocus` only works on page load, so inputs that
 * appear on click (the Ask box, a reply, a reject reason) would leave focus in the note, and
 * typing would replace the selected passage.
 */
export function focusOnMount(el: HTMLElement) {
  requestAnimationFrame(() => el.focus({ preventScroll: true }));
}
