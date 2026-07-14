export function AssignmentFilterToggle({ filtersOpen, onToggle }) {
  return <button type="button" className="filter-bar" onClick={onToggle}><span>🔎 Filter Assignments</span><span>{filtersOpen ? "▲ Hide" : "▼ Show"}</span></button>;
}

export function AssignmentFilterControls({
  filtersOpen,
  searchTerm,
  onSearchTermChange,
  filterCategory,
  onFilterCategoryChange,
  taskCategories,
  courseLabel,
  filterCourse,
  onFilterCourseChange,
  courses,
  filterPriority,
  onFilterPriorityChange,
  filterDueBucket,
  onFilterDueBucketChange,
  dueBuckets,
  filterRepeat,
  onFilterRepeatChange,
  onReset,
}) {
  if (!filtersOpen) return null;
  return (
    <div className="card filter-controls-card">
      <input type="text" placeholder="Search by title, course, or notes..." value={searchTerm} onChange={(event) => onSearchTermChange(event.target.value)} />
      <div className="filter-grid">
        <div><label>Category:</label><select value={filterCategory} onChange={(event) => onFilterCategoryChange(event.target.value)}><option value="ALL">All Categories</option>{taskCategories.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
        <div><label>{courseLabel}:</label><select value={filterCourse} onChange={(event) => onFilterCourseChange(event.target.value)}><option value="ALL">All Courses</option>{courses.map((course) => <option key={course} value={course}>{course}</option>)}</select></div>
        <div><label>Priority:</label><select value={filterPriority} onChange={(event) => onFilterPriorityChange(event.target.value)}><option value="ALL">All Priorities</option><option value="HIGH">High</option><option value="MED">Medium</option><option value="LOW">Low</option></select></div>
        <div><label>Due:</label><select value={filterDueBucket} onChange={(event) => onFilterDueBucketChange(event.target.value)}><option value="ALL">All Due Dates</option>{dueBuckets.map((bucket) => <option key={bucket} value={bucket}>{bucket}</option>)}</select></div>
        <div><label>Repeat:</label><select value={filterRepeat} onChange={(event) => onFilterRepeatChange(event.target.value)}><option value="ALL">All Repeat Types</option><option value="NONE">Does not repeat</option><option value="DAILY">Daily</option><option value="EVERY_OTHER_WEEKDAY">Every Other Weekday</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></div>
      </div>
      <button type="button" className="btn btn-secondary" onClick={onReset} style={{ marginTop: "12px", padding: "8px 12px", borderRadius: "4px", cursor: "pointer" }}>Reset Filters</button>
    </div>
  );
}
