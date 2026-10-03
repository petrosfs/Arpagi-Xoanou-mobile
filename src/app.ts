// Απλός «δρομολογητής» οθονών: κάθε οθόνη ζωγραφίζει στο #app και επιστρέφει συνάρτηση καθαρισμού.
export type Cleanup = () => void;
export type Screen = (root: HTMLElement) => Cleanup | void;

let current: Cleanup | void;

export function go(screen: Screen) {
  const root = document.querySelector<HTMLElement>('#app')!;
  if (current) current();
  root.innerHTML = '';
  root.className = '';
  current = screen(root);
  window.scrollTo(0, 0);
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
