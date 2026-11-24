// "Leave page?" warning on the admin product form. The browser asks before leaving (a link, reload, closing
// the tab, or another form on the page such as a photo action) while the product form has unsaved changes.
// Submitting the product form itself never warns, and a successful save loads a fresh, clean page.
// Note: iOS Safari ignores beforeunload, so there is no warning on an iPhone.

/** The form's fields as a string, in document order; file inputs by file name. */
const snapshot = (form: HTMLFormElement) =>
  JSON.stringify(Array.from(new FormData(form), ([k, v]) => [k, typeof v === 'string' ? v : v.name]));

/**
 * Starts watching `form`. Call it after any script that rearranges the form on load (the sizes editor), so
 * the starting state is the one the user sees. `startDirty`: the page shows a refused save, so what is in
 * the form isn't saved yet.
 */
export function warnOnUnsaved(form: HTMLFormElement | null, { startDirty = false } = {}) {
  if (!form) return;
  const initial = snapshot(form);
  let submitting = false;
  form.addEventListener('submit', () => {
    submitting = true;
  });
  // Coming back with the Back button restores the page from the cache: the submit didn't happen there.
  window.addEventListener('pageshow', () => {
    submitting = false;
  });
  window.addEventListener('beforeunload', (event) => {
    if (submitting || !(startDirty || snapshot(form) !== initial)) return;
    event.preventDefault();
  });
}
