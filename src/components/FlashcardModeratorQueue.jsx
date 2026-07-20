import { useState } from "react";
import { getSupabaseBrowserClient } from "../supabaseClient.js";
export default function FlashcardModeratorQueue({ onError }) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState([]);
  const load = async () => {
    try {
      const c = await getSupabaseBrowserClient();
      const { data, error } = await c.rpc("flashcard_moderation_queue");
      if (error) throw error;
      setRows(data || []);
      setOpen(true);
    } catch (e) {
      onError(e.message);
    }
  };
  const act = async (id, status, clear = true) => {
    try {
      const c = await getSupabaseBrowserClient();
      const { error } = await c.rpc("moderate_flashcard_deck", {
        target_deck_id: id,
        new_status: status,
        clear_reports: clear,
      });
      if (error) throw error;
      load();
    } catch (e) {
      onError(e.message);
    }
  };
  return (
    <>
      <button onClick={load}>Flashcard Moderator Queue</button>
      {open && (
        <section className="flash-moderation">
          <header>
            <h2>Reported Shared Decks</h2>
            <button onClick={() => setOpen(false)}>Close</button>
          </header>
          {rows.length === 0 ? (
            <p>No reported decks.</p>
          ) : (
            rows.map((d) => (
              <article key={d.id}>
                <h3>{d.title}</h3>
                <p>
                  {d.course_name} · {d.status} · {d.report_count} unique reports
                </p>
                {d.reports.map((r, i) => (
                  <p key={i}>
                    <b>{r.reason}</b>
                    {r.details && ` — ${r.details}`}
                  </p>
                ))}
                <details>
                  <summary>Preview {d.cards.length} cards</summary>
                  {d.cards.map((c, i) => (
                    <div key={i}>
                      <b>{c.front}</b>
                      <p>{c.back}</p>
                    </div>
                  ))}
                </details>
                <footer>
                  <button onClick={() => act(d.id, "active")}>Restore</button>
                  <button onClick={() => act(d.id, "hidden", false)}>
                    Keep Hidden
                  </button>
                  <button onClick={() => act(d.id, "removed")}>Remove</button>
                </footer>
              </article>
            ))
          )}
        </section>
      )}
    </>
  );
}
