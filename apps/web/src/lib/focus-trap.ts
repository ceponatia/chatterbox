export function trapTabKey(
  event: KeyboardEvent,
  focusable: HTMLElement[],
  first?: HTMLElement,
  last?: HTMLElement,
): void {
  if (event.key !== "Tab" || focusable.length === 0) return;
  event.preventDefault();
  const fallback = first ?? last;
  if (!fallback) return;
  const target = event.shiftKey ? (last ?? fallback) : (first ?? fallback);
  target.focus();
}
