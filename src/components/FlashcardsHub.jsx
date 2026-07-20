import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../supabaseClient.js";
import {
  RATINGS,
  confidenceFor,
  deckProgress,
  parseFlashcardImport,
  parseFlashcardTags,
  selectStudyCards,
} from "../flashcardUtils.js";
import FlashcardSharedActions from "./FlashcardSharedActions.jsx";
import FlashcardConfirmDialog from "./FlashcardConfirmDialog.jsx";
import "./FlashcardsHub.css";
const blankCard = () => ({
  id: crypto.randomUUID(),
  front: "",
  back: "",
  hint: "",
  explanation: "",
});
const blankDeck = () => ({
  title: "",
  course_name: "",
  description: "",
  tags: "",
  target_date: "",
  linked_assignment_id: "",
  visibility: "private",
  is_favorite: false,
  cards: [blankCard(), blankCard()],
});
const currentTimestamp = () => Date.now();
export default function FlashcardsHub({
  userId,
  courses = [],
  assignments = [],
  isMobile = false,
  initialDeckId = "",
  onLaunchConsumed = () => {},
  onRewards = () => {},
  reduceMotion = false,
}) {
  const [section, setSection] = useState("mine"),
    [decks, setDecks] = useState([]),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [debounced, setDebounced] = useState(""),
    [course, setCourse] = useState(""),
    [sort, setSort] = useState("updated"),
    [deckGroup, setDeckGroup] = useState("all"),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [editor, setEditor] = useState(null),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [importing, setImporting] = useState(false),
    [importText, setImportText] = useState(""),
    [importRows, setImportRows] = useState([]),
    [setup, setSetup] = useState(null),
    [study, setStudy] = useState(null),
    [flipped, setFlipped] = useState(false),
    [summary, setSummary] = useState(null),
    [progress, setProgress] = useState({}),
    [rewardSummary, setRewardSummary] = useState(null),
    [confirmRequest, setConfirmRequest] = useState(null),
    [celebrating, setCelebrating] = useState(false);
  const saveTimer = useRef();
  const rewardsCallbackRef = useRef(onRewards);
  rewardsCallbackRef.current = onRewards;
  const askToConfirm = (title, description, action, confirmLabel = "Confirm") =>
    setConfirmRequest({ title, description, action, confirmLabel });
  const closeConfirmation = useCallback(
    (accepted) => {
      const action = confirmRequest?.action;
      setConfirmRequest(null);
      if (accepted) action?.();
    },
    [confirmRequest],
  );
  const confirmationDialog = (
    <FlashcardConfirmDialog
      request={confirmRequest}
      onClose={closeConfirmation}
    />
  );
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    getSupabaseBrowserClient()
      .then((c) => c.rpc("flashcard_reward_summary"))
      .then(({ data }) => {
        if (data) {
          setRewardSummary(data);
          rewardsCallbackRef.current(data);
        }
      })
      .catch(() => {});
  }, [userId]);
  const load = useCallback(
    async (next = 0, append = false) => {
      setLoading(true);
      try {
        const c = await getSupabaseBrowserClient();
        const fn =
          section === "mine" ? "flashcard_my_decks" : "flashcard_shared_decks";
        const rpcArgs = {
          search_text: debounced,
          course_filter: course || null,
          sort_by: sort,
          page_number: next,
          page_size: 20,
        };
        if (section === "mine") rpcArgs.group_filter = deckGroup;
        const { data, error } = await c.rpc(fn, rpcArgs);
        if (error) throw error;
        setDecks((x) =>
          append
            ? [...x, ...data.filter((d) => !x.some((y) => y.id === d.id))]
            : data,
        );
        setMore(data.length === 20);
        setPage(next);
      } catch (e) {
        setNotice(
          navigator.onLine
            ? e.message
            : "You are offline. Reconnect to load decks.",
        );
      } finally {
        setLoading(false);
      }
    },
    [section, debounced, course, sort, deckGroup],
  );
  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);
  useEffect(() => {
    const leave = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    addEventListener("beforeunload", leave);
    return () => removeEventListener("beforeunload", leave);
  }, [dirty]);
  const openDeck = async (deck, mode = "edit") => {
    try {
      const c = await getSupabaseBrowserClient();
      const { data, error } = await c.rpc("flashcard_get_deck", {
        target_deck_id: deck.id,
      });
      if (error) throw error;
      const d = {
        ...data,
        tags: (data.topic_tags || []).join(", "),
        cards: data.cards || [],
      };
      if (mode === "study") return prepareStudy(d);
      setEditor(d);
      setDirty(false);
    } catch (e) {
      setNotice(e.message);
    }
  };
  useEffect(() => {
    if (!initialDeckId) return;
    queueMicrotask(() => openDeck({ id: initialDeckId }, "study"));
    onLaunchConsumed();
    // openDeck intentionally uses the current deck loader and study setup state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDeckId, onLaunchConsumed]);
  const save = useCallback(
    async (d = editor) => {
      if (!d || !d.title.trim() || !d.course_name.trim())
        return setNotice("Deck title and course are required.");
      if (d.cards.length > 500)
        return setNotice("A deck cannot exceed 500 cards.");
      setSaving(true);
      try {
        const c = await getSupabaseBrowserClient();
        const payload = {
          ...d,
          topic_tags: parseFlashcardTags(d.tags),
          cards: d.cards.map((x, i) => ({ ...x, position: i })),
        };
        delete payload.tags;
        const { data, error } = await c.rpc("save_flashcard_deck", {
          deck_payload: payload,
        });
        if (error) throw error;
        setEditor((x) => ({ ...x, id: data }));
        setDirty(false);
        setNotice("Deck saved.");
        load();
        const { data: rewards } = await c.rpc("flashcard_reward_summary");
        if (rewards) {
          const unlocked = (rewards.badges || []).some(
            (id) => !(rewardSummary?.badges || []).includes(id),
          );
          setRewardSummary(rewards);
          rewardsCallbackRef.current(rewards);
          if (unlocked && !reduceMotion) {
            setCelebrating(true);
            setTimeout(() => setCelebrating(false), 1800);
          }
        }
      } catch (e) {
        setNotice(e.message);
      } finally {
        setSaving(false);
      }
    },
    [editor, load, reduceMotion, rewardSummary?.badges],
  );
  useEffect(() => {
    if (!dirty || !editor) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(editor), 1200);
    return () => clearTimeout(saveTimer.current);
  }, [dirty, editor, save]);
  const change = (key, value) => {
    setEditor((x) => ({ ...x, [key]: value }));
    setDirty(true);
  };
  const cardChange = (id, key, value) => {
    setEditor((x) => ({
      ...x,
      cards: x.cards.map((c) => (c.id === id ? { ...c, [key]: value } : c)),
    }));
    setDirty(true);
  };
  const move = (i, d) => {
    const cards = [...editor.cards],
      j = i + d;
    if (j < 0 || j >= cards.length) return;
    [cards[i], cards[j]] = [cards[j], cards[i]];
    change("cards", cards);
  };
  const remove = (i) => {
    const removed = editor.cards[i];
    change(
      "cards",
      editor.cards.filter((_, j) => j !== i),
    );
    setNotice(
      <span>
        Card removed.{" "}
        <button
          onClick={() =>
            change("cards", [
              ...editor.cards.slice(0, i),
              removed,
              ...editor.cards.slice(i),
            ])
          }
        >
          Undo
        </button>
      </span>,
    );
  };
  const approveImport = () => {
    const valid = importRows.filter((x) => x.valid);
    if (editor.cards.length + valid.length > 500)
      return setNotice("Import would exceed the 500-card limit.");
    change("cards", [
      ...editor.cards,
      ...valid.map((x) => ({ ...x, id: crypto.randomUUID() })),
    ]);
    setImporting(false);
    setImportRows([]);
  };
  async function prepareStudy(deck) {
    if (!deck.cards?.length) return setNotice("Add cards before studying.");
    try {
      const c = await getSupabaseBrowserClient();
      const { data } = await c
        .from("flashcard_user_progress")
        .select("*")
        .in(
          "card_id",
          deck.cards.map((x) => x.id),
        )
        .eq("user_id", userId);
      setProgress(Object.fromEntries((data || []).map((x) => [x.card_id, x])));
    } catch (e) {
      setNotice(`Saved progress could not be loaded: ${e.message}`);
    }
    setSetup({
      deck,
      mode: "all",
      order: "original",
      direction: "front",
      size: "all",
    });
  }
  const startStudy = (deck, options = {}) => {
    const cards = selectStudyCards(deck.cards, progress, options);
    if (!cards.length) return setNotice("No cards match those study options.");
    setSetup(null);
    setStudy({
      deck,
      cards,
      index: 0,
      started: currentTimestamp(),
      counts: { Again: 0, Hard: 0, Good: 0, Easy: 0 },
      reviewed: [],
    });
    setSummary(null);
    setFlipped(false);
  };
  const moveStudyCard = (direction) => {
    if (!study) return;
    const nextIndex = Math.min(
      study.cards.length - 1,
      Math.max(0, study.index + direction),
    );
    if (nextIndex === study.index) return;
    setStudy({ ...study, index: nextIndex });
    setFlipped(false);
  };
  const toggleStar = async (card) => {
    const old = Boolean(progress[card.id]?.is_starred);
    setProgress((x) => ({
      ...x,
      [card.id]: { ...x[card.id], is_starred: !old },
    }));
    try {
      const c = await getSupabaseBrowserClient();
      const { error } = await c.rpc("set_flashcard_star", {
        target_card_id: card.id,
        starred: !old,
      });
      if (error) throw error;
    } catch (e) {
      setProgress((x) => ({
        ...x,
        [card.id]: { ...x[card.id], is_starred: old },
      }));
      setNotice(`Star could not be saved: ${e.message}`);
    }
  };
  const rate = async (rating) => {
    const card = study.cards[study.index],
      old = progress[card.id] || {};
    const next = {
      ...old,
      review_count: (old.review_count || 0) + 1,
      [`${rating.toLowerCase()}_count`]:
        (old[`${rating.toLowerCase()}_count`] || 0) + 1,
      last_rating: rating,
      confidence_status: confidenceFor(old, rating),
      is_starred: Boolean(old.is_starred),
    };
    setProgress((x) => ({ ...x, [card.id]: next }));
    const counts = { ...study.counts, [rating]: study.counts[rating] + 1 },
      reviewed = [...study.reviewed, { card_id: card.id, rating }];
    if (study.index + 1 >= study.cards.length) {
      let reward, unlocked, leveledUp;
      try {
        const c = await getSupabaseBrowserClient();
        const { data, error: rewardError } = await c.rpc(
          "complete_flashcard_session_v2",
          {
            target_deck_id: study.deck.id,
            started_at: new Date(study.started).toISOString(),
            reviews: reviewed,
          },
        );
        if (rewardError) throw rewardError;
        reward = data;
        unlocked = (reward.badges || []).some(
          (id) => !(rewardSummary?.badges || []).includes(id),
        );
        leveledUp =
          Math.floor((reward.total_xp || 0) / 100) >
          Math.floor((rewardSummary?.total_xp || 0) / 100);
        setRewardSummary(reward);
        rewardsCallbackRef.current(reward.badges || []);
      } catch (e) {
        setNotice(`Session could not sync: ${e.message}`);
        return;
      }
      const finalProgress = { ...progress, [card.id]: next };
      setSummary({
        counts,
        cards: reviewed.length,
        seconds: Math.round((currentTimestamp() - study.started) / 1000),
        deck: study.deck,
        progress: deckProgress(study.deck.cards, finalProgress),
        improved: reviewed.filter((review) => {
          const levels = ["New", "Learning", "Familiar", "Strong"];
          const before = progress[review.card_id]?.confidence_status || "New";
          const after =
            finalProgress[review.card_id]?.confidence_status || before;
          return levels.indexOf(after) > levels.indexOf(before);
        }).length,
        xp: reward.xp_earned,
      });
      if ((reward.meaningful || unlocked || leveledUp) && !reduceMotion) {
        setCelebrating(true);
        setTimeout(() => setCelebrating(false), 1800);
      }
      setStudy(null);
    } else setStudy({ ...study, index: study.index + 1, counts, reviewed });
    setFlipped(false);
  };
  useEffect(() => {
    if (!study) return;
    const key = (e) => {
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((x) => !x);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveStudyCard(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveStudyCard(1);
      } else if (flipped && /[1-4]/.test(e.key))
        rate(RATINGS[Number(e.key) - 1]);
      else if (e.key.toLowerCase() === "s") {
        const card = study.cards[study.index];
        toggleStar(card);
      } else if (e.key === "Escape")
        askToConfirm(
          "Exit Study Session?",
          "Your completed reviews are saved only when the session finishes.",
          () => setStudy(null),
          "Exit Session",
        );
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  if (setup)
    return (
      <>
        <main className="flash-setup">
          <h1>Choose your study session</h1>
          <p>
            {setup.deck.title} · {setup.deck.cards.length} cards
          </p>
          <label>
            Cards
            <select
              value={setup.mode}
              onChange={(e) => setSetup({ ...setup, mode: e.target.value })}
            >
              <option value="all">Study all cards</option>
              <option value="starred">Study starred cards</option>
              <option value="difficult">Focus on Again or Hard</option>
              <option value="new">Study cards not yet reviewed</option>
            </select>
          </label>
          <label>
            Order
            <select
              value={setup.order}
              onChange={(e) => setSetup({ ...setup, order: e.target.value })}
            >
              <option value="original">Original order</option>
              <option value="shuffle">Shuffle</option>
            </select>
          </label>
          <label>
            Direction
            <select
              value={setup.direction}
              onChange={(e) =>
                setSetup({ ...setup, direction: e.target.value })
              }
            >
              <option value="front">Front to back</option>
              <option value="back">Back to front</option>
            </select>
          </label>
          <label>
            Session size
            <select
              value={setup.size}
              onChange={(e) => setSetup({ ...setup, size: e.target.value })}
            >
              <option value="10">10 cards</option>
              <option value="20">20 cards</option>
              <option value="50">50 cards</option>
              <option value="all">All cards</option>
            </select>
          </label>
          <button
            className="btn btn-primary"
            onClick={() => startStudy(setup.deck, setup)}
          >
            Start Study Session
          </button>
          <button onClick={() => setSetup(null)}>Cancel</button>
        </main>
        {confirmationDialog}
      </>
    );
  if (study) {
    const card = study.cards[study.index],
      p = progress[card.id] || {};
    return (
      <>
        <main className="flash-study">
          <header>
            <div>
              <b>{study.deck.title}</b>
              <span>{study.deck.course_name}</span>
            </div>
            <button
              onClick={() =>
                askToConfirm(
                  "Exit Study Session?",
                  "Your completed reviews are saved only when the session finishes.",
                  () => setStudy(null),
                  "Exit Session",
                )
              }
            >
              Exit Study Session
            </button>
          </header>
          <button
            className={`flash-card ${flipped ? "is-flipped" : ""}`}
            onClick={() => setFlipped((x) => !x)}
            aria-label={`${flipped ? "Card back" : "Card front"}. Tap to flip.`}
          >
            <span className="flash-card-inner">
              <span className="flash-card-face flash-card-front">
                <small>Front</small>
                <strong>{card.front}</strong>
              </span>
              <span className="flash-card-face flash-card-back">
                <small>Back</small>
                <strong>{card.back}</strong>
                {card.explanation && <span>{card.explanation}</span>}
              </span>
            </span>
          </button>
          <progress
            className="flash-study-progress"
            value={study.index + 1}
            max={study.cards.length}
            aria-label={`Study progress: card ${study.index + 1} of ${study.cards.length}`}
          />
          <div
            className="flash-card-navigation"
            aria-label="Flashcard navigation"
          >
            <button
              onClick={() => moveStudyCard(-1)}
              disabled={study.index === 0}
              aria-label="Previous flashcard"
            >
              ←
            </button>
            <strong aria-live="polite">
              {study.index + 1} / {study.cards.length}
            </strong>
            <button
              onClick={() => moveStudyCard(1)}
              disabled={study.index === study.cards.length - 1}
              aria-label="Next flashcard"
            >
              →
            </button>
          </div>
          <p className="flash-keyboard-hint">
            Use ← and → to move · Space to flip
          </p>
          {!flipped && card.hint && (
            <details>
              <summary>Show hint</summary>
              {card.hint}
            </details>
          )}
          <button onClick={() => toggleStar(card)} aria-pressed={p.is_starred}>
            {p.is_starred ? "★ Starred" : "☆ Star"}
          </button>
          {flipped ? (
            <div className="flash-review-actions">
              <div className="flash-ratings" aria-label="Rate your confidence">
                {RATINGS.map((r, i) => (
                  <button key={r} onClick={() => rate(r)}>
                    {i + 1} · {r}
                  </button>
                ))}
              </div>
              <button
                className="btn btn-primary flash-next-card"
                onClick={() => rate("Good")}
              >
                Next <span aria-hidden="true">→</span>
                <small>Counts as Good</small>
              </button>
            </div>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => setFlipped(true)}
            >
              Flip Card <kbd>Space</kbd>
            </button>
          )}
        </main>
        {confirmationDialog}
      </>
    );
  }
  if (summary)
    return (
      <>
        <main className="flash-summary">
          <h1>Study session complete</h1>
          {celebrating && (
            <div className="flash-confetti" aria-hidden="true">
              {Array.from({ length: 18 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
          )}
          <p>
            ✨ You reviewed {summary.cards} cards in {summary.seconds} seconds.
          </p>
          <div>
            {RATINGS.map((r) => (
              <span key={r}>
                <b>{summary.counts[r]}</b>
                {r}
              </span>
            ))}
          </div>
          <h2>{summary.progress.percent}% understanding</h2>
          <p>
            {summary.progress.learning} still Learning ·{" "}
            {summary.progress.strong} Strong
          </p>
          <p>
            {summary.improved} cards improved · {summary.xp} XP earned
          </p>
          {summary.deck.target_date && (
            <p>
              Target date:{" "}
              {new Date(
                `${summary.deck.target_date}T00:00`,
              ).toLocaleDateString()}
            </p>
          )}
          <button
            onClick={() =>
              startStudy(summary.deck, { mode: "difficult", size: "all" })
            }
          >
            Study Again/Hard Cards
          </button>
          <button onClick={() => startStudy(summary.deck)}>
            Restart Session
          </button>
          <button
            onClick={() => {
              setSummary(null);
              setEditor(summary.deck);
            }}
          >
            Return to Deck
          </button>
          <button onClick={() => setSummary(null)}>Return to My Decks</button>
        </main>
        {confirmationDialog}
      </>
    );
  if (editor)
    return (
      <>
        <main className="flash-editor">
          <header>
            <button
              onClick={() =>
                dirty
                  ? askToConfirm(
                      "Leave with unsaved changes?",
                      "Changes that have not finished saving will be lost.",
                      () => setEditor(null),
                      "Leave Editor",
                    )
                  : setEditor(null)
              }
            >
              ← My Decks
            </button>
            <div>
              <span>
                {saving
                  ? "Saving…"
                  : dirty
                    ? "Unsaved changes"
                    : "All changes saved"}
              </span>
              <button onClick={() => save()}>Save</button>
            </div>
          </header>
          <section className="flash-editor-intro">
            <div>
              <span>Flashcard set</span>
              <h1>{editor.id ? "Edit your deck" : "Create a new deck"}</h1>
            </div>
            <p>{editor.cards.length} cards</p>
          </section>
          <div className="flash-deck-fields">
            <label>
              Deck title
              <input
                maxLength={120}
                value={editor.title}
                onChange={(e) => change("title", e.target.value)}
                placeholder="Enter a title, like Biology — Chapter 4"
              />
            </label>
            <label>
              Course
              <input
                list="flash-courses"
                maxLength={100}
                value={editor.course_name}
                onChange={(e) => change("course_name", e.target.value)}
              />
              <datalist id="flash-courses">
                {courses.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </label>
            <label>
              Description
              <textarea
                maxLength={1000}
                value={editor.description || ""}
                onChange={(e) => change("description", e.target.value)}
              />
            </label>
            <label>
              Tags
              <input
                value={editor.tags || ""}
                onChange={(e) => change("tags", e.target.value)}
              />
            </label>
            <label>
              Target date
              <input
                type="date"
                value={editor.target_date || ""}
                onChange={(e) => change("target_date", e.target.value)}
              />
            </label>
            <label>
              Linked assignment
              <select
                value={editor.linked_assignment_id || ""}
                onChange={(e) => change("linked_assignment_id", e.target.value)}
              >
                <option value="">None</option>
                {assignments
                  .filter((x) => !x.isDeleted)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Visibility
              <select
                value={editor.visibility}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "shared")
                    askToConfirm(
                      "Publish this Shared Deck?",
                      "I confirm that these flashcards are my original work and do not contain private information, active test questions, answer keys, or copyrighted material.",
                      () => change("visibility", "shared"),
                      "Publish Deck",
                    );
                  else if (editor.visibility === "shared")
                    askToConfirm(
                      "Make this deck private?",
                      "Any Community attachment will stop appearing publicly.",
                      () => change("visibility", "private"),
                      "Make Private",
                    );
                  else change("visibility", value);
                }}
              >
                <option value="private">Private</option>
                <option value="shared">Shared</option>
              </select>
            </label>
          </div>
          <div className="flash-editor-actions">
            <button onClick={() => setImporting(true)}>Import Cards</button>
            <button
              onClick={() => change("cards", [...editor.cards, blankCard()])}
            >
              Add Card
            </button>
            <button onClick={() => prepareStudy(editor)}>Study Deck</button>
            {editor.id && (
              <button
                className="btn-danger"
                onClick={() =>
                  askToConfirm(
                    "Delete this deck?",
                    "The deck, its cards, and progress for those cards will be permanently deleted. Assignment and Community links will only be removed.",
                    async () => {
                      try {
                        const c = await getSupabaseBrowserClient();
                        const { error } = await c.rpc("delete_flashcard_deck", {
                          target_deck_id: editor.id,
                        });
                        if (error) throw error;
                        setEditor(null);
                        setDirty(false);
                        setNotice("Deck deleted.");
                        load();
                      } catch (e) {
                        setNotice(e.message);
                      }
                    },
                    "Delete Deck",
                  )
                }
              >
                Delete Deck
              </button>
            )}
          </div>
          {editor.cards.map((c, i) => (
            <article className="flash-card-editor" key={c.id}>
              <b>Card {i + 1}</b>
              <label>
                Front
                <textarea
                  maxLength={500}
                  value={c.front}
                  onChange={(e) => cardChange(c.id, "front", e.target.value)}
                  placeholder="Enter a term or question"
                />
              </label>
              <label>
                Back
                <textarea
                  maxLength={2000}
                  value={c.back}
                  onChange={(e) => cardChange(c.id, "back", e.target.value)}
                  placeholder="Enter a definition or answer"
                />
              </label>
              <details>
                <summary>Hint and explanation</summary>
                <label>
                  Hint
                  <textarea
                    maxLength={500}
                    value={c.hint || ""}
                    onChange={(e) => cardChange(c.id, "hint", e.target.value)}
                  />
                </label>
                <label>
                  Explanation
                  <textarea
                    maxLength={2000}
                    value={c.explanation || ""}
                    onChange={(e) =>
                      cardChange(c.id, "explanation", e.target.value)
                    }
                  />
                </label>
              </details>
              <footer>
                <button onClick={() => move(i, -1)}>Move up</button>
                <button onClick={() => move(i, 1)}>Move down</button>
                <button
                  onClick={() =>
                    change("cards", [
                      ...editor.cards.slice(0, i + 1),
                      { ...c, id: crypto.randomUUID() },
                      ...editor.cards.slice(i + 1),
                    ])
                  }
                >
                  Duplicate
                </button>
                <button onClick={() => remove(i)}>Delete</button>
              </footer>
            </article>
          ))}
          <button
            className="flash-add-card-row"
            onClick={() => change("cards", [...editor.cards, blankCard()])}
          >
            <span aria-hidden="true">+</span> Add another card
          </button>
          {importing && (
            <div className="flash-modal">
              <section role="dialog" aria-modal="true">
                <h2>Import Cards</h2>
                {importRows.length === 0 ? (
                  <>
                    <label>
                      Paste cards
                      <textarea
                        rows="12"
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                      />
                    </label>
                    <button
                      onClick={() =>
                        setImportRows(parseFlashcardImport(importText))
                      }
                    >
                      Review Import
                    </button>
                  </>
                ) : (
                  <>
                    <p>
                      {importRows.filter((x) => x.valid).length} cards ready
                    </p>
                    {importRows.map((r, i) => (
                      <div className={r.valid ? "" : "invalid"} key={r.id}>
                        <input
                          value={r.front}
                          onChange={(e) =>
                            setImportRows((x) =>
                              x.map((a, j) =>
                                j === i
                                  ? {
                                      ...a,
                                      front: e.target.value,
                                      valid: Boolean(e.target.value && a.back),
                                    }
                                  : a,
                              ),
                            )
                          }
                        />
                        <input
                          value={r.back}
                          onChange={(e) =>
                            setImportRows((x) =>
                              x.map((a, j) =>
                                j === i
                                  ? {
                                      ...a,
                                      back: e.target.value,
                                      valid: Boolean(a.front && e.target.value),
                                    }
                                  : a,
                              ),
                            )
                          }
                        />
                        <button
                          onClick={() =>
                            setImportRows((x) => x.filter((_, j) => j !== i))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button onClick={approveImport}>Add Reviewed Cards</button>
                  </>
                )}
                <button
                  onClick={() => {
                    setImporting(false);
                    setImportRows([]);
                  }}
                >
                  Cancel
                </button>
              </section>
            </div>
          )}
        </main>
        {confirmationDialog}
      </>
    );
  return (
    <>
      <main className={`flash-page${isMobile ? " mobile" : ""}`}>
        <header>
          <div>
            <span>Study smarter</span>
            <h1>Flashcards</h1>
            <p>
              Build decks, study at your pace, and track confidence without
              daily card deadlines.
            </p>
          </div>
          {!isMobile && (
            <div className="flash-header-actions">
              <button
                className="btn btn-primary"
                onClick={() => setEditor(blankDeck())}
              >
                Create Deck
              </button>
            </div>
          )}
        </header>
        {rewardSummary && (
          <p className="flash-xp-status">
            Flashcards XP: {rewardSummary.total_xp} · Today:{" "}
            {rewardSummary.today_xp ?? rewardSummary.xp_earned ?? 0}/100
          </p>
        )}
        {notice && (
          <div className="flash-notice" role="status">
            {notice}
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}
        <nav>
          <button
            className={section === "mine" ? "active" : ""}
            onClick={() => setSection("mine")}
          >
            My Decks
          </button>
          <button
            className={section === "shared" ? "active" : ""}
            onClick={() => setSection("shared")}
          >
            Shared Decks
          </button>
        </nav>
        {section === "mine" && (
          <nav className="flash-group-tabs" aria-label="My Deck groups">
            <button
              className={deckGroup === "recent" ? "active" : ""}
              onClick={() => setDeckGroup("recent")}
            >
              Recently Studied
            </button>
            <button
              className={deckGroup === "all" ? "active" : ""}
              onClick={() => setDeckGroup("all")}
            >
              All Decks
            </button>
            <button
              className={deckGroup === "favorites" ? "active" : ""}
              onClick={() => setDeckGroup("favorites")}
            >
              Favorite Decks
            </button>
          </nav>
        )}
        <div className="flash-toolbar">
          <label className="flash-search-field">
            <span>Search your library</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, course, or topic"
            />
          </label>
          <label>
            Course
            <select value={course} onChange={(e) => setCourse(e.target.value)}>
              <option value="">All courses</option>
              {courses.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {section === "mine" ? (
                <>
                  <option value="studied">Recently Studied</option>
                  <option value="created">Recently Created</option>
                  <option value="updated">Recently Updated</option>
                  <option value="alpha">Alphabetical</option>
                  <option value="target">Target Date</option>
                </>
              ) : (
                <>
                  <option value="helpful">Most Helpful</option>
                  <option value="newest">Newest</option>
                  <option value="updated">Recently Updated</option>
                  <option value="studied">Most Studied</option>
                </>
              )}
            </select>
          </label>
        </div>
        {loading ? (
          <p>Loading decks…</p>
        ) : decks.length === 0 ? (
          <p className="flash-empty">
            {section === "mine"
              ? "No personal decks yet. Create one or import cards to begin."
              : "No Shared Decks match this search."}
          </p>
        ) : (
          <div className="flash-grid">
            {decks.map((d) => (
              <article
                className="flash-deck-tile"
                key={d.id}
                onClick={(event) => {
                  if (
                    event.target.closest("button, input, select, textarea, a")
                  )
                    return;
                  openDeck(d, "study");
                }}
              >
                <div className="flash-deck-meta">
                  <span className="flash-course-badge">{d.course_name}</span>
                  <b className="flash-owner-label">
                    {d.owner_id === userId ? "Your Deck" : "GlowDocket Student"}
                  </b>
                </div>
                <h2>{d.title}</h2>
                <p>{d.description}</p>
                <small>
                  {d.card_count} cards · {d.visibility}
                </small>
                {d.target_date && (
                  <p>
                    Target:{" "}
                    {new Date(`${d.target_date}T00:00`).toLocaleDateString()}
                  </p>
                )}
                <div className="flash-deck-progress">
                  <span>
                    <b>{d.understanding_percent || 0}%</b> understood
                  </span>
                  <progress
                    value={d.understanding_percent || 0}
                    max="100"
                    aria-label={`${d.title}: ${d.understanding_percent || 0}% understood`}
                  />
                </div>
                {section === "mine" && (
                  <div className="flash-progress-details">
                    <span>New {d.new_count}</span>
                    <span>Learning {d.learning_count}</span>
                    <span>Familiar {d.familiar_count}</span>
                    <span>Strong {d.strong_count}</span>
                    <span>Starred {d.starred_count}</span>
                    <span>{d.total_sessions} sessions</span>
                    {d.last_studied_at && (
                      <span>
                        Studied{" "}
                        {new Date(d.last_studied_at).toLocaleDateString()}
                      </span>
                    )}
                    {d.linked_assignment_id && <span>Linked assignment</span>}
                    <button
                      aria-pressed={d.is_favorite}
                      onClick={async () => {
                        const old = d.is_favorite;
                        setDecks((x) =>
                          x.map((a) =>
                            a.id === d.id ? { ...a, is_favorite: !old } : a,
                          ),
                        );
                        const c = await getSupabaseBrowserClient();
                        const { error } = await c.rpc(
                          "set_flashcard_deck_favorite",
                          { target_deck_id: d.id, favorite: !old },
                        );
                        if (error) {
                          setDecks((x) =>
                            x.map((a) =>
                              a.id === d.id ? { ...a, is_favorite: old } : a,
                            ),
                          );
                          setNotice(error.message);
                        }
                      }}
                    >
                      {d.is_favorite ? "★ Favorite" : "☆ Favorite"}
                    </button>
                  </div>
                )}
                <footer>
                  <button
                    className="btn btn-primary flash-study-deck-button"
                    onClick={() => openDeck(d, "study")}
                  >
                    Study this deck
                  </button>
                  {section === "mine" && !isMobile && (
                    <button onClick={() => openDeck(d, "edit")}>
                      Edit Deck
                    </button>
                  )}
                  {section === "shared" && (
                    <>
                      {!isMobile && (
                        <button
                          onClick={async () => {
                            const c = await getSupabaseBrowserClient();
                            const { error } = await c.rpc(
                              "copy_flashcard_deck",
                              {
                                source_id: d.id,
                              },
                            );
                            setNotice(
                              error ? error.message : "Copied to My Decks.",
                            );
                          }}
                        >
                          Copy to My Decks
                        </button>
                      )}
                      <FlashcardSharedActions
                        deck={d}
                        userId={userId}
                        onError={setNotice}
                      />
                    </>
                  )}
                </footer>
              </article>
            ))}
          </div>
        )}
        {more && (
          <button onClick={() => load(page + 1, true)}>Load More</button>
        )}
      </main>
      {confirmationDialog}
    </>
  );
}
