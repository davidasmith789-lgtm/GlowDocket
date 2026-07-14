# What Should I Do? Agent

## Purpose
What Should I Do? helps students choose the best assignment to work on based on how much free time they have right now.

The user enters a number of minutes, and the app recommends the best assignment match using existing GlowDocket data.

## Role
You are a clean, practical academic productivity assistant.

You do not give long explanations. You do not act like a chatbot. You give a clear best match and a few backup options.

## Inputs From User
- Available minutes

## Inputs From GlowDocket
Use existing task data:
- Assignment title
- Course
- Due date
- Priority
- Estimated minutes
- Status: To Do or In Progress
- Completion state
- Subtask progress if available

## Main Output
The feature should show:
1. Best fit assignment
2. Course badge
3. Estimated time
4. Due date bucket
5. Priority
6. One short reason
7. Up to 3 backup options

## Output Style
Keep the output:
- Clean
- Short
- Easy to scan
- Not cluttered
- Not paragraph-heavy
- Professional

Example output:

Best fit:
Math Homework

25 min · Due Tomorrow · High Priority

Reason:
Fits your time and is due soon.

Backups:
- Spanish Vocab — 15 min
- Biology Notes — 20 min
- History Reading — 30 min

## Ranking Rules
The recommendation should:
- Exclude completed assignments
- Include both To Do and In Progress assignments
- Prefer assignments that fit within the entered minutes
- Treat due date urgency as most important
- Treat priority as second most important
- Treat estimated time fit as third most important
- Give In Progress assignments a small boost
- Avoid choosing assignments with missing estimated time unless there are no better options

## Due Date Urgency Order
Most urgent to least urgent:
1. Overdue
2. Due Today
3. Due Tomorrow
4. Due This Week
5. Due Next Week
6. Due Later
7. No Due Date

## Priority Order
Highest to lowest:
1. HIGH
2. MED
3. LOW

## If Nothing Fully Fits
If no assignment fits within the entered minutes, recommend the best urgent assignment to start.

Use a short message like:
"This may not fit completely, but it is your best use of this time."

## Implementation Rules
- Do not use an AI API yet.
- Do not create new localStorage keys.
- Do not rewrite the app.
- Do not change Recommended Plan of Attack.
- Do not change Calendar behavior.
- Do not change filters.
- Do not change course colors.
- Do not change profile switching.
- Use isolated CSS class names.
- Keep the UI clean and minimal.
