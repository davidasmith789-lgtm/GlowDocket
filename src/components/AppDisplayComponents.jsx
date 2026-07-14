import { useState } from "react";

const stopControlDoubleClick = (event) => event.stopPropagation();

function toggleFromCollapseButton(event, toggle) {
  event.stopPropagation();
  if (event.detail > 1) return;
  toggle();
}

function toggleFromHeaderDoubleClick(event, toggle) {
  if (event.target.closest("button, input, select, textarea, a, summary, details")) return;
  event.preventDefault();
  toggle();
}

export function SettingsCard({ title, description, className = "", children }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <section className={`settings-section ${className}`.trim()}>
      <div className="settings-collapse-header double-click-collapse-header" onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setIsOpen((open) => !open))} title="Use the button to expand or minimize">
        <h4>{title}</h4>
        <button type="button" className="settings-collapse-button" onClick={(event) => toggleFromCollapseButton(event, () => setIsOpen((open) => !open))} onDoubleClick={stopControlDoubleClick} aria-expanded={isOpen} aria-label={`${isOpen ? "Shrink" : "Enlarge"} ${title}`} title={`${isOpen ? "Shrink" : "Enlarge"} ${title}`}>{isOpen ? "−" : "+"}</button>
      </div>
      {isOpen && <div className="settings-collapsible-content">{description && <p className="hint-text settings-card-description">{description}</p>}{children}</div>}
    </section>
  );
}

export function PersonalizationTip({ title, category, children, forceOpen = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const expanded = forceOpen || isOpen;
  const contentId = `personalization-tip-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <article className="personalization-tip-card">
      <div className="personalization-tip-header double-click-collapse-header" onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setIsOpen((open) => !open))} title="Double-click to enlarge or minimize">
        <span className="personalization-tip-heading"><small className="personalization-tip-category">{category}</small><strong>{title}</strong></span>
        <button type="button" className="settings-collapse-button settings-collapse-button-small" onClick={(event) => toggleFromCollapseButton(event, () => setIsOpen((open) => !open))} onDoubleClick={stopControlDoubleClick} aria-expanded={expanded} aria-controls={contentId} aria-label={`${expanded ? "Minimize" : "Enlarge"} ${title}`}>{expanded ? "−" : "+"}</button>
      </div>
      {expanded && <p id={contentId}>{children}</p>}
    </article>
  );
}

export function PasswordEyeIcon({ hidden }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.75" />{hidden ? <path d="m4 4 16 16" /> : null}</svg>;
}

export function AssignmentCountdown({ title, label, tone, extraClassName = "" }) {
  if (!label) return null;
  return <p className={`assignment-countdown countdown-${tone} ${extraClassName}`.trim()} aria-label={`Time until ${title} is due: ${label}`}>{label}</p>;
}

export function SubtaskProgressLine({ label, extraClassName = "" }) {
  if (!label) return null;
  return <p className={`subtask-progress-line ${extraClassName}`.trim()}>{label}</p>;
}

export function MobilePageTitle({ eyebrow, title, copy }) {
  return <header className="mobile-app-page-heading"><p>{eyebrow}</p><h2>{title}</h2>{copy && <span>{copy}</span>}</header>;
}
