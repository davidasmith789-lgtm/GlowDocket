import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../supabaseClient.js";
const REASONS = [
  "Active test questions or answer key",
  "Copied or copyrighted material",
  "Incorrect or misleading content",
  "Personal information",
  "Harassment or harmful content",
  "Spam",
  "Other",
];
export default function FlashcardSharedActions({ deck, userId, onError }) {
  const [summary, setSummary] = useState({
      helpful_count: 0,
      not_helpful_count: 0,
      current_rating: null,
    }),
    [report, setReport] = useState(false),
    [busy, setBusy] = useState(false),
    dialog = useRef();
  useEffect(() => {
    getSupabaseBrowserClient()
      .then((c) =>
        c.rpc("flashcard_deck_rating_summary", { target_deck_id: deck.id }),
      )
      .then(({ data }) => data && setSummary(data))
      .catch(() => {});
  }, [deck.id]);
  useEffect(() => {
    if (!report) return;
    dialog.current?.focus();
    const key = (e) => e.key === "Escape" && setReport(false);
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [report]);
  const rate = async (rating) => {
    if (deck.owner_id === userId) return;
    const old = summary,
      current = old.current_rating === rating ? null : rating;
    setSummary({
      ...old,
      current_rating: current,
      helpful_count:
        Number(old.helpful_count) +
        (old.current_rating === "Helpful" ? -1 : 0) +
        (current === "Helpful" ? 1 : 0),
      not_helpful_count:
        Number(old.not_helpful_count) +
        (old.current_rating === "Not Helpful" ? -1 : 0) +
        (current === "Not Helpful" ? 1 : 0),
    });
    try {
      const c = await getSupabaseBrowserClient();
      const { data, error } = await c.rpc("rate_flashcard_deck", {
        target_deck_id: deck.id,
        new_rating: current,
      });
      if (error) throw error;
      setSummary(data);
    } catch (e) {
      setSummary(old);
      onError(e.message);
    }
  };
  const total =
      Number(summary.helpful_count) + Number(summary.not_helpful_count),
    percent =
      total >= 3
        ? Math.round((Number(summary.helpful_count) / total) * 100)
        : null;
  return (
    <div className="flash-shared-actions">
      <button
        disabled={deck.owner_id === userId}
        aria-pressed={summary.current_rating === "Helpful"}
        onClick={() => rate("Helpful")}
      >
        Helpful · {summary.helpful_count}
      </button>
      <button
        disabled={deck.owner_id === userId}
        aria-pressed={summary.current_rating === "Not Helpful"}
        onClick={() => rate("Not Helpful")}
      >
        Not Helpful · {summary.not_helpful_count}
      </button>
      {percent !== null && <span>{percent}% helpful</span>}
      {deck.owner_id !== userId && (
        <button onClick={() => setReport(true)}>Report</button>
      )}
      {report && (
        <div className="flash-modal">
          <form
            ref={dialog}
            tabIndex="-1"
            role="dialog"
            aria-modal="true"
            aria-labelledby="flash-report-title"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                const c = await getSupabaseBrowserClient();
                const { error } = await c.rpc("report_flashcard_deck", {
                  target_deck_id: deck.id,
                  report_reason: f.get("reason"),
                  report_details: f.get("details"),
                });
                if (error) throw error;
                setReport(false);
              } catch (x) {
                onError(x.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 id="flash-report-title">Report Shared Deck</h2>
            <label>
              Reason
              <select name="reason">
                {REASONS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Optional details
              <textarea name="details" maxLength="1000" />
            </label>
            <button disabled={busy}>Submit Report</button>
            <button type="button" onClick={() => setReport(false)}>
              Cancel
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
