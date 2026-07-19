const commonProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: "2.6",
};

function EmblemArtwork({ id }) {
  switch (id) {
    case "first-completion": return <><path d="m24 5 4.2 10.2L39 16l-8.2 7 2.6 10.5L24 28l-9.4 5.5L17.2 23 9 16l10.8-.8Z" /><circle cx="24" cy="24" r="4.5" /></>;
    case "five-completions": return <><path d="M12 34c4-9 9-15 18-20l6 6c-5 9-11 14-20 18Z" /><path d="m27 17 7 7M14 34l-4 4m8-3-1 6m-5-9-6 1" /><circle cx="31" cy="19" r="2.5" /></>;
    case "ten-completions": return <><path d="M11 14h26v21H11z" /><path d="M16 9v10m16-10v10M11 20h26M17 27h4m6 0h4m-14 5h4m6 0h4" /></>;
    case "twenty-five-completions": return <><path d="M15 10h18v9c0 8-4 13-9 15-5-2-9-7-9-15Z" /><path d="M15 14H9c0 7 3 10 8 10m16-10h6c0 7-3 10-8 10M24 34v6m-8 0h16" /><path d="m24 16 1.8 3.7 4.2.6-3 2.9.7 4.1-3.7-2-3.7 2 .7-4.1-3-2.9 4.2-.6Z" /></>;
    case "weekly-goal": return <><circle cx="24" cy="24" r="15" /><circle cx="24" cy="24" r="9" /><circle cx="24" cy="24" r="3" /><path d="m27 21 11-11m0 0-1 7m1-7-7 1" /></>;
    case "double-weekly-goal": return <><path d="M25 5 12 27h10l-2 16 16-25H25Z" /><path d="m9 12 4 2 2 4m23 15-4-2-2-4" /></>;
    case "three-productive-days": return <><path d="M24 7c2 7 10 10 10 20a10 10 0 0 1-20 0c0-5 3-9 7-13 0 6 3 8 5 9 2-5 0-10-2-16Z" /><path d="M24 27c3 3 4 5 2 9-5 1-8-3-6-7 1-2 2-3 3-5 0 2 0 2 1 3Z" /></>;
    case "five-productive-days": return <><path d="M12 38 8 17l9-4 7-7 7 7 9 4-4 21-12 5Z" /><path d="m17 25 5 5 10-12M13 14l4 5m18-5-4 5" /></>;
    case "high-priority": return <><path d="M27 5 13 27h10l-2 16 15-25H25Z" /><path d="M8 9h6M6 15h5m29 18h-6m8-6h-5" /></>;
    case "overdue-recovery": return <><path d="M24 5c5 4 10 5 15 6v11c0 11-7 17-15 21-8-4-15-10-15-21V11c5-1 10-2 15-6Z" /><path d="m16 24 5 5 11-12" /><path d="M24 10v4" /></>;
    case "ahead-of-schedule": return <><circle cx="21" cy="25" r="14" /><path d="M21 17v9l7 4M12 9l-4 4m22-4 4 4M34 29h8m-5-5 5 5-5 5" /></>;
    case "quick-win": return <><path d="M29 7c-10 5-16 13-18 25 8 2 17-1 23-9 3-4 4-9 5-15-4 0-7-1-10-1Z" /><path d="M28 19C19 24 13 32 9 40m18-10 8 4m-18-5-3-8" /></>;
    case "deep-work": return <><path d="m6 38 12-20 6 8 7-14 11 26Z" /><path d="m16 22 4 3 4-5 4 4 3-5 5 6M10 38h30" /><circle cx="11" cy="11" r="3" /></>;
    case "course-five": return <><path d="m5 18 19-9 19 9-19 9Z" /><path d="M13 23v9c6 5 16 5 22 0v-9M40 20v12" /><circle cx="40" cy="35" r="2" /></>;
    case "related-tasks": return <><path d="M11 9h20v27H11z" /><path d="M17 9V6h8v3m-8 8 2 2 4-5m-6 12 2 2 4-5m4-5h9v23H18" /></>;
    case "focus-finish": return <><path d="M17 17c-5 0-7 4-5 8-4 4-1 10 4 10 1 5 8 6 11 2 4 2 9-1 8-6 5-2 5-9 0-11 1-5-5-8-9-5-3-3-8-1-9 2Z" /><path d="M23 15v23m-7-16c4 0 5 2 5 5m8-8c-4 1-5 4-4 7m4 6c-3 0-4 2-4 5" /><path d="m35 8 1.5 3.5L40 13l-3.5 1.5L35 18l-1.5-3.5L30 13l3.5-1.5Z" /></>;
    case "locked": return <><rect x="11" y="20" width="26" height="21" rx="5" /><path d="M17 20v-5a7 7 0 0 1 14 0v5M24 28v6" /><circle cx="24" cy="28" r="2" /></>;
    default: return <><circle cx="24" cy="24" r="15" /><path d="m24 13 3.2 6.5 7.2 1-5.2 5.1 1.2 7.2-6.4-3.4-6.4 3.4 1.2-7.2-5.2-5.1 7.2-1Z" /></>;
  }
}

export default function AchievementEmblem({ id, className = "" }) {
  return <svg className={`achievement-emblem ${className}`.trim()} viewBox="0 0 48 48" aria-hidden="true" focusable="false" {...commonProps}><EmblemArtwork id={id} /></svg>;
}
