export function connectWallet(setVisible: (v: boolean) => void): void {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phantomInjected = !!(window as any).phantom?.solana?.isPhantom || !!(window as any).solana?.isPhantom;

  if (isMobile && !phantomInjected) {
    const url = encodeURIComponent(window.location.href);
    const ref = encodeURIComponent(window.location.origin);
    window.location.href = `https://phantom.app/ul/browse/${url}?ref=${ref}`;
    return;
  }

  setVisible(true);
}
