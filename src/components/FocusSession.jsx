import { useEffect, useRef, useState } from "react";
import { formatFocusDuration } from "../focusSessionUtils.js";

export default function FocusSession({
  task,
  onClose,
  onComplete,
  onKeepInProgress,
  onToggleSubtask,
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [reduceEstimate, setReduceEstimate] = useState(false);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isRunning) return undefined;
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose(elapsedSeconds, reduceEstimate);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [elapsedSeconds, onClose, reduceEstimate]);

  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const completedSteps = subtasks.filter((step) => step.isDone).length;
  const notes = typeof task.notes === "string" ? task.notes.trim() : "";
  const hasSessionDetails = Boolean(notes) || subtasks.length > 0;

  return (
    <div className="focus-session-backdrop" role="presentation">
      <section className="focus-session" role="dialog" aria-modal="true" aria-labelledby="focus-session-title">
        <header className="focus-session-header">
          <div>
            <p className="eyebrow">Focus Session</p>
            <h2 id="focus-session-title">{task.title}</h2>
            <p>{task.course || "Other"}{task.priority ? ` · ${task.priority} priority` : ""}</p>
          </div>
          <button ref={closeButtonRef} type="button" className="focus-session-close" onClick={() => onClose(elapsedSeconds, reduceEstimate)} aria-label="Close focus session">×</button>
        </header>

        <div className="focus-session-timer" aria-live="off">
          <span>{isRunning ? "Focusing" : "Paused"}</span>
          <strong>{formatFocusDuration(elapsedSeconds)}</strong>
          <button type="button" className={`btn ${isRunning ? "btn-secondary" : "btn-primary"}`} onClick={() => setIsRunning((running) => !running)}>
            {isRunning ? "Pause" : "Resume"}
          </button>
        </div>

        {hasSessionDetails && (
          <div className="focus-session-body">
            {notes && <section><h3>Notes</h3><p className="focus-session-notes">{notes}</p></section>}
            {subtasks.length > 0 && <section>
              <div className="focus-session-section-heading">
                <h3>Checklist</h3>
                <span>{completedSteps} of {subtasks.length} complete</span>
              </div>
              <ul className="focus-session-checklist">
                {subtasks.map((step) => (
                  <li key={step.id} className={step.isDone ? "done" : ""}>
                    <label>
                      <input type="checkbox" checked={Boolean(step.isDone)} onChange={() => onToggleSubtask(step.id, elapsedSeconds, reduceEstimate)} />
                      <span>{step.text || "Untitled step"}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>}
          </div>
        )}

        <footer className="focus-session-footer">
          <label className="focus-session-estimate-option">
            <input type="checkbox" checked={reduceEstimate} onChange={(event) => setReduceEstimate(event.target.checked)} disabled={!Number(task.estimatedMinutes)} />
            <span>Subtract this session from the remaining estimate{Number(task.estimatedMinutes) ? ` (${task.estimatedMinutes} min)` : ""}</span>
          </label>
          <div>
            <button type="button" className="btn btn-secondary" onClick={() => onKeepInProgress(elapsedSeconds, reduceEstimate)}>Keep In Progress</button>
            <button type="button" className="btn btn-primary" onClick={() => onComplete(elapsedSeconds, reduceEstimate)}>Complete Assignment</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
