export function canUndoVoiceCreation(task) {
  return Boolean(
    task?.createdByVoice
    && !task.voiceUndoLocked
    && !task.isCompleted
    && task.status !== "inProgress"
    && !task.isArchived
    && !task.isDeleted,
  );
}

export function lockVoiceUndo(task) {
  return task?.createdByVoice ? { ...task, voiceUndoLocked: true } : task;
}

