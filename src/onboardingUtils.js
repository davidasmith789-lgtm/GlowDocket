export const DEMO_VERSION = 1;

export function getTutorialStorageKey(profileKey) {
  return `taskcabinet_tutorial_${profileKey || "guest"}`;
}

export function createDemoData(now = new Date()) {
  const date = (offset) => {
    const value = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return { dueYear: value.getFullYear(), dueMonth: value.getMonth() + 1, dueDay: value.getDate() };
  };
  const tasks = [
      { id: "taskcabinet-demo-biology", title: "Review cell structure notes", course: "Biology", category: "School", priority: "HIGH", estimatedMinutes: 30, repeat: "NONE", status: "todo", isCompleted: false, demoVersion: DEMO_VERSION, ...date(1), subtasks: [{ id: "demo-step-1", text: "Review diagrams", isDone: false }, { id: "demo-step-2", text: "Answer practice questions", isDone: false }] },
      { id: "taskcabinet-demo-english", title: "Outline literature response", course: "English", category: "School", priority: "MED", estimatedMinutes: 45, repeat: "NONE", status: "todo", isCompleted: false, demoVersion: DEMO_VERSION, ...date(3), subtasks: [{ id: "demo-step-3", text: "Choose two quotations", isDone: false }] },
      { id: "taskcabinet-demo-math", title: "Complete practice problems", course: "Mathematics", category: "School", priority: "LOW", estimatedMinutes: 20, repeat: "NONE", status: "todo", isCompleted: false, demoVersion: DEMO_VERSION, ...date(5), subtasks: [] },
    ].map((task) => ({ ...task, demoOriginal: JSON.stringify(task) }));
  return {
    courses: ["Biology", "English", "Mathematics"],
    tasks,
  };
}

export function mergeDemoData(tasks, courses, now = new Date()) {
  const demo = createDemoData(now);
  const existingIds = new Set(tasks.map((task) => task.id));
  return {
    tasks: [...tasks, ...demo.tasks.filter((task) => !existingIds.has(task.id))],
    courses: [...new Set([...courses, ...demo.courses, "Other"])],
  };
}

export function removeUnchangedDemoData(tasks) {
  return tasks.filter((task) => {
    if (!task.demoOriginal) return true;
    const { demoOriginal, ...current } = task;
    return JSON.stringify(current) !== demoOriginal;
  });
}
