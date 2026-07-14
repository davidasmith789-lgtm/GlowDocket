# GlowDocket Project Instructions

## Project Overview
GlowDocket is a React + Vite assignment planner for students. It helps users organize school assignments by course, due date, priority, estimated time, repeat frequency, notes, and completion status.

## Current Tech Stack
- React
- Vite
- JavaScript
- CSS
- localStorage for saving data
- react-calendar for the calendar view
- Vercel for deployment

## Important Files
- `src/App.jsx` contains most of the app logic and UI.
- `src/App.css` contains the styling for layout, theme, modals, calendar, task cards, dashboard, and responsive design.
- `package.json` contains dependencies and scripts.

## Current Features
GlowDocket currently includes:
- Add assignments
- Complete assignments
- Undo completed assignments
- Delete assignments
- Edit assignments using a modal popup
- Assignment notes
- Calendar view
- Click calendar assignments to view/edit notes
- Course colors
- Delete courses
- Filters for assignments
- Repeat assignments
- Dark/light mode
- Local username profiles using localStorage
- Collapsible filter panel
- Collapsible Add Assignment section
- Collapsible Course Colors section
- Public deployment through Vercel

## Coding Rules
- Do not rewrite the entire app unless explicitly asked.
- Work one feature at a time.
- Before editing, explain what files you plan to change.
- Prefer small, safe changes.
- Do not remove existing features.
- Preserve localStorage behavior unless asked to migrate to a database.
- Avoid changing unrelated CSS.
- Avoid creating unnecessary new dependencies.
- After edits, explain what changed and how to test it.
- If JSX nesting is involved, be extra careful with closing tags.
- If uncertain, ask before making changes.
- Do not make broad design changes without approval.
- Do not rename major state variables or functions unless there is a strong reason.
- Keep the app beginner-friendly and easy to maintain.

## Style Goals
GlowDocket should feel like a clean, modern student productivity dashboard.

The design should be:
- Professional
- Easy to use
- Spacious but not wasteful
- Dark mode friendly
- Mobile responsive
- Good for a high school or college student audience

## Current UI Structure
The app has multiple main sections:
- A sign-in/profile area using local username profiles
- A dashboard/home area
- A To Do assignments section
- A Completed assignments section
- A Calendar section
- Course color controls
- Assignment creation form
- Edit assignment modal

## Current Priority
The next major planned feature is a dashboard section called “Recommended Plan of Attack.”

This feature should suggest which assignments the user should work on first based on:
- Due date
- Priority
- Estimated work time
- Completion status

It should not remove or replace the existing To Do, Completed, or Calendar sections.

## How to Work on This Project
When I ask for help:
1. Read the relevant files first.
2. Explain the plan before editing.
3. Make the smallest safe change possible.
4. Tell me exactly what changed.
5. Tell me how to test it locally.
6. Avoid breaking the current layout or existing features.

## Testing Expectations
After changes, the app should still work with:

```bash
npm run dev

And it should still successfully build with:
</> Bash
npm run build

Deployment Notes

The app is deployed through Vercel from GitHub. After a good local test, changes should be committed and pushed to GitHub so Vercel can redeploy.
