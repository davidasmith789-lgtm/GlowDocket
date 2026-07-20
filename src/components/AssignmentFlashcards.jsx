import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../supabaseClient.js";
import FlashcardConfirmDialog from "./FlashcardConfirmDialog.jsx";
export default function AssignmentFlashcards({ task, userId, onOpenDeck }) {
  const [rows, setRows] = useState([]),
    [owned, setOwned] = useState([]),
    [message, setMessage] = useState(""),
    [confirmRequest, setConfirmRequest] = useState(null);
  const load = useCallback(async () => {
    try {
      const c = await getSupabaseBrowserClient();
      const [{ data: a, error }, { data: b }] = await Promise.all([
        c.rpc("flashcard_assignment_decks", {
          target_assignment_id: String(task.id),
        }),
        c
          .from("flashcard_decks")
          .select("id,title")
          .eq("owner_id", userId)
          .is("linked_assignment_id", null),
      ]);
      if (error) throw error;
      setRows(a || []);
      setOwned(b || []);
    } catch (e) {
      setMessage(e.message);
    }
  }, [task.id, userId]);
  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);
  const link = async (id) => {
    if (!id) return;
    const c = await getSupabaseBrowserClient();
    const { error } = await c.rpc("link_flashcard_deck_assignment", {
      target_deck_id: id,
      target_assignment_id: String(task.id),
    });
    if (error) setMessage(error.message);
    else load();
  };
  const create = async (useDue = false) => {
    const c = await getSupabaseBrowserClient();
    const { data, error } = await c.rpc("save_flashcard_deck", {
      deck_payload: {
        title: `${task.title} Flashcards`,
        course_name: task.course || task.category || "Other",
        description: `Study deck for ${task.title}`,
        topic_tags: [],
        visibility: "private",
        target_date: useDue ? task.flashcardTargetDate : "",
        linked_assignment_id: String(task.id),
        cards: [],
      },
    });
    if (error) setMessage(error.message);
    else {
      load();
      onOpenDeck(data);
    }
  };
  return (
    <section className="assignment-flashcards">
      <h4>Linked Flashcard Decks</h4>
      {message && <p role="status">{message}</p>}
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
          <button
            onClick={async () => {
              const c = await getSupabaseBrowserClient();
              await c.rpc("link_flashcard_deck_assignment", {
                target_deck_id: d.id,
                target_assignment_id: null,
              });
              load();
            }}
          >
            Unlink Deck
          </button>
        </article>
      ))}
      <div>
        <label>
          Link Existing Deck
          <select defaultValue="" onChange={(e) => link(e.target.value)}>
            <option value="">Choose deck</option>
            {owned.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() =>
            task.flashcardTargetDate
              ? setConfirmRequest({
                  title: "Use assignment due date?",
                  description: `Use ${task.flashcardTargetDate} as this deck's target date?`,
                  action: () => create(true),
                  confirmLabel: "Use Due Date",
                })
              : create(false)
          }
        >
          Create New Deck for This Assignment
        </button>
      </div>
      <FlashcardConfirmDialog
        request={confirmRequest}
        onClose={(accepted) => {
          const action = confirmRequest?.action;
          setConfirmRequest(null);
          if (accepted) action?.();
        }}
      />
    </section>
  );
}
