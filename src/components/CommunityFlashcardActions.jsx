import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../supabaseClient.js";
import { parseCommunityFlashcards } from "../flashcardUtils.js";
export default function CommunityFlashcardActions({ post, userId, onMessage }) {
  const [review, setReview] = useState(null),
    [decks, setDecks] = useState([]),
    [target, setTarget] = useState(""),
    [newDeckTitle, setNewDeckTitle] = useState(""),
    [attached, setAttached] = useState(null),
    [preview, setPreview] = useState(null);
  useEffect(() => {
    getSupabaseBrowserClient()
      .then(async (c) => {
        const [{ data: mine }, { data: link }] = await Promise.all([
          c
            .from("flashcard_decks")
            .select("id,title,course_name")
            .eq("owner_id", userId)
            .eq("status", "active")
            .eq("visibility", "shared"),
          c
            .from("community_post_decks")
            .select(
              "deck_id,flashcard_decks(id,owner_id,title,course_name,visibility,status,flashcards(count))",
            )
            .eq("post_id", post.id)
            .maybeSingle(),
        ]);
        setDecks(mine || []);
        const d = link?.flashcard_decks;
        if (d?.visibility === "shared" && d?.status === "active")
          setAttached(d);
      })
      .catch(() => {});
  }, [post.id, userId]);
  const attachedCard = attached ? (
    <aside className="community-attached-deck">
      <b>{attached.title}</b>
      <span>{attached.course_name}</span>
      <span>{attached.flashcards?.[0]?.count || 0} cards</span>
      <button
        onClick={async () => {
          const c = await getSupabaseBrowserClient();
          const { data, error } = await c.rpc("flashcard_get_deck", {
            target_deck_id: attached.id,
          });
          if (error) onMessage(error.message);
          else setPreview(data);
        }}
      >
        Preview Deck
      </button>
      <button
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("glowdocket:open-flashcard-deck", {
              detail: { deckId: attached.id },
            }),
          )
        }
      >
        Study Deck
      </button>
      {attached.owner_id !== userId && (
        <button
          onClick={async () => {
            const c = await getSupabaseBrowserClient();
            const { error } = await c.rpc("copy_flashcard_deck", {
              source_id: attached.id,
            });
            onMessage(error ? error.message : "Copied to My Decks.");
          }}
        >
          Copy to My Decks
        </button>
      )}
    </aside>
  ) : null;
  const previewDialog = preview ? (
    <div className="flash-modal">
      <section role="dialog" aria-modal="true">
        <h2>{preview.title}</h2>
        {preview.cards?.map((card) => (
          <article key={card.id}>
            <b>{card.front}</b>
            <p>{card.back}</p>
          </article>
        ))}
        <button onClick={() => setPreview(null)}>Close Preview</button>
      </section>
    </div>
  ) : null;
  if (post.author_id !== userId)
    return (
      <>
        {attachedCard}
        {previewDialog}
      </>
    );
  const attach = async (id) => {
    try {
      const c = await getSupabaseBrowserClient();
      if (id) {
        const { error } = await c.rpc("attach_deck_to_community_post", {
          target_post_id: post.id,
          target_deck_id: id,
        });
        if (error) throw error;
      } else
        await c.from("community_post_decks").delete().eq("post_id", post.id);
      onMessage("Community deck attachment updated.");
    } catch (e) {
      onMessage(e.message);
    }
  };
  const approve = async () => {
    const cards = review.filter((x) => x.selected);
    if (
      !target ||
      !cards.length ||
      (target === "__new" && !newDeckTitle.trim())
    )
      return onMessage("Choose a deck and at least one card.");
    try {
      const c = await getSupabaseBrowserClient();
      const result =
        target === "__new"
          ? await c.rpc("save_flashcard_deck", {
              deck_payload: {
                title: newDeckTitle.trim(),
                course_name: post.course_name,
                description: `Created from Community post: ${post.title}`,
                topic_tags: post.topic_tags || [],
                visibility: "private",
                cards: cards.map((card, position) => ({ ...card, position })),
              },
            })
          : await c.rpc("add_cards_to_owned_deck", {
              target_deck_id: target,
              new_cards: cards,
            });
      const { error } = result;
      if (error) throw error;
      setReview(null);
      onMessage(`${cards.length} cards added after review.`);
    } catch (e) {
      onMessage(e.message);
    }
  };
  return (
    <aside className="community-flash-actions">
      {attachedCard}
      {previewDialog}
      <button onClick={() => setReview(parseCommunityFlashcards(post.body))}>
        Create Flashcards From This Post
      </button>
      <label>
        Attach Shared Deck
        <select defaultValue="" onChange={(e) => attach(e.target.value)}>
          <option value="">No attached deck</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
      </label>
      {review && (
        <div className="flash-modal">
          <section role="dialog" aria-modal="true">
            <h2>Review Proposed Flashcards</h2>
            {review.map((c, i) => (
              <div key={i}>
                <input
                  type="checkbox"
                  checked={c.selected}
                  onChange={(e) =>
                    setReview((x) =>
                      x.map((a, j) =>
                        j === i ? { ...a, selected: e.target.checked } : a,
                      ),
                    )
                  }
                />
                <input
                  value={c.front}
                  onChange={(e) =>
                    setReview((x) =>
                      x.map((a, j) =>
                        j === i ? { ...a, front: e.target.value } : a,
                      ),
                    )
                  }
                />
                <textarea
                  value={c.back}
                  onChange={(e) =>
                    setReview((x) =>
                      x.map((a, j) =>
                        j === i ? { ...a, back: e.target.value } : a,
                      ),
                    )
                  }
                />
                <button
                  onClick={() =>
                    setReview((x) =>
                      x.map((a, j) =>
                        j === i ? { ...a, front: a.back, back: a.front } : a,
                      ),
                    )
                  }
                >
                  Reverse
                </button>
                <button
                  onClick={() => setReview((x) => x.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
            <label>
              Owned deck
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Choose deck</option>
                <option value="__new">Create a new Private deck</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
            {target === "__new" && (
              <label>
                New deck title
                <input
                  maxLength="120"
                  value={newDeckTitle}
                  onChange={(event) => setNewDeckTitle(event.target.value)}
                />
              </label>
            )}
            <button onClick={approve}>Create Approved Cards</button>
            <button onClick={() => setReview(null)}>Cancel</button>
          </section>
        </div>
      )}
    </aside>
  );
}
