import { useState, useEffect } from 'react'
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

  // --- DYNAMIC INTEGRATED ROSTER TRACKING ---
  const [courses, setCourses] = useState(() => {
    try {
      const storedCourses = localStorage.getItem(courseStorageKey)
      return storedCourses ? JSON.parse(storedCourses) : ['AP Stat', 'British Literature', 'Calculus H', 'APES']
    } catch (error) {
      console.error('Error reading courses from localStorage:', error)
      return ['AP Stat', 'British Literature', 'Calculus H', 'APES']
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

  // --- CORE SYSTEM APP ARRAYS ---
  const [tasks, setTasks] = useState([])
  const [currentTab, setCurrentTab] = useState('dashboard')
  const [expandedTaskId, setExpandedTaskId] = useState(null)

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

  const formatTaskDetails = (task) => {
    const hasDate = task.dueMonth && task.dueDay
    const monthLabel = hasDate ? monthNames[Number(task.dueMonth) - 1] : null
    const dateLabel = hasDate ? `${monthLabel} ${Number(task.dueDay)}` : 'No date'
    const timeLabel = task.dueHour ? `${task.dueHour} ${task.dueAmPm || ''}` : 'No time'
    return `📅 Due: ${dateLabel} at ${timeLabel} | ⏱️ Est: ${task.estimatedMinutes || 0} mins | ⚠️ Priority: ${task.priority}`
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
  useEffect(() => {
    try {
      const rawTasks = localStorage.getItem(currentStorageKey)
      setTasks(rawTasks ? JSON.parse(rawTasks) : [])

      const rawCourses = localStorage.getItem(courseStorageKey)
      setCourses(rawCourses ? JSON.parse(rawCourses) : ['AP Stat', 'British Literature', 'Calculus H', 'APES'])
    } catch (error) {
      console.error('Failed to load user data from localStorage:', error)
      setTasks([])
      setCourses(['AP Stat', 'British Literature', 'Calculus H', 'APES'])
    }
    setIsCustomCourse(false)
    setCustomCourseName('')
  }, [currentStorageKey, courseStorageKey])

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
      const updated = prev.map(t => t.id === id ? { ...t, isCompleted: true } : t)
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

  // --- DATA TRANSFORMATION PIPELINE (AUTOMATIC SORTING & TIMELINE GROUPING) ---
  const todoTasks = tasks.filter(t => !t.isCompleted);

  const sortedTodoTasks = [...todoTasks].sort((a, b) => {
    const priorityMap = { 'HIGH': 3, 'MED': 2, 'LOW': 1 };
    
    // Level 1 Order Metric: Priority Weighting
    if (priorityMap[b.priority] !== priorityMap[a.priority]) {
      return priorityMap[b.priority] - priorityMap[a.priority];
    }
    // Level 2 Order Metric: Execution Estimate Weighting (shortest duration first)
    return (Number(a.estimatedMinutes) || 0) - (Number(b.estimatedMinutes) || 0);
  });

  const bucketsOrder = ['Overdue 🚨', 'Due Today ⏰', 'Due Tomorrow 🗓️', 'Due This Week', 'Due Next Week', 'Due Later', 'No Due Date'];
  const groupedTasks = bucketsOrder.reduce((acc, bucket) => {
    acc[bucket] = [];
    return acc;
  }, {});

  sortedTodoTasks.forEach(task => {
    const bucket = getDueDateBucket(task.dueMonth, task.dueDay);
    if (groupedTasks[bucket]) {
      groupedTasks[bucket].push(task);
    } else {
      groupedTasks['No Due Date'].push(task);
    }
  });

  return (
    <div className={`App ${theme}`}>
      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
        <h1 className="app-title">🎓 TaskAcadia Dashboard</h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p>Welcome. Track your workload here.</p>
          <div style={{ fontSize: '14px' }}>{currentUser ? `Signed in as ${currentUser}` : 'Not signed in'}</div>
        </div>

        {/* Navigation Tab Actions */}
        <div className="tab-row" style={{ display: 'flex', gap: '8px', marginTop: '12px', marginBottom: '12px' }}>
          <button className={`tab-button ${currentTab === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentTab('dashboard')}>Dashboard</button>
          <button className={`tab-button ${currentTab === 'todo' ? 'active' : ''}`} onClick={() => setCurrentTab('todo')}>To Do</button>
          <button className={`tab-button ${currentTab === 'completed' ? 'active' : ''}`} onClick={() => setCurrentTab('completed')}>Completed</button>
          <button className={`tab-button ${currentTab === 'signin' ? 'active' : ''}`} onClick={() => setCurrentTab('signin')}>{currentUser ? 'Switch User' : 'Sign In'}</button>
          {currentUser && <button className="btn btn-danger" onClick={handleSignOut}>Sign Out</button>}
          <button className="btn btn-secondary" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>

        {/* --- FORM SECTION --- */}
        {currentTab === 'dashboard' && (
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
          </div>
        )}

        {/* --- MAIN DISPLAY CONTROLLERS --- */}
        <div>
          {/* TO DO TAB VIEW */}
          {currentTab === 'todo' && (
            <div>
              <h3>📝 To Do ({todoTasks.length})</h3>
              {todoTasks.length === 0 ? (
                <p className="placeholder-text">No pending assignments.</p>
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
                                <strong>{task.title}</strong> — <span className="course-name">{task.course}</span>
                                <div className="task-details">{formatTaskDetails(task)}</div>
                              </div>

                              <div className="task-actions">
                                <button 
                                  className="btn btn-primary"
                                  onClick={(e) => { e.stopPropagation(); handleComplete(task.id) }}
                                  style={{ padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                  Complete ✅
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
              <h3>✅ Completed ({tasks.filter(t => t.isCompleted).length})</h3>
              {tasks.filter(t => t.isCompleted).length === 0 ? (
                <p className="placeholder-text">No completed assignments.</p>
              ) : (
                <ul className="task-list" style={{ paddingLeft: 0, listStyle: 'none' }}>
                  {tasks.filter(t => t.isCompleted).map(task => (
                    <li
                      key={task.id}
                      className={`task-card${expandedTaskId === task.id ? ' expanded' : ''}`}
                      onClick={() => toggleTaskExpansion(task.id)}
                    >
                      <div>
                        <strong>{task.title}</strong> — <span className="course-name">{task.course}</span>
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