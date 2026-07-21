import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../supabaseClient.js";
import CommunityFlashcardActions from "./CommunityFlashcardActions.jsx";
import FlashcardProfileChip from "./FlashcardProfileChip.jsx";
import FlashcardProfileSharingControls from "./FlashcardProfileSharingControls.jsx";
import { buildFlashcardProfileTags, getFlashcardLevel } from "../flashcardUtils.js";
import { communityEditorToMarkup, communityMarkupToEditorHtml } from "../communityEditorUtils.js";
import {
  COMMUNITY_LIMITS,
  COMMUNITY_POST_TYPES,
  COMMUNITY_REPORT_REASONS,
  clearCommunityDraft,
  communityBodyBlocks,
  hasMeaningfulCommunityDraft,
  loadCommunityDraft,
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
const HIGHLIGHT_PALETTE = [
  ["#fce8e6", "#fef3e0", "#fff8c5", "#e6f4ea", "#e0f7fa", "#e8f0fe", "#f3e8fd", "#fce8f3"],
  ["#f8b4ae", "#fbd39b", "#fce88a", "#a8dab5", "#9adfe6", "#aecbfa", "#d7aefb", "#f6aea9"],
  ["#e67c73", "#f6b26b", "#f6d04d", "#57bb8a", "#46bdc6", "#7baaf7", "#b694e8", "#e67caa"],
  ["#c53929", "#e37400", "#b06000", "#188038", "#007b83", "#1967d2", "#8430ce", "#b80672"],
  ["#7a1f17", "#8a4300", "#6f4b00", "#0d652d", "#00585e", "#174ea6", "#5f249f", "#78004f"],
];
const highlightTextColor = (color) => {
  const hex = String(color).replace("#", "");
  const [red, green, blue] = [0, 2, 4].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? "#111827" : "#ffffff";
};
const browserColorToHex = (value, fallback = "#172033") => {
  if (/transparent|rgba\([^)]*,\s*0(?:\.0+)?\s*\)/i.test(String(value || ""))) return fallback;
  const rgb = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgb) return `#${rgb.slice(1, 4).map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}`;
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
};
const InlineText = ({ text }) => {
  const namedLink = String(text).match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/i);
  if (namedLink && isSafeCommunityLink(namedLink[2])) return <a href={namedLink[2]} target="_blank" rel="noreferrer">{namedLink[1]}</a>;
  return String(text).split(/(\^\^#[0-9a-f]{6}\|.*?\^\^|@@(?:c:#[0-9a-f]{6}|f:[^|@]+|s:[1-7]|a:(?:left|center|right))\|.*?@@|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*)/gi).filter(Boolean).map((part, index) => {
    const highlight = part.match(/^\^\^(#[0-9a-f]{6})\|(.*?)\^\^$/i);
    if (highlight) return <mark key={index} style={{ backgroundColor: highlight[1], color: highlightTextColor(highlight[1]) }}><InlineText text={highlight[2]} /></mark>;
    const styled = part.match(/^@@(c:#[0-9a-f]{6}|f:[^|@]+|s:[1-7]|a:(?:left|center|right))\|(.*?)@@$/i);
    if (styled) {
      const [kind, value] = styled[1].split(":");
      const fontSizes = { 1: ".75em", 2: ".875em", 3: "1em", 4: "1.2em", 5: "1.5em", 6: "2em", 7: "2.5em" };
      const style = kind === "c" ? { color: value } : kind === "f" ? { fontFamily: value } : kind === "a" ? { display: "block", textAlign: value } : { fontSize: fontSizes[value] };
      return <span key={index} style={style}><InlineText text={styled[2]} /></span>;
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}><InlineText text={part.slice(2, -2)} /></strong>;
    if (/^__[^_]+__$/.test(part)) return <u key={index}><InlineText text={part.slice(2, -2)} /></u>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={index}><InlineText text={part.slice(1, -1)} /></em>;
    return <span key={index}>{part}</span>;
  });
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

export default function CommunityHub({ userId, courses = [], displayName = "", profileSettings = {}, onProfileSettingsChange = () => {}, isMobile = false }) {
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
  const [highlightMenuOpen, setHighlightMenuOpen] = useState(false);
  const [highlightColor, setHighlightColor] = useState("#fff8c5");
  const [editorToolbarState, setEditorToolbarState] = useState({ block: "p", font: "Arial", size: "3", bold: false, italic: false, underline: false, textColor: "#172033", highlighted: false });
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
  const bodyRef = useRef(null);
  const editorRangeRef = useRef(null);
  const closeDialogRef = useRef(null);
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
    setHighlightMenuOpen(false);
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);
  const closeDialog = useCallback(() => {
    if (formMode === "create") saveCommunityDraft(window.localStorage, userId, draft);
    resetDialog();
  }, [draft, formMode, resetDialog, userId]);
  useEffect(() => {
    closeDialogRef.current = closeDialog;
  }, [closeDialog]);
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
      if (event.key === "Escape") closeDialogRef.current?.();
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
  }, [formMode, reporting, selected]);
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
    if (bodyRef.current) bodyRef.current.innerHTML = "";
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
  useEffect(() => {
    if (!formMode || (isMobile && mobileComposerView !== "edit") || !bodyRef.current) return;
    bodyRef.current.innerHTML = communityMarkupToEditorHtml(draft.body);
  // Draft changes originate inside the editor; reloading them would reset the caret.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formMode, mobileComposerView]);
  const rememberEditorRange = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && bodyRef.current?.contains(selection.anchorNode)) editorRangeRef.current = selection.getRangeAt(0).cloneRange();
  };
  const restoreEditorRange = () => {
    if (!editorRangeRef.current) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(editorRangeRef.current);
  };
  const readEditorToolbarState = useCallback(() => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !bodyRef.current?.contains(selection.anchorNode)) return;
    const rawBlock = String(document.queryCommandValue("formatBlock") || "p").replace(/[<>]/g, "").toLowerCase();
    const rawFont = String(document.queryCommandValue("fontName") || "Arial").replace(/["']/g, "");
    const font = ["Arial", "Georgia", "Verdana", "Trebuchet MS", "Courier New"].find((option) => rawFont.toLowerCase().includes(option.toLowerCase())) || "Arial";
    const size = String(document.queryCommandValue("fontSize") || "3");
    const rawHighlight = document.queryCommandValue("hiliteColor") || document.queryCommandValue("backColor");
    const highlighted = Boolean(rawHighlight) && !/transparent|rgba\([^)]*,\s*0(?:\.0+)?\s*\)/i.test(String(rawHighlight));
    const nextHighlight = browserColorToHex(rawHighlight, highlightColor);
    if (highlighted) setHighlightColor(nextHighlight);
    setEditorToolbarState({
      block: ["h2", "blockquote"].includes(rawBlock) ? rawBlock : "p",
      font,
      size: ["2", "3", "4", "5"].includes(size) ? size : "3",
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      textColor: browserColorToHex(document.queryCommandValue("foreColor")),
      highlighted,
    });
  }, [highlightColor]);
  useEffect(() => {
    if (!formMode) return undefined;
    const update = () => readEditorToolbarState();
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [formMode, readEditorToolbarState]);
  const syncEditorDraft = () => {
    const body = communityEditorToMarkup(bodyRef.current).slice(0, COMMUNITY_LIMITS.body);
    setDraft((current) => ({ ...current, body }));
    rememberEditorRange();
  };
  const runEditorCommand = (command, value = null) => {
    restoreEditorRange();
    bodyRef.current?.focus();
    document.execCommand(command, false, value);
    syncEditorDraft();
    readEditorToolbarState();
  };
  const chooseHighlightColor = (color) => {
    setHighlightColor(color);
    runEditorCommand("hiliteColor", color);
    setHighlightMenuOpen(false);
  };
  const pickHighlightFromScreen = async () => {
    if (!("EyeDropper" in window)) return;
    rememberEditorRange();
    try {
      const result = await new window.EyeDropper().open();
      if (result?.sRGBHex) chooseHighlightColor(result.sRGBHex);
    } catch {
      // Closing the eyedropper without choosing a color is not an error.
    }
  };
  const handleBodyKeyDown = (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      runEditorCommand(event.shiftKey ? "outdent" : "indent");
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
        <FlashcardProfileSharingControls profileSettings={profileSettings} onChange={onProfileSettingsChange} level={getFlashcardLevel(flashcardXp).level} displayName={displayName} />
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
                      className="community-format-toolbar community-rich-toolbar"
                      aria-label="Formatting toolbar"
                      onMouseDown={(event) => {
                        if (event.target.closest("button")) event.preventDefault();
                      }}
                    >
                      <div className="community-toolbar-group" aria-label="History">
                        <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={() => runEditorCommand("undo")}>↶</button>
                        <button type="button" title="Redo (Ctrl+Y)" aria-label="Redo" onClick={() => runEditorCommand("redo")}>↷</button>
                      </div>
                      <select aria-label="Paragraph style" value={editorToolbarState.block} onChange={(event) => runEditorCommand("formatBlock", event.target.value)}>
                        <option value="p">Normal text</option>
                        <option value="h2">Heading</option>
                        <option value="blockquote">Quote</option>
                      </select>
                      <select aria-label="Font" value={editorToolbarState.font} onChange={(event) => runEditorCommand("fontName", event.target.value)}>
                        <option>Arial</option><option>Georgia</option><option>Verdana</option><option>Trebuchet MS</option><option>Courier New</option>
                      </select>
                      <select aria-label="Text size" value={editorToolbarState.size} onChange={(event) => runEditorCommand("fontSize", event.target.value)}>
                        <option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">Title</option>
                      </select>
                      <div className="community-toolbar-group" aria-label="Text formatting">
                        <button type="button" className={editorToolbarState.bold ? "is-active" : ""} aria-pressed={editorToolbarState.bold} title="Bold (Ctrl+B)" aria-label="Bold" onClick={() => runEditorCommand("bold")}><strong>B</strong></button>
                        <button type="button" className={editorToolbarState.italic ? "is-active" : ""} aria-pressed={editorToolbarState.italic} title="Italic (Ctrl+I)" aria-label="Italic" onClick={() => runEditorCommand("italic")}><em>I</em></button>
                        <button type="button" className={editorToolbarState.underline ? "is-active" : ""} aria-pressed={editorToolbarState.underline} title="Underline (Ctrl+U)" aria-label="Underline" onClick={() => runEditorCommand("underline")}><u>U</u></button>
                        <label className="community-toolbar-color" title="Text color"><span>A</span><input type="color" value={editorToolbarState.textColor} aria-label="Text color" onChange={(event) => runEditorCommand("foreColor", event.target.value)} /></label>
                      </div>
                      <div className="community-highlight-control">
                        <button
                          type="button"
                          className={`community-highlight-button${editorToolbarState.highlighted ? " is-active" : ""}`}
                          aria-expanded={highlightMenuOpen}
                          aria-controls="community-highlight-palette"
                          onClick={() => {
                            rememberEditorRange();
                            setHighlightMenuOpen((open) => !open);
                          }}
                        >
                          <span aria-hidden="true" style={{ backgroundColor: highlightColor }}>A</span>
                          Highlight color
                        </button>
                        {highlightMenuOpen && (
                          <div id="community-highlight-palette" className="community-highlight-palette" role="dialog" aria-label="Highlight colors">
                            <strong>Highlight color</strong>
                            <div className="community-highlight-swatches" aria-label="Preset highlight colors">
                              {HIGHLIGHT_PALETTE.flatMap((row, rowIndex) => row.map((color, columnIndex) => (
                                <button
                                  type="button"
                                  key={color}
                                  className={highlightColor.toLowerCase() === color ? "is-selected" : ""}
                                  style={{ backgroundColor: color }}
                                  onClick={() => chooseHighlightColor(color)}
                                  aria-label={`Use highlight color ${color}, shade ${rowIndex + 1}, column ${columnIndex + 1}`}
                                  title={color}
                                />
                              )))}
                            </div>
                            <div className="community-highlight-custom">
                              <label>
                                <span>Custom color</span>
                                <input type="color" value={highlightColor} onChange={(event) => chooseHighlightColor(event.target.value)} />
                              </label>
                              <button type="button" className="community-highlight-transparent" onClick={() => { runEditorCommand("hiliteColor", "transparent"); setHighlightMenuOpen(false); }} title="Remove highlighting from selected text or future typing">
                                <span aria-hidden="true">A</span> Transparent
                              </button>
                              <button type="button" onClick={pickHighlightFromScreen} disabled={!("EyeDropper" in window)} title={("EyeDropper" in window) ? "Choose a color from anywhere on your screen" : "Screen color picking is not supported by this browser"}>
                                Pick from screen
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="community-toolbar-group" aria-label="Insert and arrange">
                        <button type="button" title="Add link" aria-label="Add link" onClick={() => { const url = window.prompt("Paste a web address"); if (url && isSafeCommunityLink(url)) runEditorCommand("createLink", url); }}>🔗</button>
                        <button type="button" title="Bulleted list" aria-label="Bulleted list" onClick={() => runEditorCommand("insertUnorderedList")}>•≡</button>
                        <button type="button" title="Numbered list" aria-label="Numbered list" onClick={() => runEditorCommand("insertOrderedList")}>1≡</button>
                        <button type="button" title="Decrease indent (Shift+Tab)" aria-label="Decrease indent" onClick={() => runEditorCommand("outdent")}>⇤</button>
                        <button type="button" title="Increase indent (Tab)" aria-label="Increase indent" onClick={() => runEditorCommand("indent")}>⇥</button>
                        <button type="button" title="Align left" aria-label="Align left" onClick={() => runEditorCommand("justifyLeft")}>☰</button>
                        <button type="button" title="Align center" aria-label="Align center" onClick={() => runEditorCommand("justifyCenter")}>≡</button>
                        <button type="button" title="Clear formatting" aria-label="Clear formatting" onClick={() => runEditorCommand("removeFormat")}>Tx</button>
                      </div>
                    </div>
                    <div
                      ref={bodyRef}
                      id="community-body"
                      className="community-rich-editor"
                      contentEditable
                      role="textbox"
                      aria-multiline="true"
                      aria-label="Main text"
                      data-placeholder="Start writing your post…"
                      suppressContentEditableWarning
                      onKeyDown={handleBodyKeyDown}
                      onInput={syncEditorDraft}
                      onMouseUp={rememberEditorRange}
                      onKeyUp={rememberEditorRange}
                      onFocus={rememberEditorRange}
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
