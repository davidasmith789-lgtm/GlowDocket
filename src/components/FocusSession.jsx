import { useEffect, useMemo, useRef, useState } from "react";
import { formatFocusDuration, getFocusGoalMinutes, getFocusProgress } from "../focusSessionUtils.js";

const GOAL_PRESETS = [15, 25, 45];
const BREAK_SECONDS = 5 * 60;

export default function FocusSession({ task, onClose, onComplete, onKeepInProgress, onToggleSubtask }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [goalMinutes, setGoalMinutes] = useState(() => getFocusGoalMinutes(task.estimatedMinutes));
  const [intention, setIntention] = useState("");
  const [reduceEstimate, setReduceEstimate] = useState(false);
  const [mode, setMode] = useState("focus");
  const [breakSeconds, setBreakSeconds] = useState(BREAK_SECONDS);
  const [goalReached, setGoalReached] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const intentionRef = useRef(null);
  const sessionRef = useRef(null);
  const goalSeconds = goalMinutes * 60;
  const remainingSeconds = Math.max(0, goalSeconds - elapsedSeconds);
  const progress = getFocusProgress(elapsedSeconds, goalMinutes);

  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const completedSteps = subtasks.filter((step) => step.isDone).length;
  const notes = typeof task.notes === "string" ? task.notes.trim() : "";
  const hasSessionDetails = Boolean(notes) || subtasks.length > 0;
  const estimate = Number(task.estimatedMinutes) || 0;
  const goalOptions = useMemo(() => [...new Set([...GOAL_PRESETS, ...(estimate > 0 ? [getFocusGoalMinutes(estimate)] : [])])].sort((a, b) => a - b), [estimate]);

  useEffect(() => { intentionRef.current?.focus(); }, []);

  useEffect(() => {
    if (!isRunning) return undefined;
    const timer = window.setInterval(() => {
      if (mode === "break") {
        setBreakSeconds((seconds) => {
          if (seconds <= 1) {
            setMode("focus");
            setIsRunning(false);
            return BREAK_SECONDS;
          }
          return seconds - 1;
        });
      } else {
        setElapsedSeconds((seconds) => {
          const nextSeconds = seconds + 1;
          if (nextSeconds >= goalSeconds) {
            setGoalReached(true);
            setIsRunning(false);
          }
          return nextSeconds;
        });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [goalSeconds, isRunning, mode]);

  useEffect(() => {
    const originalTitle = document.title;
    document.title = `${mode === "break" ? "Break" : isRunning ? "Focus" : "Paused"} ${formatFocusDuration(mode === "break" ? breakSeconds : remainingSeconds)} · ${task.title}`;
    return () => { document.title = originalTitle; };
  }, [breakSeconds, isRunning, mode, remainingSeconds, task.title]);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const requestClose = () => {
    if (elapsedSeconds >= 60 && !confirmExit) {
      setIsRunning(false);
      setConfirmExit(true);
      return;
    }
    onClose(elapsedSeconds, reduceEstimate);
  };

  const toggleFocusTimer = () => {
    if (goalReached) {
      setGoalMinutes((minutes) => minutes + 5);
      setGoalReached(false);
      setIsRunning(true);
      return;
    }
    setIsRunning((running) => !running);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName);
      if (event.key === "Escape") requestClose();
      if (!typing && event.code === "Space") {
        event.preventDefault();
        toggleFocusTimer();
      }
      if (!typing && event.key.toLowerCase() === "b") {
        setMode((current) => current === "focus" ? "break" : "focus");
        setIsRunning(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const chooseGoal = (minutes) => {
    setGoalMinutes(minutes);
    const reached = elapsedSeconds >= minutes * 60;
    setGoalReached(reached);
    if (reached) setIsRunning(false);
  };

  const startBreak = () => {
    setMode("break");
    setBreakSeconds(BREAK_SECONDS);
    setIsRunning(true);
    setGoalReached(false);
  };

  const returnToFocus = () => {
    setMode("focus");
    setIsRunning(false);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await sessionRef.current?.requestFullscreen?.();
    } catch {
      setIsFullscreen(false);
    }
  };

  return (
    <div className="focus-session-backdrop" role="presentation">
      <section ref={sessionRef} className={`focus-session is-${mode}`} role="dialog" aria-modal="true" aria-labelledby="focus-session-title">
        <header className="focus-session-header">
          <div>
            <p className="eyebrow">{mode === "break" ? "Recharge Break" : "Focus Session"}</p>
            <h2 id="focus-session-title">{task.title}</h2>
            <p>{task.course || "Other"}{task.priority ? ` · ${task.priority} priority` : ""}{estimate ? ` · ${estimate} min remaining` : ""}</p>
          </div>
          <div className="focus-session-window-actions">
            <button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{isFullscreen ? "↙" : "↗"}</button>
            <button type="button" onClick={requestClose} aria-label="Close focus session">×</button>
          </div>
        </header>

        <div className="focus-session-timer" aria-live="off">
          <div className="focus-session-progress" style={{ "--focus-progress": `${mode === "break" ? ((BREAK_SECONDS - breakSeconds) / BREAK_SECONDS) * 100 : progress}%` }}>
            <div>
              <span>{mode === "break" ? "Break left" : goalReached ? "Goal reached" : isRunning ? "Time left" : "Paused"}</span>
              <strong>{formatFocusDuration(mode === "break" ? breakSeconds : remainingSeconds)}</strong>
              {mode === "focus" && <small>{formatFocusDuration(elapsedSeconds)} focused</small>}
            </div>
          </div>

          {mode === "focus" ? <>
            <div className="focus-session-goals" aria-label="Focus goal">
              {goalOptions.map((minutes) => <button type="button" key={minutes} className={goalMinutes === minutes ? "active" : ""} onClick={() => chooseGoal(minutes)}>{minutes} min</button>)}
            </div>
            <label className="focus-session-intention">
              <span>What will you finish?</span>
              <input ref={intentionRef} value={intention} maxLength={100} onChange={(event) => setIntention(event.target.value)} placeholder="Set one clear intention for this session" />
            </label>
            <div className="focus-session-timer-actions">
              <button type="button" className={`btn ${isRunning ? "btn-secondary" : "btn-primary"}`} onClick={toggleFocusTimer}>{isRunning ? "Pause" : goalReached ? "Keep Focusing" : "Resume"}</button>
              <button type="button" className="btn btn-secondary" onClick={startBreak}>Take a 5 min Break</button>
            </div>
          </> : <div className="focus-session-timer-actions">
            <button type="button" className={`btn ${isRunning ? "btn-secondary" : "btn-primary"}`} onClick={() => setIsRunning((running) => !running)}>{isRunning ? "Pause Break" : "Resume Break"}</button>
            <button type="button" className="btn btn-primary" onClick={returnToFocus}>Return to Focus</button>
          </div>}
          <small className="focus-session-shortcuts">Space: pause/resume · B: break · Esc: exit</small>
        </div>

        {goalReached && mode === "focus" && <aside className="focus-session-milestone" role="status"><div><strong>Focus goal complete</strong><span>{intention ? `You set out to: ${intention}` : `You focused for ${goalMinutes} minutes.`}</span></div><button type="button" className="btn btn-secondary" onClick={() => { setGoalMinutes((minutes) => minutes + 5); setGoalReached(false); setIsRunning(true); }}>Add 5 min</button><button type="button" className="btn btn-primary" onClick={startBreak}>Take a Break</button></aside>}

        {hasSessionDetails && mode === "focus" && <div className="focus-session-body">
          {notes && <section><h3>Notes</h3><p className="focus-session-notes">{notes}</p></section>}
          {subtasks.length > 0 && <section><div className="focus-session-section-heading"><h3>Checklist</h3><span>{completedSteps} of {subtasks.length} complete</span></div><div className="focus-session-checklist-progress" aria-hidden="true"><span style={{ width: `${(completedSteps / subtasks.length) * 100}%` }} /></div><ul className="focus-session-checklist">{subtasks.map((step) => <li key={step.id} className={step.isDone ? "done" : ""}><label><input type="checkbox" checked={Boolean(step.isDone)} onChange={() => onToggleSubtask(step.id, elapsedSeconds, reduceEstimate)} /><span>{step.text || "Untitled step"}</span></label></li>)}</ul></section>}
        </div>}

        <footer className="focus-session-footer">
          <div className="focus-session-session-stats"><span><strong>{formatFocusDuration(elapsedSeconds)}</strong> this session</span><span><strong>{Number(task.focusMinutesSpent) || 0} min</strong> previously focused</span></div>
          <label className="focus-session-estimate-option"><input type="checkbox" checked={reduceEstimate} onChange={(event) => setReduceEstimate(event.target.checked)} disabled={!estimate} /><span>Subtract this session from the remaining estimate{estimate ? ` (${estimate} min)` : ""}</span></label>
          <div className="focus-session-finish-actions"><button type="button" className="btn btn-secondary" onClick={() => onKeepInProgress(elapsedSeconds, reduceEstimate)}>Keep In Progress</button><button type="button" className="btn btn-primary" onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); onComplete(elapsedSeconds, reduceEstimate, { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }); }}>Complete Assignment</button></div>
        </footer>

        {confirmExit && <div className="focus-session-exit-confirm" role="alertdialog" aria-modal="true" aria-labelledby="focus-exit-title"><div><h3 id="focus-exit-title">End this focus session?</h3><p>Your {formatFocusDuration(elapsedSeconds)} of focus time will be saved and the assignment will stay In Progress.</p><div><button type="button" className="btn btn-secondary" onClick={() => { setConfirmExit(false); setIsRunning(true); }}>Keep Focusing</button><button type="button" className="btn btn-primary" onClick={() => onClose(elapsedSeconds, reduceEstimate)}>Save and Exit</button></div></div></div>}
      </section>
    </div>
  );
}
