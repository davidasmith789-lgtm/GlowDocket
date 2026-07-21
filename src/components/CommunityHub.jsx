import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../supabaseClient.js";
import CommunityFlashcardActions from "./CommunityFlashcardActions.jsx";
import FlashcardProfileChip from "./FlashcardProfileChip.jsx";
import { buildFlashcardProfileTags, getFlashcardLevel } from "../flashcardUtils.js";
import {
  COMMUNITY_LIMITS,
  COMMUNITY_POST_TYPES,
  COMMUNITY_REPORT_REASONS,
  clearCommunityDraft,
  communityBodyBlocks,
  hasMeaningfulCommunityDraft,
  loadCommunityDraft,
  getCommunityFormattingMarker,
  isSafeCommunityLink,
  matchCommunityCourses,
  normalizeCommunityLinks,
  parseCommunityTags,
  saveCommunityDraft,
  validateCommunityPost,
} from "../communityUtils.js";
import "./CommunityHub.css";

const EMPTY = {
  course_name: "",
  post_type: COMMUNITY_POST_TYPES[0],
  title: "",
  body: "",
  tags: "",
  links: [],
};
const PAGE_SIZE = 20;
const isMissingCommunityLinksSchema = (error) =>
  error?.code === "PGRST202"
  || /schema cache|new_links|column .*links/i.test(error?.message || "");
const bodyWithNamedLinks = (body, links) => links.length
  ? `${body.trimEnd()}\n\n## Links\n${links.map((link) => `[${link.name}](${link.url})`).join("\n")}`
  : body;
const messageFor = (error, fallback) =>
  !navigator.onLine
    ? "You appear to be offline. Reconnect and try again."
    : error?.message || fallback;
const InlineText = ({ text }) => {
  const namedLink = String(text).match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/i);
  if (namedLink && isSafeCommunityLink(namedLink[2])) return <a href={namedLink[2]} target="_blank" rel="noreferrer">{namedLink[1]}</a>;
  return String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    /^\*\*[^*]+\*\*$/.test(part) ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>,
  );
};
const Body = ({ text, preview = false }) => (
  <div className={`community-body${preview ? " is-preview" : ""}`}>
    {communityBodyBlocks(text).map((block, index) =>
      block.type === "heading" ? (
        <h3 key={index}><InlineText text={block.text} /></h3>
      ) : block.type === "bullets" ? (
        <ul key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}><InlineText text={item} /></li>
          ))}
        </ul>
      ) : block.type === "numbers" ? (
        <ol key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}><InlineText text={item} /></li>
          ))}
        </ol>
      ) : (
        <p key={index}>
          {block.lines.map((line, lineIndex) => (
            <span key={lineIndex}>
              <InlineText text={line} />
              {lineIndex < block.lines.length - 1 && <br />}
            </span>
          ))}
        </p>
      ),
    )}
  </div>
);

export default function CommunityHub({ userId, courses = [], displayName = "", profileSettings = {}, isMobile = false }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("helpful");
  const [savedOnly, setSavedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState(null);
  const [formMode, setFormMode] = useState("");
  const [draft, setDraft] = useState(EMPTY);
  const [draftStatus, setDraftStatus] = useState("");
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [mobileComposerView, setMobileComposerView] = useState("edit");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [isModerator, setIsModerator] = useState(false);
  const [remainingPosts, setRemainingPosts] = useState(null);
  const [moderating, setModerating] = useState(false);
  const [queue, setQueue] = useState([]);
  const [courseOptions, setCourseOptions] = useState([]);
  const [reporting, setReporting] = useState(false);
  const [flashcardXp, setFlashcardXp] = useState(0);
  const matchingCourseOptions = matchCommunityCourses(courseOptions, draft.course_name);
  const publicFlashcardProfile = {
    shareFlashcardLevel: profileSettings.shareFlashcardLevel === true,
    showFlashcardName: profileSettings.showFlashcardName === true,
    badgeId: !profileSettings.sharedFlashcardBadge || profileSettings.sharedFlashcardBadge === "current"
      ? profileSettings.selectedBadge || ""
      : profileSettings.sharedFlashcardBadge,
    level: getFlashcardLevel(flashcardXp).level,
    name: displayName,
  };
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const latestDraftRef = useRef(EMPTY);
  const latestFormModeRef = useRef("");
  useEffect(() => {
    latestDraftRef.current = draft;
    latestFormModeRef.current = formMode;
  }, [draft, formMode]);
  useEffect(() => () => {
    if (latestFormModeRef.current === "create") {
      saveCommunityDraft(window.localStorage, userId, latestDraftRef.current);
    }
  }, [userId]);
  useEffect(() => {
    getSupabaseBrowserClient().then((client) => client.rpc("flashcard_reward_summary")).then(({ data }) => setFlashcardXp(Number(data?.total_xp) || 0)).catch(() => setFlashcardXp(0));
  }, [userId]);
  const resetDialog = useCallback(() => {
    setFormMode("");
    setSelected(null);
    setReporting(false);
    setConfirmed(false);
    setDraft(EMPTY);
    setDraftStatus("");
    setDraftRestored(false);
    setMobileComposerView("edit");
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);
  const closeDialog = useCallback(() => {
    if (formMode === "create") saveCommunityDraft(window.localStorage, userId, draft);
    resetDialog();
  }, [draft, formMode, resetDialog, userId]);
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
        const rows = (data || []).filter((row) => row.status !== "removed");
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
    const saved = loadCommunityDraft(window.localStorage, userId);
    setDraft(saved?.draft || EMPTY);
    setDraftSavedAt(saved?.savedAt || null);
    setDraftRestored(Boolean(saved));
    setDraftStatus(saved ? "saved" : "");
    setMobileComposerView("edit");
    setConfirmed(false);
    setFormMode("create");
  };
  useEffect(() => {
    if (formMode !== "create") return undefined;
    const statusTimer = window.setTimeout(() => {
      if (!hasMeaningfulCommunityDraft(draft)) {
        clearCommunityDraft(window.localStorage, userId);
        setDraftStatus("");
        setDraftSavedAt(null);
      } else {
        setDraftStatus("saving");
      }
    }, 0);
    if (!hasMeaningfulCommunityDraft(draft)) {
      return () => window.clearTimeout(statusTimer);
    }
    const timer = window.setTimeout(() => {
      const saved = saveCommunityDraft(window.localStorage, userId, draft);
      if (saved) {
        setDraftSavedAt(saved.savedAt);
        setDraftStatus("saved");
      }
    }, 500);
    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(timer);
    };
  }, [draft, formMode, userId]);
  const discardCreateDraft = () => {
    clearCommunityDraft(window.localStorage, userId);
    latestDraftRef.current = EMPTY;
    setDraft(EMPTY);
    setDraftSavedAt(null);
    setDraftRestored(false);
    setDraftStatus("");
    setMobileComposerView("edit");
  };
  useEffect(() => {
    if (!formMode) return;
    getSupabaseBrowserClient()
      .then((client) =>
        client
          .from("community_posts")
          .select("course_name")
          .eq("status", "active")
          .order("course_name")
          .limit(500),
      )
      .then(({ data, error }) => {
        if (error) throw error;
        setCourseOptions(
          [...new Set([
            ...courses.map((course) => String(course || "").trim()),
            ...(data || []).map((row) => row.course_name.trim()),
          ])].filter(Boolean),
        );
      })
      .catch(() => setCourseOptions([]));
  }, [courses, formMode]);
  const openEdit = (post) => {
    setDraft({ ...post, tags: "", links: normalizeCommunityLinks(post.links) });
    setConfirmed(true);
    setSelected(null);
    setFormMode("edit");
  };
  const submit = async (event) => {
    event.preventDefault();
    const topic_tags = buildFlashcardProfileTags(parseCommunityTags(draft.tags), publicFlashcardProfile);
    const links = normalizeCommunityLinks(draft.links);
    const errorText = validateCommunityPost(
      { ...draft, topic_tags },
      confirmed,
    );
    if (errorText) return setNotice(errorText);
    setBusy("submit");
    try {
      const client = await getSupabaseBrowserClient();
      if (formMode === "edit") {
        let { error } = await client
          .from("community_posts")
          .update({
            course_name: draft.course_name.trim(),
            post_type: draft.post_type,
            title: draft.title.trim(),
            body: draft.body,
            topic_tags,
            links,
          })
          .eq("id", draft.id);
        if (error && isMissingCommunityLinksSchema(error)) {
          const fallback = await client.from("community_posts").update({
            course_name: draft.course_name.trim(),
            post_type: draft.post_type,
            title: draft.title.trim(),
            body: bodyWithNamedLinks(draft.body, links),
            topic_tags,
          }).eq("id", draft.id);
          error = fallback.error;
        }
        if (error) throw error;
      } else {
        let { error } = await client.rpc("create_community_post", {
          new_course_name: draft.course_name.trim(),
          new_post_type: draft.post_type,
          new_title: draft.title.trim(),
          new_body: draft.body,
          new_topic_tags: topic_tags,
          new_links: links,
        });
        if (error && isMissingCommunityLinksSchema(error)) {
          const fallback = await client.rpc("create_community_post", {
            new_course_name: draft.course_name.trim(),
            new_post_type: draft.post_type,
            new_title: draft.title.trim(),
            new_body: bodyWithNamedLinks(draft.body, links),
            new_topic_tags: topic_tags,
          });
          error = fallback.error;
        }
        if (error) throw error;
        setRemainingPosts((count) => Math.max(0, Number(count ?? 3) - 1));
      }
      if (formMode === "create") {
        clearCommunityDraft(window.localStorage, userId);
        latestFormModeRef.current = "";
      }
      resetDialog();
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
      let { data: deleted, error } = await client.rpc("delete_community_post", {
        target_post_id: post.id,
      });
      if (error && isModerator && (error.code === "PGRST202" || /delete_community_post/i.test(error.message || ""))) {
        const fallback = await client.rpc("moderate_community_post", {
          target_post_id: post.id,
          new_status: "removed",
          clear_reports: true,
        });
        error = fallback.error;
        deleted = !fallback.error;
      }
      if (error) throw error;
      if (!deleted) throw new Error("The post was not deleted.");
      closeDialog();
      setNotice("Post deleted.");
      setPosts((rows) => rows.filter((row) => row.id !== post.id));
      await load();
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
  const editBodySelection = (kind) => {
    const field = document.getElementById("community-body");
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selectedText = draft.body.slice(start, end);
    const insertion = kind === "bold"
      ? `**${selectedText}**`
      : `  ${selectedText}`;
    const next = `${draft.body.slice(0, start)}${insertion}${draft.body.slice(end)}`.slice(0, COMMUNITY_LIMITS.body);
    setDraft({ ...draft, body: next });
    requestAnimationFrame(() => {
      field.focus();
      if (kind === "bold") {
        const cursorStart = start + 2;
        field.setSelectionRange(cursorStart, cursorStart + selectedText.length);
      } else {
        field.setSelectionRange(start + 2, end + 2);
      }
    });
  };
  const handleBodyKeyDown = (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      editBodySelection("indent");
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      editBodySelection("bold");
    }
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
      {isMobile && (
        <button
          type="button"
          className="community-search-toggle"
          aria-expanded={mobileSearchOpen}
          aria-controls="community-search-filters"
          onClick={() => setMobileSearchOpen((open) => !open)}
        >
          <span><strong>Search & filters</strong><small>Find courses, post types, and saved posts</small></span>
          <b aria-hidden="true">{mobileSearchOpen ? "−" : "+"}</b>
        </button>
      )}
      {(!isMobile || mobileSearchOpen) && <div className="community-toolbar" id="community-search-filters">
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
      </div>}
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
                <span className="community-course-pill">{post.course_name}</span>
                <span className="community-type-pill">{post.post_type}</span>
                {post.author_id === userId && <b className="community-owner-pill">Your Post</b>}
                {post.status === "hidden" && <b className="community-status-pill">Pending Review</b>}
              </div>
              <div className="community-card-content">
                <h2>{post.title}</h2>
                <Body text={post.body} preview />
              </div>
              <div className="community-links">
                {normalizeCommunityLinks(post.links).map((link) => (
                  <a key={`${link.name}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{link.name}</a>
                ))}
              </div>
              <div className="community-card-footer">
                <p className="community-byline">
                  <strong>{post.author_id === userId ? "You" : "GlowDocket Student"}</strong>
                  <span>{new Date(post.created_at).toLocaleDateString()}</span>
                </p>
                <FlashcardProfileChip tags={post.topic_tags || []} compact />
                {renderActions(post)}
              </div>
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
                {formMode === "create" && draftRestored && (
                  <aside className="community-draft-restored" role="status">
                    <div>
                      <strong>Draft restored</strong>
                      <span>{draftSavedAt ? `Last saved ${new Date(draftSavedAt).toLocaleString()}` : "Saved on this device"}</span>
                    </div>
                    <div>
                      <button type="button" onClick={() => { setDraftRestored(false); requestAnimationFrame(() => document.getElementById("community-body")?.focus()); }}>Continue writing</button>
                      <button type="button" onClick={discardCreateDraft}>Clear draft</button>
                    </div>
                  </aside>
                )}
                {formMode === "create" && (
                  <div className="community-draft-toolbar">
                    <span className={`community-draft-status${draftStatus ? ` is-${draftStatus}` : ""}`} aria-live="polite">
                      {draftStatus === "saving" ? "Saving draft…" : draftStatus === "saved" ? "Draft saved · Saved on this device" : "Drafts save on this device"}
                    </span>
                    {isMobile && (
                      <div className="community-composer-switch" aria-label="Post composer view">
                        <button type="button" className={mobileComposerView === "edit" ? "active" : ""} aria-pressed={mobileComposerView === "edit"} onClick={() => setMobileComposerView("edit")}>Edit</button>
                        <button type="button" className={mobileComposerView === "preview" ? "active" : ""} aria-pressed={mobileComposerView === "preview"} onClick={() => setMobileComposerView("preview")}>Preview</button>
                      </div>
                    )}
                  </div>
                )}
                {(!isMobile || mobileComposerView === "edit") && (
                <div className="community-form-grid">
                  <label>
                    Course name{" "}
                    <small>
                      {COMMUNITY_LIMITS.course - draft.course_name.length}
                    </small>
                    <input
                      required
                      maxLength={COMMUNITY_LIMITS.course}
                      autoComplete="off"
                      aria-autocomplete="list"
                      aria-controls="community-course-suggestions"
                      value={draft.course_name}
                      onChange={(e) =>
                        setDraft({ ...draft, course_name: e.target.value })
                      }
                    />
                    {matchingCourseOptions.length > 0 && (
                      <div className="community-course-suggestions" id="community-course-suggestions" role="listbox">
                        {matchingCourseOptions.map((courseName) => (
                          <button key={courseName} type="button" role="option" aria-selected={draft.course_name === courseName} onClick={() => setDraft({ ...draft, course_name: courseName })}>
                            {courseName}
                          </button>
                        ))}
                      </div>
                    )}
                    <span className="community-course-help">
                      Choose an existing course suggestion, or keep typing to
                      create a new course name.
                    </span>
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
                      <button type="button" onClick={() => editBodySelection("bold")}>
                        <strong>Bold</strong>
                      </button>
                    </div>
                    <textarea
                      id="community-body"
                      required
                      maxLength={COMMUNITY_LIMITS.body}
                      rows="12"
                      placeholder="Title"
                      value={draft.body}
                      onKeyDown={handleBodyKeyDown}
                      onChange={(e) =>
                        setDraft({ ...draft, body: e.target.value })
                      }
                    />
                  </div>
                  <fieldset className="wide community-link-editor">
                    <legend>Links <small>Optional; show a name instead of the full address</small></legend>
                    {draft.links.map((link, index) => (
                      <div className="community-link-row" key={index}>
                        <input aria-label={`Link ${index + 1} name`} placeholder="Link name" maxLength="80" value={link.name} onChange={(event) => setDraft({ ...draft, links: draft.links.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} />
                        <input aria-label={`Link ${index + 1} URL`} placeholder="https://example.com" type="url" maxLength="2000" value={link.url} onChange={(event) => setDraft({ ...draft, links: draft.links.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item) })} />
                        <button type="button" aria-label={`Remove link ${index + 1}`} onClick={() => setDraft({ ...draft, links: draft.links.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>
                      </div>
                    ))}
                    {draft.links.length < 5 && <button type="button" className="community-add-link" onClick={() => setDraft({ ...draft, links: [...draft.links, { name: "", url: "" }] })}>Add link</button>}
                  </fieldset>
                </div>
                )}
                {(!isMobile || mobileComposerView === "preview") && <section className="community-preview">
                  <h3>Preview</h3>
                  <Body
                    text={
                      draft.body || "Your formatted preview will appear here."
                    }
                  />
                </section>}
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
              <article className="community-post-detail">
                <header className="community-detail-header">
                  <div className="community-detail-heading">
                    <div className="community-card-meta">
                      <span className="community-course-pill">{selected.course_name}</span>
                      <span className="community-type-pill">{selected.post_type}</span>
                    </div>
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
                <div className="community-links">
                  {normalizeCommunityLinks(selected.links).map((link) => (
                    <a key={`${link.name}-${link.url}`} href={link.url} target="_blank" rel="noreferrer">{link.name}</a>
                  ))}
                </div>
                <p className="community-detail-byline">
                  <strong>{selected.author_id === userId ? "You" : "GlowDocket Student"}</strong>
                  <span>{new Date(selected.created_at).toLocaleString()}</span>
                </p>
                <FlashcardProfileChip tags={selected.topic_tags || []} />
                {renderActions(selected)}
                <footer>
                  {selected.author_id === userId && <button onClick={() => openEdit(selected)}>Edit</button>}
                  {(selected.author_id === userId || isModerator) && (
                    <button
                      className="btn-danger"
                      onClick={() => deletePost(selected)}
                    >
                      Delete
                    </button>
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
