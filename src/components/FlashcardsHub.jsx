import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../supabaseClient.js";
import {
  buildFlashcardProfileTags,
  confidenceFor,
  deckProgress,
  parseFlashcardImport,
  parseFlashcardTags,
  selectStudyCards,
  stripFlashcardProfileTags,
} from "../flashcardUtils.js";
import FlashcardSharedActions from "./FlashcardSharedActions.jsx";
import FlashcardConfirmDialog from "./FlashcardConfirmDialog.jsx";
import FlashcardProfileChip from "./FlashcardProfileChip.jsx";
import { getGamificationLevel } from "../gamificationUtils.js";
import "./FlashcardsHub.css";
const STUDY_ACTIONS = [{ label: "Do Again/Hard", rating: "Hard" }];
const isMissingLibraryFunction = (error) =>
  error?.code === "PGRST202" &&
  String(error.message || "").includes("flashcard_library_decks");
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
  displayName = "",
  profileSettings = {},
  reduceMotion = false,
}) {
  const [section, setSection] = useState("all"),
    [decks, setDecks] = useState([]),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [debounced, setDebounced] = useState(""),
    [course, setCourse] = useState(""),
    [sort, setSort] = useState("updated"),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [editor, setEditor] = useState(null),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [importing, setImporting] = useState(false),
    [importText, setImportText] = useState(""),
    [importRows, setImportRows] = useState([]),
    [setup, setSetup] = useState(null),
    [viewer, setViewer] = useState(null),
    [study, setStudy] = useState(null),
    [flipped, setFlipped] = useState(false),
    [summary, setSummary] = useState(null),
    [progress, setProgress] = useState({}),
    [rewardSummary, setRewardSummary] = useState(null),
    [xpGuideOpen, setXpGuideOpen] = useState(false),
    [confirmRequest, setConfirmRequest] = useState(null),
    [celebrating, setCelebrating] = useState(false),
    [shareDeck, setShareDeck] = useState(null),
    [shareEmail, setShareEmail] = useState("");
  const saveTimer = useRef();
  const rewardsCallbackRef = useRef(onRewards);
  rewardsCallbackRef.current = onRewards;
  const accountLevel = getGamificationLevel(profileSettings.totalXp);
  const publicProfile = useMemo(() => ({
    shareFlashcardLevel: profileSettings.shareFlashcardLevel === true,
    showFlashcardName: profileSettings.showFlashcardName === true,
    badgeId: !profileSettings.sharedFlashcardBadge || profileSettings.sharedFlashcardBadge === "current"
      ? profileSettings.selectedBadge || ""
      : profileSettings.sharedFlashcardBadge,
    level: getGamificationLevel(profileSettings.totalXp).level,
    name: displayName,
  }), [displayName, profileSettings.selectedBadge, profileSettings.shareFlashcardLevel, profileSettings.sharedFlashcardBadge, profileSettings.showFlashcardName, profileSettings.totalXp]);
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
        const fn = "flashcard_library_decks";
        const rpcArgs = {
          library_section: section,
          search_text: debounced,
          course_filter: course || null,
          sort_by: sort,
          page_number: next,
          page_size: 20,
        };
        let { data, error } = await c.rpc(fn, rpcArgs);
        if (isMissingLibraryFunction(error)) {
          if (["all", "mine", "starred"].includes(section)) {
            ({ data, error } = await c.rpc("flashcard_my_decks", {
              search_text: debounced,
              course_filter: course || null,
              sort_by: sort,
              page_number: next,
              page_size: 20,
              group_filter: section === "starred" ? "favorites" : "all",
            }));
          } else {
            data = [];
            error = null;
          }
        }
        if (error) throw error;
        data ||= [];
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
    [section, debounced, course, sort],
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
        tags: stripFlashcardProfileTags(data.topic_tags || []).join(", "),
        cards: data.cards || [],
      };
      if (mode === "study") return prepareStudy(d);
      if (mode === "view") return setViewer(d);
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
          topic_tags: ["shared", "public"].includes(d.visibility)
            ? buildFlashcardProfileTags(parseFlashcardTags(d.tags), publicProfile)
            : stripFlashcardProfileTags(parseFlashcardTags(d.tags)),
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
    [editor, load, publicProfile, reduceMotion, rewardSummary?.badges],
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
  const toggleDeckStar = async (deck) => {
    const next = !deck.is_starred;
    setDecks((items) => items.map((item) => item.id === deck.id ? { ...item, is_starred: next } : item));
    try {
      const c = await getSupabaseBrowserClient();
      const { error } = await c.rpc("set_flashcard_deck_star", { target_deck_id: deck.id, starred: next });
      if (error) throw error;
      if (section === "starred" && !next) setDecks((items) => items.filter((item) => item.id !== deck.id));
    } catch (e) {
      setDecks((items) => items.map((item) => item.id === deck.id ? { ...item, is_starred: !next } : item));
      setNotice(e.message);
    }
  };
  const sendDeckShare = async () => {
    if (!shareEmail.trim()) return setNotice("Enter your friend's account email.");
    try {
      const c = await getSupabaseBrowserClient();
      const { error } = await c.rpc("share_flashcard_deck", { target_deck_id: shareDeck.id, recipient_email: shareEmail.trim() });
      if (error) throw error;
      setNotice(`Deck shared with ${shareEmail.trim()}.`);
      setShareDeck(null);
      setShareEmail("");
    } catch (e) { setNotice(e.message); }
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
          study.deck.owner_id !== userId && study.deck.visibility === "private"
            ? "complete_shared_flashcard_session"
            : "complete_flashcard_session_v2",
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
        leveledUp = getGamificationLevel((profileSettings.totalXp || 0) + (reward.xp_earned || 0)).level > accountLevel.level;
        setRewardSummary(reward);
        rewardsCallbackRef.current(reward);
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
      } else if (flipped && /[1-2]/.test(e.key))
        rate(e.key === "1" ? "Hard" : "Good");
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
              <option value="difficult">Focus on Do Again/Hard</option>
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
            Use ← and → to move · Space to flip · 1 Do Again/Hard · 2 Next
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
                {STUDY_ACTIONS.map((action, i) => (
                  <button key={action.label} onClick={() => rate(action.rating)}>
                    {i + 1} · {action.label}
                  </button>
                ))}
              </div>
              <button
                className="btn btn-primary flash-next-card"
                onClick={() => rate("Good")}
              >
                Next <span aria-hidden="true">→</span>
                <small>Continue confidently · 2</small>
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
            <span>
              <b>{summary.counts.Again + summary.counts.Hard}</b>
              Do Again/Hard
            </span>
            <span>
              <b>{summary.counts.Good}</b>
              Next
            </span>
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
            Study Do Again/Hard Cards
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
  if (viewer)
    return (
      <>
        <main className="flash-viewer">
          <header>
            <button onClick={() => setViewer(null)}>← Shared Decks</button>
            <div className="flash-viewer-actions">
              <button
                className="btn btn-primary"
                onClick={() => prepareStudy(viewer)}
              >
                Study this deck
              </button>
              <button
                onClick={async () => {
                  const c = await getSupabaseBrowserClient();
                  const { error } = await c.rpc("copy_flashcard_deck", {
                    source_id: viewer.id,
                  });
                  setNotice(error ? error.message : "Copied to My Decks.");
                  if (!error) setViewer(null);
                }}
              >
                Copy to My Decks
              </button>
            </div>
          </header>
          <section className="flash-viewer-heading">
            <span>{viewer.course_name}</span>
            <h1>{viewer.title}</h1>
            {viewer.description && <p>{viewer.description}</p>}
            <small>{viewer.cards.length} cards · Shared by a GlowDocket student</small>
          </section>
          <div className="flash-viewer-cards">
            {viewer.cards.map((card, index) => (
              <article key={card.id}>
                <b>{index + 1}</b>
                <div><small>Term</small><p>{card.front}</p></div>
                <div><small>Answer</small><p>{card.back}</p></div>
                {card.explanation && <div className="flash-viewer-explanation"><small>Explanation</small><p>{card.explanation}</p></div>}
              </article>
            ))}
          </div>
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
                      "Make this deck public?",
                      "I confirm that these flashcards are my original work and do not contain private information, active test questions, answer keys, or copyrighted material.",
                      () => change("visibility", "shared"),
                      "Make Public",
                    );
                  else if (["shared", "public"].includes(editor.visibility))
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
                <option value="shared">Public</option>
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
          <div className="flash-header-actions">
            <button
              className="btn btn-primary"
              onClick={() => setEditor(blankDeck())}
            >
              Create Deck
            </button>
          </div>
        </header>
        {rewardSummary && (
          <section className="flash-level-card" aria-label={`Account level ${accountLevel.level}, ${accountLevel.name}`}>
            <div className="flash-level-orb"><small>Level</small><strong>{accountLevel.level}</strong></div>
            <div className="flash-level-progress">
              <div><strong>{profileSettings.totalXp || 0} Account XP</strong><span>{accountLevel.xpNeeded - accountLevel.xpIntoLevel} XP to Level {Math.min(10, accountLevel.level + 1)} · {accountLevel.name}</span></div>
              <progress max={accountLevel.xpNeeded} value={accountLevel.xpIntoLevel}>{accountLevel.progress}%</progress>
              <small>Flashcards today: {rewardSummary.today_xp ?? rewardSummary.xp_earned ?? 0}/{rewardSummary.daily_cap || 100} XP</small>
            </div>
            <aside className={`flash-xp-guide${xpGuideOpen ? " is-open" : ""}`}>
              <button type="button" className="flash-xp-guide-toggle" aria-expanded={xpGuideOpen} aria-controls="flash-xp-guide-content" onClick={() => setXpGuideOpen((open) => !open)}>
                <span><strong>How do levels work?</strong><small>{xpGuideOpen ? "Hide guide" : "See how to earn XP"}</small></span>
                <b aria-hidden="true">{xpGuideOpen ? "↑" : "↓"}</b>
              </button>
              {xpGuideOpen && (
                <div id="flash-xp-guide-content" className="flash-xp-guide-content">
                  <p>GlowDocket uses one account XP total and one level everywhere. Assignments and Flashcards both add to it in different ways.</p>
                  <h4>Flashcards XP</h4>
                  <ul>
                    <li><strong>Review cards:</strong> 2 XP per eligible card review each day.</li>
                    <li><strong>Improve confidence:</strong> 5 XP when a card moves forward.</li>
                    <li><strong>Meaningful session:</strong> 10 XP.</li>
                    <li><strong>Finish a session:</strong> 5 XP.</li>
                    <li><strong>Study before the target date:</strong> 5 XP.</li>
                  </ul>
                  <h4>Assignment XP</h4>
                  <ul>
                    <li><strong>Add an assignment:</strong> 5 XP.</li>
                    <li><strong>Start an assignment:</strong> 5 XP.</li>
                    <li><strong>Finish an assignment:</strong> 20 XP.</li>
                    <li><strong>Finish at least one day early:</strong> 30 XP.</li>
                    <li><strong>Reach a 7-day completion streak:</strong> 50 XP.</li>
                  </ul>
                  <p>You can earn up to 100 XP per day from Flashcards. Account XP is cumulative and never resets.</p>
                </div>
              )}
            </aside>
          </section>
        )}
        {notice && (
          <div className="flash-notice" role="status">
            {notice}
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}
        <nav aria-label="Deck categories">
          {[['all', 'All Decks'], ['mine', 'My Decks'], ['shared', 'Shared'], ['public', 'Public'], ['starred', 'Starred']].map(([value, label]) => (
            <button key={value} className={section === value ? "active" : ""} onClick={() => setSection(value)}>{label}</button>
          ))}
        </nav>
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
              : `No ${section} decks match this search.`}
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
                  openDeck(d, d.owner_id === userId ? "edit" : "view");
                }}
              >
                <div className="flash-deck-meta">
                  <span className="flash-course-badge">{d.course_name}</span>
                  <b className="flash-owner-label">
                    {d.owner_id === userId ? "Your Deck" : "GlowDocket Student"}
                  </b>
                </div>
                {["shared", "public"].includes(d.visibility) && <FlashcardProfileChip tags={d.topic_tags || []} compact />}
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
                <footer>
                  <button className="flash-deck-star" onClick={() => toggleDeckStar(d)} aria-pressed={Boolean(d.is_starred)} aria-label={`${d.is_starred ? "Unstar" : "Star"} ${d.title}`}>{d.is_starred ? "★ Starred" : "☆ Star"}</button>
                  <button
                    className="btn btn-primary flash-study-deck-button"
                    onClick={() => openDeck(d, "study")}
                  >
                    Study this deck
                  </button>
                  {d.owner_id === userId && (
                    <button onClick={() => openDeck(d, "edit")}>
                      Edit Deck
                    </button>
                  )}
                  {d.owner_id === userId && <button onClick={() => { setShareDeck(d); setShareEmail(""); }}>Share with Friend</button>}
                  {d.owner_id !== userId && d.visibility !== "private" && (
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
      {shareDeck && <div className="flash-modal" role="dialog" aria-modal="true" aria-labelledby="flash-share-title"><section className="flash-share-dialog"><h2 id="flash-share-title">Share “{shareDeck.title}”</h2><p>Enter the email your friend uses for their GlowDocket account. The deck will appear in their Shared category.</p><label>Friend's account email<input type="email" autoFocus value={shareEmail} onChange={(event) => setShareEmail(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendDeckShare(); }} /></label><div><button onClick={() => setShareDeck(null)}>Cancel</button><button className="btn btn-primary" onClick={sendDeckShare}>Share Deck</button></div></section></div>}
      {confirmationDialog}
    </>
  );
}
