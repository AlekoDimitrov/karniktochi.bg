// The sizes editor on the admin product form. Without this script the form still works: it shows two spare
// empty rows and an "Order" number per row. With it, spare rows give way to an "Add size" button, rows move
// with Move up / Move down, and the order numbers are filled in from the row order on submit.

export function enhanceSizes(form: HTMLFormElement | null) {
  const list = form?.querySelector<HTMLOListElement>('[data-sizes]');
  const template = form?.querySelector<HTMLTemplateElement>('[data-size-template]');
  const add = form?.querySelector<HTMLButtonElement>('[data-add-size]');
  if (!form || !list || !template || !add) return;

  let next = Number(list.dataset.nextIndex) || list.children.length;
  const rows = () => Array.from(list.querySelectorAll<HTMLLIElement>(':scope > [data-size]'));
  const isEmpty = (row: HTMLElement) =>
    Array.from(row.querySelectorAll<HTMLInputElement>('input:not([type=hidden]):not([type=checkbox])'))
      .filter((i) => !i.closest('[data-pos-field]'))
      .every((i) => !i.value.trim());

  // Spare empty rows are for use without JavaScript; keep one only if there is no row at all.
  for (const row of rows()) if (row.hasAttribute('data-new') && isEmpty(row) && rows().length > 1) row.remove();

  for (const el of form.querySelectorAll<HTMLElement>('[data-pos-field]')) el.hidden = true;
  for (const el of form.querySelectorAll<HTMLElement>('[data-move], [data-remove-new]')) el.hidden = false;
  add.hidden = false;

  add.addEventListener('click', () => {
    const row = template.content.firstElementChild!.cloneNode(true) as HTMLLIElement;
    for (const input of row.querySelectorAll<HTMLInputElement>('[data-name]')) input.name = `v.${next}.${input.dataset.name}`;
    next++;
    for (const el of row.querySelectorAll<HTMLElement>('[data-pos-field]')) el.hidden = true;
    list.appendChild(row);
    row.querySelector<HTMLInputElement>('input[name$=".option"]')?.focus();
  });

  list.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button');
    const row = button?.closest<HTMLLIElement>('[data-size]');
    if (!button || !row) return;
    if (button.hasAttribute('data-up') && row.previousElementSibling) {
      list.insertBefore(row, row.previousElementSibling);
      button.focus();
    } else if (button.hasAttribute('data-down') && row.nextElementSibling) {
      list.insertBefore(row.nextElementSibling, row);
      button.focus();
    } else if (button.hasAttribute('data-remove-new')) {
      const focusAfter = row.nextElementSibling ?? row.previousElementSibling;
      row.remove();
      (focusAfter?.querySelector('input:not([type=hidden])') as HTMLElement | null ?? add).focus();
    }
  });

  // The server orders sizes by these numbers.
  form.addEventListener('submit', () => {
    rows().forEach((row, i) => {
      const pos = row.querySelector<HTMLInputElement>('input[name$=".pos"]');
      if (pos) pos.value = String(i + 1);
    });
  });
}
