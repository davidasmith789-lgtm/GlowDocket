import { useState, useEffect } from 'react'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import './App.css'

// Helper 1: Detect dark/light mode system configuration
function getSystemPreference() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

// Helper 2: Map assignment dates directly to active relative timelines
function getDueDateBucket(dueMonth, dueDay) {
  if (!dueMonth || !dueDay) return 'No Due Date';

  const now = new Date();
  const currentYear = now.getFullYear();
  
  // Build target assignment date instance
  const taskDate = new Date(currentYear, Number(dueMonth) - 1, Number(dueDay));
  
  // Normalize comparison instances to midnight
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Calculate relative weekend threshold mappings (Saturday cutoffs)
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (6 - today.getDay())); 
  
  const endOfNextWeek = new Date(endOfWeek);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);

  const diffTime = taskDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'Overdue 🚨';
  if (diffDays === 0) return 'Due Today ⏰';
  if (diffDays === 1) return 'Due Tomorrow 🗓️';
  if (taskDate <= endOfWeek) return 'Due This Week';
  if (taskDate <= endOfNextWeek) return 'Due Next Week';
  return 'Due Later';
}

function App() {
  // --- USER PROFILE AUTHENTICATION STATE ---
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return localStorage.getItem('currentUser') || ''
    } catch (error) {
      console.error('Error reading currentUser from localStorage:', error)
      return ''
    }
  })
  const [signInName, setSignInName] = useState('')

  // Storage key assignment namespaces
  const currentStorageKey = currentUser ? `tasks_${currentUser}` : 'tasks_guest'
const courseStorageKey = currentUser ? `courses_${currentUser}` : 'courses_guest'
const courseColorsStorageKey = currentUser ? `courseColors_${currentUser}` : 'courseColors_guest'

  // --- DYNAMIC INTEGRATED ROSTER TRACKING ---
  // Added 'Other' as a permanent default option here
  const [courses, setCourses] = useState(() => {
    try {
      const storedCourses = localStorage.getItem(courseStorageKey)
      return storedCourses ? JSON.parse(storedCourses) : ['AP Stat', 'British Literature', 'Calculus H', 'APES', 'Other']
    } catch (error) {
      console.error('Error reading courses from localStorage:', error)
      return ['AP Stat', 'British Literature', 'Calculus H', 'APES', 'Other']
    }
  })
  const [courseColors, setCourseColors] = useState(() => {
    try {
      const storedColors = localStorage.getItem(courseColorsStorageKey)
      return storedColors ? JSON.parse(storedColors) : {}
    } catch (error) {
      console.error('Error reading course colors from localStorage:', error)
      return {}
    }
  })

  const [isCustomCourse, setIsCustomCourse] = useState(false)
  const [customCourseName, setCustomCourseName] = useState('')

  // --- COMPONENT FORM CONTROL FLAGS ---
  const [taskName, setTaskName] = useState('')
  const [selectedCourse, setSelectedCourse] = useState('')
  const [dueMonth, setDueMonth] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [dueHour, setDueHour] = useState('11')
  const [dueAmPm, setDueAmPm] = useState('PM')
  const [estTime, setEstTime] = useState('')
  const [priority, setPriority] = useState('MED')
  const [repeatFrequency, setRepeatFrequency] = useState('NONE')
  repeatFrequency

  // --- CORE SYSTEM APP ARRAYS ---
  const [tasks, setTasks] = useState([])
  const [currentTab, setCurrentTab] = useState('dashboard')
  const [expandedTaskId, setExpandedTaskId] = useState(null)

  const [selectedDate, setSelectedDate] = useState(new Date())
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCourse, setFilterCourse] = useState('ALL')
  const [filterPriority, setFilterPriority] = useState('ALL')
  const [filterDueBucket, setFilterDueBucket] = useState('ALL')
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [editingTask, setEditingTask] = useState(null)
  const [filterRepeat, setFilterRepeat] = useState('ALL')
  const [filtersOpen, setFiltersOpen] = useState(false)

  // --- DISPLAY PALETTE SCHEMES ---
  const [theme, setTheme] = useState(() => {
    try {
      const storedTheme = localStorage.getItem('theme')
      return storedTheme ? storedTheme : getSystemPreference()
    } catch (error) {
      console.error('Error reading theme from localStorage:', error)
      return getSystemPreference()
    }
  })

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const formatRepeatLabel = (repeat) => {
  if (repeat === 'DAILY') return 'Daily'
  if (repeat === 'WEEKLY') return 'Weekly'
  if (repeat === 'MONTHLY') return 'Monthly'
  return 'Does not repeat'
}

const getNextRepeatingTask = (task) => {
  if (!task.repeat || task.repeat === 'NONE') return null
  if (!task.dueMonth || !task.dueDay) return null

  const currentYear = new Date().getFullYear()
  let nextDate = new Date(
    currentYear,
    Number(task.dueMonth) - 1,
    Number(task.dueDay)
  )

  if (task.repeat === 'DAILY') {
    nextDate.setDate(nextDate.getDate() + 1)
  }

  if (task.repeat === 'WEEKLY') {
    nextDate.setDate(nextDate.getDate() + 7)
  }

  if (task.repeat === 'MONTHLY') {
    const originalDay = Number(task.dueDay)
    let nextMonthIndex = Number(task.dueMonth)

    let nextYear = currentYear
    if (nextMonthIndex > 11) {
      nextMonthIndex = 0
      nextYear += 1
    }

    const daysInNextMonth = new Date(nextYear, nextMonthIndex + 1, 0).getDate()

    nextDate = new Date(
      nextYear,
      nextMonthIndex,
      Math.min(originalDay, daysInNextMonth)
    )
  }

  return {
    ...task,
    id: Date.now() + Math.floor(Math.random() * 1000),
    dueMonth: String(nextDate.getMonth() + 1).padStart(2, '0'),
    dueDay: String(nextDate.getDate()).padStart(2, '0'),
    isCompleted: false,
    createdFromRepeat: task.id
  }
}
  const getCourseColor = (course) => {
  return courseColors[course] || '#3b82f6'
}

const getTextColorForCourse = (course) => {
  const color = getCourseColor(course).replace('#', '')

  const r = parseInt(color.substring(0, 2), 16)
  const g = parseInt(color.substring(2, 4), 16)
  const b = parseInt(color.substring(4, 6), 16)

  const brightness = (r * 299 + g * 587 + b * 114) / 1000

  return brightness > 160 ? '#111827' : '#ffffff'
}

  const formatTaskDetails = (task) => {
  const hasDate = task.dueMonth && task.dueDay
  const monthLabel = hasDate ? monthNames[Number(task.dueMonth) - 1] : null
  const dateLabel = hasDate ? `${monthLabel} ${Number(task.dueDay)}` : 'No date'
  const timeLabel = task.dueHour ? `${task.dueHour} ${task.dueAmPm || ''}` : 'No time'
  const repeatLabel =
    task.repeat && task.repeat !== 'NONE'
      ? ` | 🔁 Repeats: ${formatRepeatLabel(task.repeat)}`
      : ''

  return `📅 Due: ${dateLabel} at ${timeLabel} | ⏱️ Est: ${task.estimatedMinutes || 0} mins | ⚠️ Priority: ${task.priority}${repeatLabel}`
}

  // Monitor DOM modifications for UI layout theme rules
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('theme', theme)
    } catch (error) {
      console.error('Error writing theme to localStorage:', error)
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'))
  }

  // Profile data reloading pipeline
  // Added 'Other' as a permanent default option here as well
  useEffect(() => {
  try {
    const rawTasks = localStorage.getItem(currentStorageKey)
    setTasks(rawTasks ? JSON.parse(rawTasks) : [])

    const rawCourses = localStorage.getItem(courseStorageKey)
    setCourses(rawCourses ? JSON.parse(rawCourses) : ['AP Stat', 'British Literature', 'Calculus H', 'APES', 'Other'])

    const rawCourseColors = localStorage.getItem(courseColorsStorageKey)
    setCourseColors(rawCourseColors ? JSON.parse(rawCourseColors) : {})
  } catch (error) {
    console.error('Failed to load user data from localStorage:', error)
    setTasks([])
    setCourses(['AP Stat', 'British Literature', 'Calculus H', 'APES', 'Other'])
    setCourseColors({})
  }

  setIsCustomCourse(false)
  setCustomCourseName('')
}, [currentStorageKey, courseStorageKey, courseColorsStorageKey])

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem('currentUser', currentUser)
      } else {
        localStorage.removeItem('currentUser')
      }
    } catch (error) {
      console.error('Failed to persist currentUser to localStorage:', error)
    }
  }, [currentUser])

  // --- ACTIONS & MUTATIONS ---
  const handleAddTask = (e) => {
    e.preventDefault()
    
    const finalCourse = isCustomCourse ? customCourseName.trim() : selectedCourse
    if (!taskName || !finalCourse) return 

    if (isCustomCourse && !courses.includes(finalCourse)) {
      const updatedCourses = [...courses, finalCourse].sort()
      setCourses(updatedCourses)
      try {
        localStorage.setItem(courseStorageKey, JSON.stringify(updatedCourses))
      } catch (error) {
        console.error('Failed to save updated courses list:', error)
      }
    }

    const newTask = {
  id: Date.now(),
  title: taskName,
  course: finalCourse,
  dueMonth: dueMonth,
  dueDay: dueDay,
  dueHour: dueHour,
  dueAmPm: dueAmPm,
  estimatedMinutes: estTime,
  priority: priority,
  repeat: repeatFrequency,
  isCompleted: false,
  notes: ''
  
}

    setTasks(prev => {
      const updated = [...prev, newTask]
      try { localStorage.setItem(currentStorageKey, JSON.stringify(updated)) } catch (error) {
        console.error('Failed to save tasks:', error)
      }
      return updated
    })

    // Clear submission contexts
    setTaskName('')
    setSelectedCourse('')
    setCustomCourseName('')
    setIsCustomCourse(false)
    setDueMonth('')
    setDueDay('')
    setDueHour('11')
    setDueAmPm('PM')
    setEstTime('')
    setPriority('MED')
    setRepeatFrequency('NONE')
  }
  const handleCourseColorChange = (course, color) => {
  setCourseColors(prev => {
    const updated = {
      ...prev,
      [course]: color
    }

    try {
      localStorage.setItem(courseColorsStorageKey, JSON.stringify(updated))
    } catch (error) {
      console.error('Failed to save course colors:', error)
    }

    return updated
  })
}
    const handleDeleteCourse = (courseToDelete) => {
      if (courseToDelete === 'Other') {
        alert('The "Other" course cannot be deleted.')
        return
      }

      const confirmDelete = window.confirm(
        `Delete "${courseToDelete}"? Any assignments using this course will be moved to "Other".`
      )

      if (!confirmDelete) return

      const updatedCourses = courses.filter(course => course !== courseToDelete)

      setCourses(updatedCourses)

      try {
        localStorage.setItem(courseStorageKey, JSON.stringify(updatedCourses))
      } catch (error) {
        console.error('Failed to save courses after deleting course:', error)
      }

      setCourseColors(prev => {
        const updatedColors = { ...prev }
        delete updatedColors[courseToDelete]

        try {
          localStorage.setItem(courseColorsStorageKey, JSON.stringify(updatedColors))
        } catch (error) {
          console.error('Failed to save course colors after deleting course:', error)
        }

        return updatedColors
      })

      setTasks(prev => {
        const updatedTasks = prev.map(task =>
          task.course === courseToDelete
            ? { ...task, course: 'Other' }
            : task
        )

        saveTasksForCurrentUser(updatedTasks)
        return updatedTasks
      })
    }
  const saveTasksForCurrentUser = (updated) => {
    try { localStorage.setItem(currentStorageKey, JSON.stringify(updated)) } catch (error) {
      console.error('Failed to save tasks to localStorage:', error)
    }
  }

  const toggleTaskExpansion = (id) => {
    setExpandedTaskId(prev => (prev === id ? null : id))
  }

  const handleNoteChange = (id, notes) => {
    setTasks(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, notes } : t)
      saveTasksForCurrentUser(updated)
      return updated
    })
  }

  const handleComplete = (id) => {
  setTasks(prev => {
    const taskToComplete = prev.find(task => task.id === id)

    if (!taskToComplete) return prev

    const completedTasks = prev.map(task =>
      task.id === id
        ? { ...task, isCompleted: true }
        : task
    )

    const nextRepeatingTask = getNextRepeatingTask(taskToComplete)

    const updated = nextRepeatingTask
      ? [...completedTasks, nextRepeatingTask]
      : completedTasks

    saveTasksForCurrentUser(updated)
    return updated
  })
}

  const handleUndo = (id) => {
    setTasks(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, isCompleted: false } : t)
      saveTasksForCurrentUser(updated)
      return updated
    })
  }

  const handleDelete = (id) => {
    setTasks(prev => {
      const updated = prev.filter(t => t.id !== id)
      saveTasksForCurrentUser(updated)
      return updated
    })
  }

  const handleEditStart = (task) => {
  setEditingTaskId(task.id)
  setEditingTask({ ...task })
}

const handleEditSave = () => {
  setTasks(prev => {
    const updated = prev.map(task =>
      task.id === editingTaskId
        ? editingTask
        : task
    )

    saveTasksForCurrentUser(updated)
    return updated
  })

  setEditingTaskId(null)
  setEditingTask(null)
}

const handleEditCancel = () => {
  setEditingTaskId(null)
  setEditingTask(null)
}

  const handleSignIn = (e) => {
    e.preventDefault()
    const trimmedName = signInName.trim()
    if (!trimmedName) return
    setCurrentUser(trimmedName)
    setSignInName('')
    setCurrentTab('dashboard')
  }

  const handleSignOut = () => {
    setCurrentUser('')
    setCurrentTab('dashboard')
  }

  const isFormInvalid = !taskName || (isCustomCourse ? !customCourseName.trim() : !selectedCourse)

 // --- DATA TRANSFORMATION PIPELINE (SEARCH, FILTERING, SORTING & TIMELINE GROUPING) ---

const bucketsOrder = [
  'Overdue 🚨',
  'Due Today ⏰',
  'Due Tomorrow 🗓️',
  'Due This Week',
  'Due Next Week',
  'Due Later',
  'No Due Date'
]

const assignmentMatchesFilters = (task) => {
  const search = searchTerm.trim().toLowerCase()
  const matchesRepeat =
    filterRepeat === 'ALL' || (task.repeat || 'NONE') === filterRepeat
  const matchesSearch =
    !search ||
    task.title.toLowerCase().includes(search) ||
    task.course.toLowerCase().includes(search) ||
    (task.notes || '').toLowerCase().includes(search)

  const matchesCourse =
    filterCourse === 'ALL' || task.course === filterCourse

  const matchesPriority =
    filterPriority === 'ALL' || task.priority === filterPriority

  const taskBucket = getDueDateBucket(task.dueMonth, task.dueDay)

  const matchesDueBucket =
    filterDueBucket === 'ALL' || taskBucket === filterDueBucket

  return matchesSearch && matchesCourse && matchesPriority && matchesDueBucket && matchesRepeat
}

const todoTasks = tasks.filter(task =>
  !task.isCompleted && assignmentMatchesFilters(task)
)

const completedTasks = tasks.filter(task =>
  task.isCompleted && assignmentMatchesFilters(task)
)

const sortedTodoTasks = [...todoTasks].sort((a, b) => {
  const priorityMap = { HIGH: 3, MED: 2, LOW: 1 }

  const bucketA = bucketsOrder.indexOf(getDueDateBucket(a.dueMonth, a.dueDay))
  const bucketB = bucketsOrder.indexOf(getDueDateBucket(b.dueMonth, b.dueDay))

  if (bucketA !== bucketB) {
    return bucketA - bucketB
  }

  if (priorityMap[b.priority] !== priorityMap[a.priority]) {
    return priorityMap[b.priority] - priorityMap[a.priority]
  }

  return (Number(a.estimatedMinutes) || 0) - (Number(b.estimatedMinutes) || 0)
})

const groupedTasks = bucketsOrder.reduce((acc, bucket) => {
  acc[bucket] = []
  return acc
}, {})

sortedTodoTasks.forEach(task => {
  const bucket = getDueDateBucket(task.dueMonth, task.dueDay)

  if (groupedTasks[bucket]) {
    groupedTasks[bucket].push(task)
  } else {
    groupedTasks['No Due Date'].push(task)
  }
})

const resetFilters = () => {
  setSearchTerm('')
  setFilterCourse('ALL')
  setFilterPriority('ALL')
  setFilterDueBucket('ALL')
  setFilterRepeat('ALL')
}

const renderFilterToggle = () => (
  <button
    type="button"
    className="filter-bar"
    onClick={() => setFiltersOpen(prev => !prev)}
  >
    <span>🔎 Filter Assignments</span>
    <span>{filtersOpen ? '▲ Hide' : '▼ Show'}</span>
  </button>
)

const renderFilterControls = () => {
  if (!filtersOpen) return null

  return (
    <div className="card filter-controls-card">
      <input
        type="text"
        placeholder="Search by title, course, or notes..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div className="filter-grid">
        <div>
          <label>Course:</label>
          <select
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
          >
            <option value="ALL">All Courses</option>
            {courses.map(course => (
              <option key={course} value={course}>
                {course}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Priority:</label>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
          >
            <option value="ALL">All Priorities</option>
            <option value="HIGH">High</option>
            <option value="MED">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        <div>
          <label>Due:</label>
          <select
            value={filterDueBucket}
            onChange={(e) => setFilterDueBucket(e.target.value)}
          >
            <option value="ALL">All Due Dates</option>
            {bucketsOrder.map(bucket => (
              <option key={bucket} value={bucket}>
                {bucket}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Repeat:</label>
          <select
            value={filterRepeat}
            onChange={(e) => setFilterRepeat(e.target.value)}
          >
            <option value="ALL">All Repeat Types</option>
            <option value="NONE">Does not repeat</option>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={resetFilters}
        style={{
          marginTop: '12px',
          padding: '8px 12px',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Reset Filters
      </button>
    </div>
  )
}
const activeTasksCount = tasks.filter(task => !task.isCompleted).length
const completedTasksCount = tasks.filter(task => task.isCompleted).length

const overdueTasksCount = tasks.filter(task =>
  !task.isCompleted &&
  getDueDateBucket(task.dueMonth, task.dueDay) === 'Overdue 🚨'
).length

const dueTodayCount = tasks.filter(task =>
  !task.isCompleted &&
  getDueDateBucket(task.dueMonth, task.dueDay) === 'Due Today ⏰'
).length

const totalEstimatedMinutes = tasks
  .filter(task => !task.isCompleted)
  .reduce((total, task) => total + (Number(task.estimatedMinutes) || 0), 0)

const estimatedHours = Math.floor(totalEstimatedMinutes / 60)
const estimatedMinutesLeft = totalEstimatedMinutes % 60
 return (
  <div className={`App ${theme}`}>
    <div className="app-shell">
        <header className="hero-card">
  <div>
    <p className="eyebrow">Student Productivity Hub</p>
    <h1 className="app-title">🎓 TaskAcadia</h1>
    <p className="hero-subtitle">
      Organize assignments, track deadlines, manage courses, and plan your workload.
    </p>
  </div>

  <div className="user-pill">
    {currentUser ? `Signed in as ${currentUser}` : 'Guest Mode'}
  </div>
</header>

        {/* Navigation Tab Actions */}
        <div className="tab-row">
          <button
            className={`tab-button ${currentTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentTab('dashboard')}
          >
            Dashboard
          </button>

          <button
            className={`tab-button ${currentTab === 'todo' ? 'active' : ''}`}
            onClick={() => setCurrentTab('todo')}
          >
            To Do
          </button>

          <button
            className={`tab-button ${currentTab === 'completed' ? 'active' : ''}`}
            onClick={() => setCurrentTab('completed')}
          >
            Completed
          </button>

          <button
            className={`tab-button ${currentTab === 'calendar' ? 'active' : ''}`}
            onClick={() => setCurrentTab('calendar')}
          >
            📅 Calendar
          </button>

          <button
            className={`tab-button ${currentTab === 'signin' ? 'active' : ''}`}
            onClick={() => setCurrentTab('signin')}
          >
            {currentUser ? 'Switch User' : 'Sign In'}
          </button>

          {currentUser && (
            <button className="btn btn-danger" onClick={handleSignOut}>
              Sign Out
            </button>
          )}

          <button className="btn btn-secondary" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>

        {/* --- FORM SECTION --- */}
        {currentTab === 'dashboard' && (
  <div>
    <div className="stats-grid">
      <div className="stat-card">
        <span className="stat-label">Active</span>
        <strong>{activeTasksCount}</strong>
        <p>Assignments left</p>
      </div>

      <div className="stat-card">
        <span className="stat-label">Due Today</span>
        <strong>{dueTodayCount}</strong>
        <p>Need attention</p>
      </div>

      <div className="stat-card">
        <span className="stat-label">Overdue</span>
        <strong>{overdueTasksCount}</strong>
        <p>Past deadline</p>
      </div>

      <div className="stat-card">
        <span className="stat-label">Workload</span>
        <strong>{estimatedHours}h {estimatedMinutesLeft}m</strong>
        <p>Estimated remaining</p>
      </div>
    </div>

    <div className="dashboard-grid">
      <div className="card card-container">
        <h3>➕ Add New Assignment</h3>
            <form onSubmit={handleAddTask} className="card-form">
              
              <label>Assignment Name:</label>
              <input 
                type="text" 
                placeholder="e.g., Read Chapter 4" 
                value={taskName} 
                onChange={(e) => setTaskName(e.target.value)} 
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <label>Course:</label>
                <button 
                  type="button"
                  onClick={() => setIsCustomCourse(!isCustomCourse)}
                  style={{ background: 'none', border: 'none', color: 'var(--button-primary-bg, #007bff)', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}
                >
                  {isCustomCourse ? "Select Existing Course" : "➕ Add Custom Course"}
                </button>
              </div>

              {isCustomCourse ? (
                <input 
                  type="text"
                  placeholder="Type new course name (e.g., AP Psychology)"
                  value={customCourseName}
                  onChange={(e) => setCustomCourseName(e.target.value)}
                />
              ) : (
                <select value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value)}>
                  <option value="">Select a course</option>
                  {courses.map(course => <option key={course} value={course}>{course}</option>)}
                </select>
              )}

              <label>Due Date:</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={dueMonth} onChange={(e) => setDueMonth(e.target.value)}>
                  <option value="">Month</option>
                  {monthNames.map((m, idx) => (
                    <option key={m} value={String(idx + 1).padStart(2, '0')}>{m}</option>
                  ))}
                </select>
                <select value={dueDay} onChange={(e) => setDueDay(e.target.value)}>
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={String(d).padStart(2, '0')}>{d}</option>
                  ))}
                </select>
              </div>

              <label>Due Time (12-hour):</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="number" min="1" max="12" value={dueHour} onChange={(e) => setDueHour(e.target.value)} style={{ width: '80px' }} />
                <select value={dueAmPm} onChange={(e) => setDueAmPm(e.target.value)}>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>

              <label>Estimated Minutes:</label>
              <input type="number" placeholder="e.g., 45" value={estTime} onChange={(e) => setEstTime(e.target.value)} />

              <label>Priority:</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="LOW">Low</option>
                <option value="MED">Medium</option>
                <option value="HIGH">High</option>
              </select>

              <label>Repeat:</label>
              <select
                value={repeatFrequency}
                onChange={(e) => setRepeatFrequency(e.target.value)}
              >
                <option value="NONE">Does not repeat</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isFormInvalid}
                style={{
                  padding: '10px',
                  borderRadius: '4px',
                  marginTop: '10px',
                  cursor: isFormInvalid ? 'not-allowed' : 'pointer',
                  opacity: isFormInvalid ? 0.6 : 1
                }}
              >
                Add Assignment
              </button>
            </form>
            <div style={{ marginTop: '25px' }}>
              <h3>🎨 Course Colors</h3>
              <p className="hint-text">
                Customize course colors or delete courses you no longer need. Assignments from deleted courses move to "Other".
              </p>

              {courses.map(course => (
                <div
                  key={course}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginBottom: '10px',
                    padding: '8px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--card-bg)'
                  }}
                >
                  <span
                    style={{
                      backgroundColor: getCourseColor(course),
                      color: getTextColorForCourse(course),
                      padding: '5px 10px',
                      borderRadius: '999px',
                      fontWeight: '600'
                    }}
                  >
                    {course}
                  </span>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="color"
                      value={getCourseColor(course)}
                      onChange={(e) => handleCourseColorChange(course, e.target.value)}
                    />

                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={course === 'Other'}
                      onClick={() => handleDeleteCourse(course)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '4px',
                        cursor: course === 'Other' ? 'not-allowed' : 'pointer',
                        opacity: course === 'Other' ? 0.5 : 1
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
          </div>
      </div>
    </div>
  </div>
)}

        {/* --- MAIN DISPLAY CONTROLLERS --- */}
        <div>
          {/* TO DO TAB VIEW */}
          {currentTab === 'todo' && (
            <div>
            {renderFilterToggle()}

            <h3>📝 To Do ({todoTasks.length})</h3>

            {renderFilterControls()}

            {todoTasks.length === 0 ? (
                <p className="placeholder-text">No pending assignments match your filters.</p>
              ) : (
                <div>
                  {bucketsOrder.map(bucketName => {
                    const tasksInBucket = groupedTasks[bucketName];
                    if (tasksInBucket.length === 0) return null;

                    return (
                      <div key={bucketName} className="bucket-section" style={{ marginTop: '20px' }}>
                        <h4 className="bucket-title" style={{ borderBottom: '1px solid #ccc', paddingBottom: '4px', marginBottom: '10px', color: 'var(--text-color)' }}>
                          {bucketName}
                        </h4>
                        <ul className="task-list" style={{ paddingLeft: 0, listStyle: 'none' }}>
                          {tasksInBucket.map(task => (
                            <li
                              key={task.id}
                              className={`task-card${task.priority === 'HIGH' ? ' task-card-high' : ''}${expandedTaskId === task.id ? ' expanded' : ''}`}
                              onClick={() => toggleTaskExpansion(task.id)}
                            >
                              <div>
                                {editingTaskId === task.id ? (
                                  <input
                                    value={editingTask.title}
                                    onChange={(e) =>
                                      setEditingTask({
                                        ...editingTask,
                                        title: e.target.value
                                      })
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                ) : (
                                  <strong>{task.title}</strong>
                                )}
                                <span
                                  className="course-name"
                                  style={{
                                    backgroundColor: getCourseColor(task.course),
                                    color: getTextColorForCourse(task.course),
                                    padding: '4px 8px',
                                    borderRadius: '999px',
                                    fontWeight: '600'
                                  }}
                                >
                                  {task.course}
                              </span>
                                <div className="task-details">
                                  {formatTaskDetails(task)}
                                  </div>
                              </div>
                              
                              <div className="task-actions">
                              {editingTaskId === task.id ? (
                                <>
                                  <button
                                    className="btn btn-primary"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleEditSave()
                                    }}
                                    style={{ padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
                                  >
                                    Save 💾
                                  </button>

                                  <button
                                    className="btn btn-warning"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleEditCancel()
                                    }}
                                    style={{ padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="btn btn-primary"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleComplete(task.id)
                                    }}
                                    style={{ padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
                                  >
                                    Complete ✅
                                  </button>

                                  <button
                                    className="btn btn-secondary"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleEditStart(task)
                                    }}
                                  >
                                    ✏️ Edit
                                  </button>

                                  <button
                                    className="btn btn-danger"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDelete(task.id)
                                    }}
                                    style={{ padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>

                              {expandedTaskId === task.id && (
                                <div className="task-notes-panel" onClick={(e) => e.stopPropagation()}>
                                  <label htmlFor={`notes-${task.id}`} className="task-notes-label">Notes</label>
                                  <textarea
                                    id={`notes-${task.id}`}
                                    value={task.notes || ''}
                                    onChange={(e) => handleNoteChange(task.id, e.target.value)}
                                    placeholder="Type notes for this assignment..."
                                    className="task-note-input"
                                  />
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* COMPLETED TAB VIEW */}
          {currentTab === 'completed' && (
          <div>
            {renderFilterToggle()}

            <h3>✅ Completed ({completedTasks.length})</h3>

            {renderFilterControls()}

            {completedTasks.length === 0 ? (
                <p className="placeholder-text">No completed assignments match your filters.</p>
              ) : (
                <ul className="task-list" style={{ paddingLeft: 0, listStyle: 'none' }}>
                  {completedTasks.map(task => (
                    <li
                      key={task.id}
                      className={`task-card${expandedTaskId === task.id ? ' expanded' : ''}`}
                      onClick={() => toggleTaskExpansion(task.id)}
                    >
                      <div>
                        <strong>{task.title}</strong> 
                        <span
                          className="course-name"
                          style={{
                            backgroundColor: getCourseColor(task.course),
                            color: getTextColorForCourse(task.course),
                            padding: '4px 8px',
                            borderRadius: '999px',
                            fontWeight: '600'
                          }}
                        >
                          {task.course}
                        </span>
                        <div className="task-details">{formatTaskDetails(task)}</div>
                      </div>
                      <div className="task-actions">
                        <button 
                          className="btn btn-warning"
                          onClick={(e) => { e.stopPropagation(); handleUndo(task.id) }}
                          style={{ padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          Mark Undone
                        </button>
                        <button 
                          className="btn btn-danger"
                          onClick={(e) => { e.stopPropagation(); handleDelete(task.id) }}
                          style={{ padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      </div>

                      {expandedTaskId === task.id && (
                        <div className="task-notes-panel" onClick={(e) => e.stopPropagation()}>
                          <label htmlFor={`notes-${task.id}`} className="task-notes-label">Notes</label>
                          <textarea
                            id={`notes-${task.id}`}
                            value={task.notes || ''}
                            onChange={(e) => handleNoteChange(task.id, e.target.value)}
                            placeholder="Type notes for this assignment..."
                            className="task-note-input"
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {/* CALENDAR TAB VIEW */}
          {currentTab === 'calendar' && (
            <div className="card card-container" style={{ marginTop: '10px' }}>
              <h3>📅 Assignment Calendar</h3>

              <Calendar
                onChange={setSelectedDate}
                value={selectedDate}
                tileContent={({ date }) => {
                const taskForDay = tasks.find(task =>
                  Number(task.dueMonth) === date.getMonth() + 1 &&
                  Number(task.dueDay) === date.getDate()
                )

                return taskForDay ? (
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: getCourseColor(taskForDay.course),
                      margin: '0 auto',
                      marginTop: 2
                    }}
                  />
                ) : null
              }}
              />

              <h4 style={{ marginTop: '20px' }}>
                Assignments for {selectedDate.toDateString()}
              </h4>

              {tasks.filter(task =>
                Number(task.dueMonth) === selectedDate.getMonth() + 1 &&
                Number(task.dueDay) === selectedDate.getDate()
              ).length === 0 ? (
                <p className="placeholder-text">No assignments due on this day.</p>
              ) : (
                <ul className="task-list" style={{ paddingLeft: 0, listStyle: 'none' }}>
                  {tasks
                    .filter(task =>
                      Number(task.dueMonth) === selectedDate.getMonth() + 1 &&
                      Number(task.dueDay) === selectedDate.getDate()
                    )
                    .map(task => (
                      <li key={task.id} className="task-card">
                        <div>
                          <strong>{task.title}</strong> —{' '}
                          <span
                            className="course-name"
                            style={{
                              backgroundColor: getCourseColor(task.course),
                              color: getTextColorForCourse(task.course),
                              padding: '4px 8px',
                              borderRadius: '999px',
                              fontWeight: '600'
                            }}
                          >
                            {task.course}
                          </span>
                          <div className="task-details">
                            {formatTaskDetails(task)}
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
          {/* SIGN IN PROFILES TAB VIEW */}
          {currentTab === 'signin' && (
            <div className="card card-container" style={{ marginTop: '10px' }}>
              <h3>🔐 Sign In</h3>
              <form onSubmit={handleSignIn} className="card-form">
                <input placeholder="Username" value={signInName} onChange={(e) => setSignInName(e.target.value)} />
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 12px', borderRadius: '4px' }}>Sign In</button>
              </form>
              <p className="hint-text">Signing in will load and save assignments under your username in local storage.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App