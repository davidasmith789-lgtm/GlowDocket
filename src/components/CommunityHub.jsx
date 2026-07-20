import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../supabaseClient.js";
import CommunityFlashcardActions from "./CommunityFlashcardActions.jsx";
import {
  COMMUNITY_LIMITS,
  COMMUNITY_POST_TYPES,
  COMMUNITY_REPORT_REASONS,
  communityBodyBlocks,
  getCommunityFormattingMarker,
  parseCommunityTags,
  validateCommunityPost,
} from "../communityUtils.js";
import "./CommunityHub.css";

const EMPTY = {
  course_name: "",
  post_type: COMMUNITY_POST_TYPES[0],
  title: "",
  body: "",
  tags: "",
};
const PAGE_SIZE = 20;
const messageFor = (error, fallback) =>
  !navigator.onLine
    ? "You appear to be offline. Reconnect and try again."
    : error?.message || fallback;
const Body = ({ text, preview = false }) => (
  <div className={`community-body${preview ? " is-preview" : ""}`}>
    {communityBodyBlocks(text).map((block, index) =>
      block.type === "heading" ? (
        <h3 key={index}>{block.text}</h3>
      ) : block.type === "bullets" ? (
        <ul key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{item}</li>
          ))}
        </ul>
      ) : block.type === "numbers" ? (
        <ol key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{item}</li>
          ))}
        </ol>
      ) : (
        <p key={index}>
          {block.lines.map((line, lineIndex) => (
            <span key={lineIndex}>
              {line}
              {lineIndex < block.lines.length - 1 && <br />}
            </span>
          ))}
        </p>
      ),
    )}
  </div>
);

export default function CommunityHub({ userId, isMobile = false }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("helpful");
  const [savedOnly, setSavedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState(null);
  const [formMode, setFormMode] = useState("");
  const [draft, setDraft] = useState(EMPTY);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [isModerator, setIsModerator] = useState(false);
  const [remainingPosts, setRemainingPosts] = useState(null);
  const [moderating, setModerating] = useState(false);
  const [queue, setQueue] = useState([]);
  const [reporting, setReporting] = useState(false);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const closeDialog = useCallback(() => {
    setFormMode("");
    setSelected(null);
    setReporting(false);
    setConfirmed(false);
    setDraft(EMPTY);
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);
  const load = useCallback(
    async (nextPage = 0, append = false) => {
      append ? setLoadingMore(true) : setLoading(true);
      setNotice("");
      try {
        const client = await getSupabaseBrowserClient();
        const { data, error } = await client.rpc("community_search_posts", {
          search_text: debouncedQuery,
          filter_post_type: type || null,
          sort_by: sort,
          page_number: nextPage,
          page_size: PAGE_SIZE,
          saved_only: savedOnly,
        });
        if (error) throw error;
        const rows = data || [];
        setPosts((current) =>
          append
            ? [
                ...current,
                ...rows.filter(
                  (row) => !current.some((item) => item.id === row.id),
                ),
              ]
            : rows,
        );
        setHasMore(rows.length === PAGE_SIZE);
        setPage(nextPage);
      } catch (error) {
        setNotice(messageFor(error, "Community posts could not be loaded."));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQuery, type, sort, savedOnly],
  );
  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);
  useEffect(() => {
    getSupabaseBrowserClient()
      .then(async (client) => {
        const [moderator, quota] = await Promise.all([
          client.rpc("is_community_moderator", { check_user_id: userId }),
          client.rpc("community_post_quota"),
        ]);
        setIsModerator(Boolean(moderator.data));
        if (!quota.error) setRemainingPosts(Number(quota.data));
      })
      .catch(() => {});
  }, [userId]);
  useEffect(() => {
    if (!formMode && !selected && !reporting) return;
    triggerRef.current = document.activeElement;
    requestAnimationFrame(() => dialogRef.current?.focus());
    const key = (event) => {
      if (event.key === "Escape") closeDialog();
      if (event.key === "Tab" && dialogRef.current) {
        const nodes = [
          ...dialogRef.current.querySelectorAll(
            "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
          ),
        ];
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [closeDialog, formMode, reporting, selected]);
  const openCreate = () => {
    if (remainingPosts === 0)
      return setNotice(
        "You have reached the three-post limit for the current rolling 24-hour period.",
      );
    setDraft(EMPTY);
    setConfirmed(false);
    setFormMode("create");
  };
  const openEdit = (post) => {
    setDraft({ ...post, tags: (post.topic_tags || []).join(", ") });
    setConfirmed(true);
    setSelected(null);
    setFormMode("edit");
  };
  const submit = async (event) => {
    event.preventDefault();
    const topic_tags = parseCommunityTags(draft.tags);
    const errorText = validateCommunityPost(
      { ...draft, topic_tags },
      confirmed,
    );
    if (errorText) return setNotice(errorText);
    setBusy("submit");
    try {
      const client = await getSupabaseBrowserClient();
      if (formMode === "edit") {
        const { error } = await client
          .from("community_posts")
          .update({
            course_name: draft.course_name.trim(),
            post_type: draft.post_type,
            title: draft.title.trim(),
            body: draft.body,
            topic_tags,
          })
          .eq("id", draft.id);
        if (error) throw error;
      } else {
        const { error } = await client.rpc("create_community_post", {
          new_course_name: draft.course_name.trim(),
          new_post_type: draft.post_type,
          new_title: draft.title.trim(),
          new_body: draft.body,
          new_topic_tags: topic_tags,
        });
        if (error) throw error;
        setRemainingPosts((count) => Math.max(0, Number(count ?? 3) - 1));
      }
      closeDialog();
      setNotice(formMode === "edit" ? "Post updated." : "Post published.");
      await load();
    } catch (error) {
      setNotice(
        messageFor(
          error,
          error?.message?.includes("Daily post limit")
            ? "You have reached the three-post daily limit."
            : "The post could not be saved.",
        ),
      );
    } finally {
      setBusy("");
    }
  };
  const updateVote = async (post, vote) => {
    const old = post.current_vote;
    const next = old === vote ? null : vote;
    setPosts((rows) =>
      rows.map((row) =>
        row.id === post.id
          ? {
              ...row,
              current_vote: next,
              helpful_count:
                Number(row.helpful_count) +
                (old === "Helpful" ? -1 : 0) +
                (next === "Helpful" ? 1 : 0),
              not_helpful_count:
                Number(row.not_helpful_count) +
                (old === "Not helpful" ? -1 : 0) +
                (next === "Not helpful" ? 1 : 0),
            }
          : row,
      ),
    );
    try {
      const client = await getSupabaseBrowserClient();
      const result = next
        ? await client
            .from("community_post_votes")
            .upsert(
              { post_id: post.id, user_id: userId, vote: next },
              { onConflict: "post_id,user_id" },
            )
        : await client
            .from("community_post_votes")
            .delete()
            .eq("post_id", post.id)
            .eq("user_id", userId);
      if (result.error) throw result.error;
    } catch (error) {
      setNotice(messageFor(error, "Your vote was not saved."));
      load();
    }
  };
  const toggleSave = async (post) => {
    try {
      const client = await getSupabaseBrowserClient();
      const result = post.is_saved
        ? await client
            .from("community_post_saves")
            .delete()
            .eq("post_id", post.id)
            .eq("user_id", userId)
        : await client
            .from("community_post_saves")
            .insert({ post_id: post.id, user_id: userId });
      if (result.error) throw result.error;
      setPosts((rows) =>
        rows.map((row) =>
          row.id === post.id
            ? {
                ...row,
                is_saved: !post.is_saved,
                save_count: Number(row.save_count) + (post.is_saved ? -1 : 1),
              }
            : row,
        ),
      );
    } catch (error) {
      setNotice(messageFor(error, "The save change did not complete."));
    }
  };
  const deletePost = async (post) => {
    if (!window.confirm(`Delete “${post.title}”? This cannot be undone.`))
      return;
    try {
      const client = await getSupabaseBrowserClient();
      const { error } = await client
        .from("community_posts")
        .delete()
        .eq("id", post.id);
      if (error) throw error;
      closeDialog();
      setNotice("Post deleted.");
      load();
    } catch (error) {
      setNotice(messageFor(error, "The post could not be deleted."));
    }
  };
  const submitReport = async (event) => {
    event.preventDefault();
    setBusy("report");
    const data = new FormData(event.currentTarget);
    try {
      const client = await getSupabaseBrowserClient();
      const { error } = await client.from("community_post_reports").insert({
        post_id: selected.id,
        reporter_id: userId,
        reason: data.get("reason"),
        details: String(data.get("details") || "").trim() || null,
      });
      if (error) throw error;
      closeDialog();
      setNotice("Report submitted for review.");
      load();
    } catch (error) {
      setNotice(
        messageFor(
          error,
          "The report could not be submitted. You may already have reported this post.",
        ),
      );
    } finally {
      setBusy("");
    }
  };
  const loadQueue = async () => {
    setModerating(true);
    try {
      const client = await getSupabaseBrowserClient();
      const { data, error } = await client.rpc("community_moderation_queue");
      if (error) throw error;
      setQueue(data || []);
    } catch (error) {
      setNotice(messageFor(error, "The moderator queue could not be loaded."));
    }
  };
  const moderate = async (id, action, clearReports = true) => {
    try {
      const client = await getSupabaseBrowserClient();
      const { error } = await client.rpc("moderate_community_post", {
        target_post_id: id,
        new_status: action,
        clear_reports: clearReports,
      });
      if (error) throw error;
      loadQueue();
      load();
    } catch (error) {
      setNotice(messageFor(error, "The moderation action failed."));
    }
  };
  const insertMarker = (kind) => {
    const field = document.getElementById("community-body");
    const start = field?.selectionStart ?? draft.body.length;
    const marker = getCommunityFormattingMarker(kind, draft.body, start);
    const next =
      `${draft.body.slice(0, start)}${marker}${draft.body.slice(start)}`.slice(
        0,
        COMMUNITY_LIMITS.body,
      );
    setDraft({ ...draft, body: next });
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + marker.length, start + marker.length);
    });
  };
  const renderActions = (post) => (
    <div
      className="community-card-actions"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-pressed={post.current_vote === "Helpful"}
        onClick={() => updateVote(post, "Helpful")}
      >
        Helpful · {post.helpful_count}
      </button>
      <button
        type="button"
        aria-pressed={post.current_vote === "Not helpful"}
        onClick={() => updateVote(post, "Not helpful")}
      >
        Not helpful · {post.not_helpful_count}
      </button>
      <button
        type="button"
        aria-pressed={post.is_saved}
        onClick={() => toggleSave(post)}
      >
        {post.is_saved ? "Saved" : "Save"} · {post.save_count}
      </button>
    </div>
  );
  return (
    <section className={`community-page${isMobile ? " is-mobile" : ""}`}>
      <header className="community-hero">
        <div>
          <span>Community</span>
          <h1>Course Advice Hub</h1>
          <p>
            Find tips, explanations, and study guides shared by other students.
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={remainingPosts === 0}
          onClick={openCreate}
        >
          {remainingPosts === 0 ? "Daily Limit Reached" : "Create Post"}
        </button>
      </header>
      {notice && (
        <div className="community-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}
      <div className="community-toolbar">
        <label>
          <span>Search courses and posts</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search course, title, text, or tags"
          />
        </label>
        <label>
          <span>Post type</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All post types</option>
            {COMMUNITY_POST_TYPES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="helpful">Most Helpful</option>
            <option value="newest">Newest</option>
            <option value="updated">Recently Updated</option>
          </select>
        </label>
        <button
          type="button"
          className={savedOnly ? "active" : ""}
          aria-pressed={savedOnly}
          onClick={() => setSavedOnly((value) => !value)}
        >
          Saved Posts
        </button>
        {isModerator && (
          <button type="button" onClick={loadQueue}>
            Moderator Queue
          </button>
        )}
      </div>
      {moderating && (
        <section className="community-moderator">
          <header>
            <h2>Moderator Queue</h2>
            <button type="button" onClick={() => setModerating(false)}>
              Close
            </button>
          </header>
          {queue.length ? (
            queue.map((post) => (
              <article key={post.id}>
                <strong>{post.title}</strong>
                <span>
                  {post.status} · {post.report_count} unique report(s)
                </span>
                <Body text={post.body} />
                <div>
                  {(post.reports || []).map((report, i) => (
                    <p key={i}>
                      <b>{report.reason}</b>
                      {report.details ? ` — ${report.details}` : ""}
                    </p>
                  ))}
                </div>
                <footer>
                  <button onClick={() => moderate(post.id, "active")}>
                    Restore
                  </button>
                  <button onClick={() => moderate(post.id, "hidden", false)}>
                    Keep hidden
                  </button>
                  <button onClick={() => moderate(post.id, "removed")}>
                    Remove
                  </button>
                </footer>
              </article>
            ))
          ) : (
            <p>No reported or hidden posts.</p>
          )}
        </section>
      )}
      {loading ? (
        <p className="community-empty" role="status">
          Loading community posts…
        </p>
      ) : posts.length === 0 ? (
        <p className="community-empty">
          {savedOnly
            ? "You have no saved posts yet."
            : "No posts match this search yet."}
        </p>
      ) : (
        <div className="community-grid">
          {posts.map((post) => (
            <article
              key={post.id}
              className="community-card"
              tabIndex="0"
              role="button"
              onClick={() => setSelected(post)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSelected(post);
              }}
            >
              <div className="community-card-meta">
                <span>{post.course_name}</span>
                <span>{post.post_type}</span>
                {post.author_id === userId && <b>Your Post</b>}
                {post.status === "hidden" && <b>Pending Review</b>}
              </div>
              <h2>{post.title}</h2>
              <Body text={post.body} preview />
              <div className="community-tags">
                {(post.topic_tags || []).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <p className="community-byline">
                {post.author_id === userId ? "Your Post" : "GlowDocket Student"}{" "}
                · {new Date(post.created_at).toLocaleDateString()}
              </p>
              {renderActions(post)}
            </article>
          ))}
        </div>
      )}
      {hasMore && (
        <button
          className="btn btn-secondary community-load"
          disabled={loadingMore}
          onClick={() => load(page + 1, true)}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
      {(selected || formMode || reporting) && (
        <div
          className="community-dialog-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
        >
          <section
            ref={dialogRef}
            className="community-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="community-dialog-title"
            tabIndex="-1"
          >
            {formMode ? (
              <form onSubmit={submit}>
                <header>
                  <div>
                    <span>
                      {formMode === "edit"
                        ? "Update your post"
                        : "Share original work"}
                    </span>
                    <h2 id="community-dialog-title">
                      {formMode === "edit" ? "Edit Post" : "Create Post"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={closeDialog}
                    aria-label="Close post form"
                  >
                    ×
                  </button>
                </header>
                <div className="community-form-grid">
                  <label>
                    Course name{" "}
                    <small>
                      {COMMUNITY_LIMITS.course - draft.course_name.length}
                    </small>
                    <input
                      required
                      maxLength={COMMUNITY_LIMITS.course}
                      value={draft.course_name}
                      onChange={(e) =>
                        setDraft({ ...draft, course_name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Post type
                    <select
                      value={draft.post_type}
                      onChange={(e) =>
                        setDraft({ ...draft, post_type: e.target.value })
                      }
                    >
                      {COMMUNITY_POST_TYPES.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label className="wide">
                    Title{" "}
                    <small>{COMMUNITY_LIMITS.title - draft.title.length}</small>
                    <input
                      required
                      maxLength={COMMUNITY_LIMITS.title}
                      value={draft.title}
                      onChange={(e) =>
                        setDraft({ ...draft, title: e.target.value })
                      }
                    />
                  </label>
                  <div className="wide">
                    <label htmlFor="community-body">
                      Main text{" "}
                      <small>{COMMUNITY_LIMITS.body - draft.body.length}</small>
                    </label>
                    <div
                      className="community-format-toolbar"
                      aria-label="Formatting toolbar"
                    >
                      <button
                        type="button"
                        onClick={() => insertMarker("heading")}
                      >
                        Heading
                      </button>
                      <button
                        type="button"
                        onClick={() => insertMarker("bullet")}
                      >
                        Bullet
                      </button>
                      <button
                        type="button"
                        onClick={() => insertMarker("numbered")}
                      >
                        Numbered
                      </button>
                    </div>
                    <textarea
                      id="community-body"
                      required
                      maxLength={COMMUNITY_LIMITS.body}
                      rows="12"
                      value={draft.body}
                      onChange={(e) =>
                        setDraft({ ...draft, body: e.target.value })
                      }
                    />
                  </div>
                  <label className="wide">
                    Topic tags <small>Comma separated; up to 8</small>
                    <input
                      value={draft.tags}
                      onChange={(e) =>
                        setDraft({ ...draft, tags: e.target.value })
                      }
                      placeholder="algebra, exam prep"
                    />
                  </label>
                </div>
                <section className="community-preview">
                  <h3>Preview</h3>
                  <Body
                    text={
                      draft.body || "Your formatted preview will appear here."
                    }
                  />
                </section>
                <aside className="community-rules">
                  <strong>Community rules</strong>
                  <ul>
                    <li>
                      Share original notes, explanations, and study strategies.
                    </li>
                    <li>
                      Do not share test questions, answer keys, or work for
                      another student to submit.
                    </li>
                    <li>
                      Do not include names, schedules, IDs, email addresses, or
                      private information.
                    </li>
                    <li>
                      Do not paste copyrighted chapters, advertisements, spam,
                      or harmful links.
                    </li>
                  </ul>
                </aside>
                <label className="community-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />{" "}
                  I confirm that this is my original work and does not contain
                  private information, test answers, or copyrighted material.
                </label>
                <footer>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={closeDialog}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={
                      Boolean(
                        validateCommunityPost(
                          {
                            ...draft,
                            topic_tags: parseCommunityTags(draft.tags),
                          },
                          confirmed,
                        ),
                      ) || busy === "submit"
                    }
                  >
                    {busy
                      ? "Saving…"
                      : formMode === "edit"
                        ? "Save Changes"
                        : "Publish Post"}
                  </button>
                </footer>
              </form>
            ) : reporting ? (
              <form onSubmit={submitReport}>
                <header>
                  <h2 id="community-dialog-title">Report Post</h2>
                  <button type="button" onClick={closeDialog}>
                    ×
                  </button>
                </header>
                <label>
                  Reason
                  <select name="reason" required>
                    {COMMUNITY_REPORT_REASONS.map((reason) => (
                      <option key={reason}>{reason}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Optional details
                  <textarea name="details" maxLength="1000" rows="5" />
                </label>
                <footer>
                  <button type="button" onClick={closeDialog}>
                    Cancel
                  </button>
                  <button type="submit" disabled={busy === "report"}>
                    Submit Report
                  </button>
                </footer>
              </form>
            ) : (
              <article>
                <header>
                  <div>
                    <span>
                      {selected.course_name} · {selected.post_type}
                    </span>
                    <h2 id="community-dialog-title">{selected.title}</h2>
                  </div>
                  <button type="button" onClick={closeDialog}>
                    ×
                  </button>
                </header>
                {selected.status === "hidden" && (
                  <p className="community-pending">
                    Pending Review — this post is hidden from normal search.
                  </p>
                )}
                <Body text={selected.body} />
                {import.meta.env.VITE_FLASHCARDS_ENABLED === "true" && (
                  <CommunityFlashcardActions
                    post={selected}
                    userId={userId}
                    onMessage={setNotice}
                  />
                )}
                <div className="community-tags">
                  {(selected.topic_tags || []).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <p>
                  {selected.author_id === userId
                    ? "Your Post"
                    : "GlowDocket Student"}{" "}
                  · {new Date(selected.created_at).toLocaleString()}
                </p>
                {renderActions(selected)}
                <footer>
                  {selected.author_id === userId && (
                    <>
                      <button onClick={() => openEdit(selected)}>Edit</button>
                      <button
                        className="btn-danger"
                        onClick={() => deletePost(selected)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                  <button onClick={() => setReporting(true)}>Report</button>
                </footer>
              </article>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
