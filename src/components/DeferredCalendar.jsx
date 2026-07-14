import { lazy, Suspense } from "react";

const Calendar = lazy(() => import("../CalendarFeature.jsx"));

export default function DeferredCalendar(props) {
  return <Suspense fallback={<div className="calendar-loading" role="status">Loading calendar…</div>}><Calendar {...props} /></Suspense>;
}
