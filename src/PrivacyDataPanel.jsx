import { useEffect, useRef } from "react";

export function PrivacyDataPanel() {
  return (
    <div className="privacy-data-panel">
      <div className="privacy-data-summary">
        <article><strong>On this device</strong><p>Assignments, preferences, layouts, and attachment files are primarily kept in this browser. Removing this site’s browser data can remove that local information.</p></article>
        <article><strong>Optional cloud account</strong><p>When you use a cloud account, supported planner data syncs through GlowDocket’s account service. Attachments, notification permission, and reminder connections remain device-specific.</p></article>
        <article><strong>No usage or advertising tracking</strong><p>GlowDocket does not load usage analytics, marketing trackers, or advertising trackers.</p></article>
      </div>
    </div>
  );
}

export function PrivacyDataDialog({ open, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const trigger = document.activeElement;
    const dialog = dialogRef.current;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    window.requestAnimationFrame(() => dialog?.querySelector("[data-dialog-initial-focus]")?.focus());
    const handleKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll(focusableSelector)].filter((control) => control.getClientRects().length > 0);
      if (controls.length === 0) { event.preventDefault(); dialog.focus(); return; }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => trigger?.focus?.());
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="modal-backdrop privacy-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="edit-modal privacy-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-dialog-title" tabIndex="-1">
        <header className="edit-modal-header">
          <div><p className="eyebrow">Your choice</p><h2 id="privacy-dialog-title" tabIndex="-1" data-dialog-initial-focus>Privacy &amp; Data</h2></div>
          <button type="button" className="modal-close-button" onClick={onClose} aria-label="Close Privacy and Data">×</button>
        </header>
        <p className="privacy-dialog-intro">Where GlowDocket keeps data and which features are specific to this device.</p>
        <PrivacyDataPanel />
      </section>
    </div>
  );
}
