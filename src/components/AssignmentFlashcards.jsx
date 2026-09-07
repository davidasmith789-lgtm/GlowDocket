import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../supabaseClient.js";
export default function AssignmentFlashcards({ task = {}, userId, onOpenDeck = () => {} }) {
  const [rows, setRows] = useState([]);
  const load = useCallback(async () => {
    if (!task.id || !userId) return;
    try {
      const c = await getSupabaseBrowserClient();
      const { data: a, error } = await c.rpc("flashcard_assignment_decks", {
        target_assignment_id: String(task.id),
      });
      if (error) throw error;
      setRows(a || []);
    } catch (e) {
      console.error("Could not load linked flashcard decks:", e);
    }
  }, [task.id, userId]);
  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);
  if (!task.id || rows.length === 0) return null;

  return (
    <section className="assignment-flashcards">
      <h4>Linked Flashcard Decks</h4>
      {rows.map((d) => (
        <article key={d.id}>
          <b>{d.title}</b>
          <span>
            {d.card_count} cards · {d.understanding_percent}% understanding
          </span>
          {d.target_date && (
            <span>
              Target {new Date(`${d.target_date}T00:00`).toLocaleDateString()}
            </span>
          )}
          <button onClick={() => onOpenDeck(d.id)}>Study Deck</button>
        </article>
      ))}
    </section>
  );
}
