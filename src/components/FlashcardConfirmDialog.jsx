import { useEffect, useRef } from "react";
export default function FlashcardConfirmDialog({ request, onClose }) {
  const ref = useRef(),
    restore = useRef();
  useEffect(() => {
    if (!request) return;
    restore.current = document.activeElement;
    requestAnimationFrame(() => ref.current?.querySelector("button")?.focus());
    const key = (e) => {
      if (e.key === "Escape") onClose(false);
      if (e.key === "Tab") {
        const buttons = [...ref.current.querySelectorAll("button")],
          first = buttons[0],
          last = buttons.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    addEventListener("keydown", key);
    return () => {
      removeEventListener("keydown", key);
      restore.current?.focus?.();
    };
  }, [request, onClose]);
  if (!request) return null;
  return (
    <div className="flash-modal">
      <section
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="flash-confirm-title"
        aria-describedby="flash-confirm-description"
      >
        <h2 id="flash-confirm-title">{request.title}</h2>
        <p id="flash-confirm-description">{request.description}</p>
        <button onClick={() => onClose(true)}>
          {request.confirmLabel || "Confirm"}
        </button>
        <button onClick={() => onClose(false)}>Cancel</button>
      </section>
    </div>
  );
}
