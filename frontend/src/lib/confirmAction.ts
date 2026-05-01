export function confirmCancel(message = 'Are you sure you want to cancel?'): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false);
  }

  return new Promise(resolve => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm';

    const panel = document.createElement('div');
    panel.className = 'w-full max-w-sm rounded-2xl border border-white/10 bg-[#17191e]/95 p-5 shadow-2xl shadow-black/40';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'cancel-confirm-title');
    panel.setAttribute('aria-describedby', 'cancel-confirm-message');

    const title = document.createElement('h2');
    title.id = 'cancel-confirm-title';
    title.className = 'text-lg font-semibold text-white';
    title.textContent = 'Cancel without saving?';

    const body = document.createElement('p');
    body.id = 'cancel-confirm-message';
    body.className = 'mt-2 text-sm leading-6 text-slate-400';
    body.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'mt-6 flex items-center justify-end gap-2';

    const stayButton = document.createElement('button');
    stayButton.type = 'button';
    stayButton.className = 'rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50';
    stayButton.textContent = 'No';

    const discardButton = document.createElement('button');
    discardButton.type = 'button';
    discardButton.className = 'rounded-xl bg-red-500/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/60';
    discardButton.textContent = 'Yes, cancel';

    const cleanup = (confirmed: boolean) => {
      document.removeEventListener('keydown', handleKeyDown);
      overlay.remove();
      previousActiveElement?.focus();
      resolve(confirmed);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cleanup(false);
      }
    };

    stayButton.addEventListener('click', () => cleanup(false));
    discardButton.addEventListener('click', () => cleanup(true));
    document.addEventListener('keydown', handleKeyDown);

    actions.append(stayButton, discardButton);
    panel.append(title, body, actions);
    overlay.append(panel);
    document.body.append(overlay);
    stayButton.focus();
  });
}
