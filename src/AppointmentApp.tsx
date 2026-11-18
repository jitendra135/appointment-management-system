import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, Bell, CalendarDays, Check, CheckCheck,
  ChevronDown, Clock3, FilePlus2, HeartPulse, LayoutDashboard, ListFilter,
  Menu, MoreHorizontal, Pencil, Plus, Search, Settings2, Stethoscope,
  Trash2, UserRound, UsersRound, X,
} from "lucide-react";
import "./appointments.css";

type Provider = { id: string; name: string; specialty: string; email: string; phone: string; color: string };
type Status = "scheduled" | "confirmed" | "completed" | "cancelled" | "no-show";
type ClinicSettings = { isOpen: boolean; openingTime: string; closingTime: string };
type Appointment = {
  id: string; patientName: string; patientEmail: string; patientPhone: string;
  providerId: string; date: string; time: string; duration: number;
  type: string; status: Status; notes: string;
};
type View = "overview" | "schedule" | "providers";
type FormData = Omit<Appointment, "id">;

const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`/api/${path}`, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Something went wrong.");
  return result as T;
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = dateKey(new Date());
const displayDate = (date: string, options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" }) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", options);
const initials = (name: string) => name.split(" ").filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase();
const emptyForm = (date: string): FormData => ({ patientName: "", patientEmail: "", patientPhone: "", providerId: "", date, time: "09:00", duration: 30, type: "Consultation", status: "scheduled", notes: "" });

function App() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [clinic, setClinic] = useState<ClinicSettings>({ isOpen: true, openingTime: "09:00", closingTime: "18:00" });
  const [view, setView] = useState<View>("overview");
  const [calendarMode, setCalendarMode] = useState<"week" | "list">("week");
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekStart, setWeekStart] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return date;
  });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialog, setDialog] = useState<"appointment" | "provider" | null>(null);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm(today));
  const [providerForm, setProviderForm] = useState({ name: "", specialty: "", email: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsSeen, setNotificationsSeen] = useState(false);
  const [clinicDialogOpen, setClinicDialogOpen] = useState(false);
  const [clinicForm, setClinicForm] = useState({ openingTime: "09:00", closingTime: "18:00" });

  const refresh = async () => {
    try {
      const [appointmentData, providerData, clinicData] = await Promise.all([api<Appointment[]>("appointments"), api<Provider[]>("providers"), api<ClinicSettings>("clinic")]);
      setAppointments(appointmentData);
      setProviders(providerData);
      setClinic(clinicData);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect to the appointment server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const providerById = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers]);
  const todaysAppointments = appointments.filter((appointment) => appointment.date === today && !["cancelled", "no-show"].includes(appointment.status));
  const upcoming = appointments.filter((appointment) => appointment.date >= today && !["cancelled", "no-show", "completed"].includes(appointment.status));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return date;
  });
  const visibleAppointments = appointments
    .filter((appointment) => view === "schedule" || calendarMode === "list" || appointment.date === selectedDate)
    .filter((appointment) => statusFilter === "all" || appointment.status === statusFilter)
    .filter((appointment) => {
      const provider = providerById.get(appointment.providerId);
      const haystack = `${appointment.patientName} ${appointment.patientEmail} ${appointment.type} ${provider?.name ?? ""}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const moveWeek = (amount: number) => setWeekStart((current) => {
    const next = new Date(current);
    next.setDate(next.getDate() + amount * 7);
    return next;
  });
  const openNewAppointment = (date = selectedDate) => {
    setEditing(null);
    setForm({ ...emptyForm(date), providerId: providers[0]?.id ?? "" });
    setDialog("appointment");
  };
  const openEditAppointment = (appointment: Appointment) => {
    setEditing(appointment);
    setForm({ ...appointment });
    setDialog("appointment");
  };
  const changeStatus = async (appointment: Appointment, status: Status) => {
    try {
      await api<Appointment>(`appointments/${appointment.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update appointment."); }
  };
  const deleteAppointment = async (appointment: Appointment) => {
    if (!window.confirm(`Permanently remove the appointment for ${appointment.patientName}?`)) return;
    try {
      await api(`appointments/${appointment.id}`, { method: "DELETE" });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove appointment."); }
  };
  const submitAppointment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api(editing ? `appointments/${editing.id}` : "appointments", {
        method: editing ? "PATCH" : "POST", body: JSON.stringify(form),
      });
      setDialog(null);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save appointment."); }
    finally { setSaving(false); }
  };
  const submitProvider = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api<Provider>("providers", { method: "POST", body: JSON.stringify(providerForm) });
      setProviderForm({ name: "", specialty: "", email: "", phone: "" });
      setDialog(null);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add provider."); }
    finally { setSaving(false); }
  };
  const toggleClinic = async () => {
    try {
      const updated = await api<ClinicSettings>("clinic", { method: "PATCH", body: JSON.stringify({ ...clinic, isOpen: !clinic.isOpen }) });
      setClinic(updated);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update clinic status."); }
  };
  const openClinicSettings = () => {
    setClinicForm({ openingTime: clinic.openingTime, closingTime: clinic.closingTime });
    setClinicDialogOpen(true);
    setAccountOpen(false);
  };
  const submitClinicSettings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await api<ClinicSettings>("clinic", { method: "PATCH", body: JSON.stringify({ ...clinicForm, isOpen: clinic.isOpen }) });
      setClinic(updated);
      setClinicDialogOpen(false);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save clinic hours."); }
    finally { setSaving(false); }
  };
  const showNotifications = () => {
    setNotificationsSeen(true);
    setNotificationsOpen((open) => !open);
  };
  const pendingConfirmations = appointments.filter((appointment) => appointment.status === "scheduled" && appointment.date >= today);

  return (
    <div className="clinic-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <a className="brand" href="#overview" onClick={() => setView("overview")}>
          <span className="brand-mark"><HeartPulse size={20} strokeWidth={2.2} /></span>
          <span>wellnest<span className="brand-period">.</span><small>CARE OPERATIONS</small></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className={view === "overview" ? "nav-item active" : "nav-item"} onClick={() => { setView("overview"); setMobileNav(false); }}><LayoutDashboard size={18} />Overview</button>
          <button className={view === "schedule" ? "nav-item active" : "nav-item"} onClick={() => { setView("schedule"); setMobileNav(false); }}><CalendarDays size={18} />Appointments<span className="nav-count">{upcoming.length}</span></button>
          <button className={view === "providers" ? "nav-item active" : "nav-item"} onClick={() => { setView("providers"); setMobileNav(false); }}><UsersRound size={18} />Care team</button>
        </nav>
        <div className="sidebar-bottom">
          <button className="support-card" onClick={openClinicSettings}><span className="support-icon"><Activity size={17} /></span><span><strong>Clinic {clinic.isOpen ? "open" : "closed"}</strong><span>{clinic.openingTime}–{clinic.closingTime} · Manage hours</span></span><i className={clinic.isOpen ? "online-dot" : "closed-dot"} /></button>
          <div className="account-wrap"><button className="account-button" aria-expanded={accountOpen} onClick={() => setAccountOpen((open) => !open)}><span className="account-avatar">AM</span><span className="account-copy"><strong>Alex Morgan</strong><small>Practice admin</small></span><MoreHorizontal size={19} /></button>{accountOpen && <div className="account-menu"><strong>Alex Morgan</strong><span>Practice administrator</span><button onClick={openClinicSettings}><Settings2 size={15} />Clinic hours & status</button><button onClick={() => { setView("providers"); setAccountOpen(false); }}><UsersRound size={15} />Care team</button></div>}</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}><Menu size={19} /></button>
          <div className="breadcrumb">Care operations <span>/</span> <strong>{view === "overview" ? "Overview" : view === "schedule" ? "Appointments" : "Care team"}</strong></div>
          <div className="top-actions"><button className={`today-label clinic-toggle ${clinic.isOpen ? "clinic-open" : "clinic-closed"}`} aria-label={`${clinic.isOpen ? "Close" : "Open"} clinic`} onClick={() => void toggleClinic()}><span className={clinic.isOpen ? "online-dot" : "closed-dot"} />Clinic {clinic.isOpen ? "open" : "closed"}<span className="clinic-hours-summary">{clinic.openingTime}–{clinic.closingTime}</span></button><div className="notifications-wrap"><button className="icon-button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={showNotifications}><Bell size={18} />{pendingConfirmations.length > 0 && !notificationsSeen && <i className="notification-dot" />}</button>{notificationsOpen && <section className="notification-panel" aria-label="Notifications"><div className="notification-heading"><div><strong>Notifications</strong><span>{pendingConfirmations.length} awaiting confirmation</span></div><button className="icon-button" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)}><X size={16} /></button></div>{pendingConfirmations.length ? <div className="notification-message"><span className="notification-icon"><CalendarDays size={16} /></span><p><strong>{pendingConfirmations.length} appointment{pendingConfirmations.length === 1 ? "" : "s"}</strong><span>Need confirmation from the care team.</span></p></div> : <div className="notification-empty">You’re all caught up.</div>}<button className="notification-link" onClick={() => { setView("schedule"); setNotificationsOpen(false); }}>View appointments<ArrowRight size={14} /></button></section>}</div><span className="top-avatar" title="Signed in as Alex Morgan">AM</span></div>
        </header>

        <div className="page-content">
          {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
          {view === "providers" ? (
            <section className="team-page fade-in">
              <div className="page-heading"><div><span className="eyebrow">PEOPLE & PRACTICE</span><h1>Your care team</h1><p>Manage the providers who make every visit count.</p></div><button className="primary-button" onClick={() => setDialog("provider")}><Plus size={17} />Add provider</button></div>
              <div className="provider-grid">{providers.map((provider, index) => <article className="provider-card" key={provider.id} style={{ "--provider-color": provider.color } as React.CSSProperties}><span className="provider-index">0{index + 1}</span><div className="provider-avatar">{initials(provider.name)}</div><h2>{provider.name}</h2><p>{provider.specialty}</p><div className="provider-contact"><span>{provider.email || "No email added"}</span><span>{provider.phone || "No phone added"}</span></div><div className="provider-card-foot"><span><i className="online-dot" />Accepting appointments</span><strong>{appointments.filter((item) => item.providerId === provider.id && item.date >= today && !["cancelled", "completed", "no-show"].includes(item.status)).length} upcoming</strong></div></article>)}</div>
            </section>
          ) : <>
            <section className="page-heading fade-in">
              <div><span className="eyebrow">{view === "overview" ? `${new Date(`${today}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" }).toUpperCase()} · YOUR CLINIC AT A GLANCE` : "YOUR CLINIC · SCHEDULING"}</span><h1>{view === "overview" ? "Good morning, Alex" : "Appointments"}<span className="heading-period">.</span></h1><p>{view === "overview" ? "A clear view of today’s care, all in one place." : "Keep every visit moving smoothly."}</p></div>
              <button className="primary-button" onClick={() => openNewAppointment()}><Plus size={17} />New appointment</button>
            </section>

            {view === "overview" && <section className="stats-grid fade-in" aria-label="Clinic summary">
              <article className="stat-card"><span className="stat-label">TODAY’S VISITS <CalendarDays size={16} /></span><div className="stat-value">{todaysAppointments.length}<span className="stat-unit">appointments</span></div><span className="stat-note">Across {new Set(todaysAppointments.map((item) => item.providerId)).size} providers</span><div className="stat-mark mark-coral"><CalendarDays size={21} /></div></article>
              <article className="stat-card"><span className="stat-label">AWAITING CONFIRMATION <Clock3 size={16} /></span><div className="stat-value">{appointments.filter((item) => item.status === "scheduled" && item.date >= today).length}<span className="stat-unit">to confirm</span></div><span className="stat-note">Ready for a quick follow-up</span><div className="stat-mark mark-gold"><Clock3 size={21} /></div></article>
              <article className="stat-card"><span className="stat-label">UPCOMING VISITS <UsersRound size={16} /></span><div className="stat-value">{upcoming.length}<span className="stat-unit">on the books</span></div><span className="stat-note">{providers.length} care providers</span><div className="stat-mark mark-green"><CheckCheck size={21} /></div></article>
            </section>}

            <section className="schedule-panel fade-in">
              <div className="section-header"><div><span className="eyebrow">{view === "overview" ? "YOUR WEEK" : "SCHEDULE VIEW"}</span><h2>{calendarMode === "list" ? "All appointments" : displayDate(dateKey(weekStart), { month: "long", year: "numeric" })}</h2></div><div className="calendar-controls"><button className="icon-button" aria-label="Previous week" onClick={() => moveWeek(-1)}><ArrowLeft size={17} /></button><button className="today-button" onClick={() => { setSelectedDate(today); const date = new Date(); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); setWeekStart(date); }}>Today</button><button className="icon-button" aria-label="Next week" onClick={() => moveWeek(1)}><ArrowRight size={17} /></button><span className="view-separator" /><div className="view-switch" role="group" aria-label="Schedule display"><button className={calendarMode === "week" ? "view-switch-active" : ""} onClick={() => setCalendarMode("week")}><CalendarDays size={15} />Week</button><button className={calendarMode === "list" ? "view-switch-active" : ""} onClick={() => setCalendarMode("list")}><ListFilter size={15} />List</button></div></div></div>
              {calendarMode === "week" && <div className="week-strip">{weekDays.map((date) => {
                const key = dateKey(date);
                const count = appointments.filter((appointment) => appointment.date === key && !["cancelled", "no-show"].includes(appointment.status)).length;
                return <button key={key} className={`day-cell ${selectedDate === key ? "day-selected" : ""} ${key === today ? "day-today" : ""}`} onClick={() => setSelectedDate(key)}><span className="day-name">{date.toLocaleDateString("en-US", { weekday: "short" })}</span><span className="day-number">{date.getDate()}</span><span className="day-dots">{Array.from({ length: Math.min(count, 4) }, (_, index) => <i key={index} />)}{count === 0 && <i className="empty-dot" />}</span></button>;
              })}</div>}
              <div className="appointments-heading"><div><h3>{calendarMode === "list" || view === "schedule" ? "All appointments" : selectedDate === today ? "Today’s appointments" : displayDate(selectedDate, { weekday: "long", month: "long", day: "numeric" })}</h3><span>{visibleAppointments.length} {visibleAppointments.length === 1 ? "visit" : "visits"}</span></div><div className="list-tools"><label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient or provider" /></label><label className="filter-select"><ListFilter size={15} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="scheduled">Scheduled</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no-show">No-show</option></select><ChevronDown size={14} /></label></div></div>
              {loading ? <div className="empty-state"><span className="loading-ring" />Loading appointments</div> : visibleAppointments.length === 0 ? <div className="empty-state"><span className="empty-calendar"><CalendarDays size={23} /></span><strong>No appointments here</strong><span>{query ? "Try a different search." : "A little room in the day. Add a visit when you’re ready."}</span><button className="text-button" onClick={() => openNewAppointment(selectedDate)}><Plus size={15} />Create appointment</button></div> : <div className="appointment-list">{visibleAppointments.map((appointment) => {
                const provider = providerById.get(appointment.providerId);
                return <article className="appointment-row" key={appointment.id}><div className="appointment-time"><strong>{new Date(`2000-01-01T${appointment.time}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</strong><span>{appointment.duration} min</span></div><div className="timeline-line"><i /></div><div className="patient-avatar" style={{ "--patient-color": provider?.color ?? "#487765" } as React.CSSProperties}>{initials(appointment.patientName)}</div><div className="appointment-details"><div className="patient-name">{appointment.patientName}<span className={`status-pill status-${appointment.status}`}>{appointment.status}</span></div><div className="appointment-meta"><span><Stethoscope size={13} />{provider?.name ?? "Provider unavailable"}</span><i /><span>{appointment.type}</span></div>{(view === "schedule" || calendarMode === "list") && <div className="appointment-date"><CalendarDays size={13} />{displayDate(appointment.date, { weekday: "short", month: "short", day: "numeric" })}</div>}</div><div className="appointment-actions">{appointment.status === "scheduled" && <button className="confirm-button" onClick={() => void changeStatus(appointment, "confirmed")}><Check size={15} />Confirm</button>}{appointment.status === "confirmed" && <button className="complete-button" onClick={() => void changeStatus(appointment, "completed")}><CheckCheck size={15} />Complete</button>}<button className="icon-button row-icon" aria-label={`Edit ${appointment.patientName}'s appointment`} onClick={() => openEditAppointment(appointment)}><Pencil size={15} /></button>{!["cancelled", "completed", "no-show"].includes(appointment.status) && <button className="icon-button row-icon cancel-action" aria-label={`Cancel ${appointment.patientName}'s appointment`} onClick={() => void changeStatus(appointment, "cancelled")}><X size={16} /></button>}<button className="icon-button row-icon delete-action" aria-label={`Delete ${appointment.patientName}'s appointment`} onClick={() => void deleteAppointment(appointment)}><Trash2 size={15} /></button></div></article>;
              })}</div>}
            </section>

            {view === "overview" && <section className="lower-grid fade-in"><article className="team-summary"><div className="lower-heading"><div><span className="eyebrow">MEET THE TEAM</span><h2>Care providers</h2></div><button className="text-button" onClick={() => setView("providers")}>View team<ArrowRight size={15} /></button></div><div className="team-avatars">{providers.slice(0, 4).map((provider) => <button key={provider.id} className="team-avatar" style={{ "--provider-color": provider.color } as React.CSSProperties} title={`${provider.name} · ${provider.specialty}`} onClick={() => setView("providers")}>{initials(provider.name)}</button>)}<button className="team-total" onClick={() => setView("providers")}>{providers.length} providers<ArrowRight size={14} /></button></div><p className="team-caption">A thoughtful team, ready for every patient.</p></article><article className="next-up-card"><div className="next-up-top"><span className="eyebrow">NEXT UP</span><span className="next-up-time"><i className="online-dot" />{todaysAppointments[0]?.time ?? "All clear"}</span></div>{todaysAppointments[0] ? <><h3>{todaysAppointments[0].patientName}</h3><p>{todaysAppointments[0].type} <span>with {providerById.get(todaysAppointments[0].providerId)?.name}</span></p></> : <><h3>Your schedule is clear</h3><p>There are no visits booked for today.</p></>}<span className="next-up-decoration"><HeartPulse size={38} /></span></article></section>}
          </>}
          <footer className="page-footer"><span>WELLNEST <i>·</i> CARE, IN GOOD ORDER</span><span>Private practice workspace <span className="footer-lock">·</span> v1.0</span></footer>
        </div>
      </main>
      {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      {dialog && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-header"><div><span className="eyebrow">{dialog === "appointment" ? editing ? "UPDATE VISIT DETAILS" : "ADD TO THE SCHEDULE" : "GROW YOUR TEAM"}</span><h2 id="dialog-title">{dialog === "appointment" ? editing ? "Edit appointment" : "New appointment" : "Add a provider"}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={() => setDialog(null)}><X size={19} /></button></div>
        {dialog === "appointment" ? <form onSubmit={submitAppointment} className="dialog-form"><div className="form-grid"><label className="form-field full-field"><span>Patient name <b>*</b></span><input autoFocus required value={form.patientName} onChange={(event) => setForm({ ...form, patientName: event.target.value })} placeholder="e.g. Jamie Rivera" /></label><label className="form-field"><span>Email address</span><input type="email" value={form.patientEmail} onChange={(event) => setForm({ ...form, patientEmail: event.target.value })} placeholder="patient@example.com" /></label><label className="form-field"><span>Phone number</span><input type="tel" value={form.patientPhone} onChange={(event) => setForm({ ...form, patientPhone: event.target.value })} placeholder="(415) 555-0100" /></label><label className="form-field full-field"><span>Care provider <b>*</b></span><select required value={form.providerId} onChange={(event) => setForm({ ...form, providerId: event.target.value })}><option value="" disabled>Select a provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.specialty}</option>)}</select></label><label className="form-field"><span>Date <b>*</b></span><input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label><label className="form-field"><span>Start time <b>*</b></span><input required type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label><label className="form-field"><span>Visit type</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option>Consultation</option><option>Annual check-up</option><option>Follow-up</option><option>New patient</option><option>Vaccination</option><option>Telehealth</option></select></label><label className="form-field"><span>Duration</span><select value={form.duration} onChange={(event) => setForm({ ...form, duration: Number(event.target.value) })}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>1 hour</option><option value={90}>1.5 hours</option><option value={120}>2 hours</option></select></label><label className="form-field full-field"><span>Visit notes</span><textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Anything the care team should know?" /></label></div><div className="dialog-footer"><button type="button" className="secondary-button" onClick={() => setDialog(null)}>Keep editing later</button><button className="primary-button" disabled={saving || !providers.length}><FilePlus2 size={16} />{saving ? "Saving…" : editing ? "Save changes" : "Create appointment"}</button></div></form> : <form onSubmit={submitProvider} className="dialog-form"><div className="form-grid"><label className="form-field full-field"><span>Provider name <b>*</b></span><input autoFocus required value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} placeholder="e.g. Dr. Taylor Reed" /></label><label className="form-field full-field"><span>Specialty <b>*</b></span><input required value={providerForm.specialty} onChange={(event) => setProviderForm({ ...providerForm, specialty: event.target.value })} placeholder="e.g. Family medicine" /></label><label className="form-field"><span>Email</span><input type="email" value={providerForm.email} onChange={(event) => setProviderForm({ ...providerForm, email: event.target.value })} placeholder="provider@example.com" /></label><label className="form-field"><span>Phone</span><input type="tel" value={providerForm.phone} onChange={(event) => setProviderForm({ ...providerForm, phone: event.target.value })} placeholder="(415) 555-0100" /></label></div><div className="dialog-footer"><button type="button" className="secondary-button" onClick={() => setDialog(null)}>Cancel</button><button className="primary-button" disabled={saving}><Plus size={16} />{saving ? "Adding…" : "Add provider"}</button></div></form>}
      </section></div>}
      {clinicDialogOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setClinicDialogOpen(false); }}><section className="dialog clinic-dialog" role="dialog" aria-modal="true" aria-labelledby="clinic-dialog-title"><div className="dialog-header"><div><span className="eyebrow">PRACTICE SETTINGS</span><h2 id="clinic-dialog-title">Clinic hours</h2></div><button className="icon-button" aria-label="Close clinic hours" onClick={() => setClinicDialogOpen(false)}><X size={19} /></button></div><div className="clinic-status-row"><span className={clinic.isOpen ? "online-dot" : "closed-dot"} /><div><strong>Clinic is {clinic.isOpen ? "open" : "closed"}</strong><span>New appointments should fit within these hours.</span></div><button type="button" className={clinic.isOpen ? "secondary-button" : "primary-button"} onClick={() => void toggleClinic()}>{clinic.isOpen ? "Close clinic" : "Open clinic"}</button></div><form className="dialog-form" onSubmit={submitClinicSettings}><div className="form-grid"><label className="form-field"><span>Opening time</span><input type="time" required value={clinicForm.openingTime} onChange={(event) => setClinicForm({ ...clinicForm, openingTime: event.target.value })} /></label><label className="form-field"><span>Closing time</span><input type="time" required value={clinicForm.closingTime} onChange={(event) => setClinicForm({ ...clinicForm, closingTime: event.target.value })} /></label></div><div className="dialog-footer"><button type="button" className="secondary-button" onClick={() => setClinicDialogOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}><Check size={16} />{saving ? "Saving…" : "Save clinic hours"}</button></div></form></section></div>}
    </div>
  );
}

export default App;