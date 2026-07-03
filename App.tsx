import React, { useState } from 'react';
import ParticleSphere from './ParticleSphere';

// Reusable Edge Lighting wrapper component
interface BorderLightingProps {
  children: React.ReactNode;
  className?: string;
}

const BorderLighting: React.FC<BorderLightingProps> = ({ children, className = '' }) => {
  return (
    <div className={`relative p-[1.5px] rounded-2xl overflow-hidden bg-zinc-900/50 ${className}`}>
      {/* Rotating conic gradient behind inner container */}
      <div
        className="absolute inset-[-1000%] animate-[spin_4s_linear_infinite]"
        style={{
          background: 'conic-gradient(from 0deg, transparent 70%, #ff9b51 70%, #ff9b51 100%)',
        }}
      />
      {/* Inner container mask */}
      <div className="relative w-full h-full bg-zinc-950 rounded-[15px] overflow-hidden z-10">
        {children}
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string; label: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Bookings list state for dynamic conflict rendering
  const [bookedSlots, setBookedSlots] = useState<any[]>([]);

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // Time Slots Definition (11:00 AM to 11:00 PM)
  const slots = [
    { start: "11:00", end: "11:30", label: "11:00 AM" },
    { start: "11:30", end: "12:00", label: "11:30 AM" },
    { start: "12:00", end: "12:30", label: "12:00 PM" },
    { start: "12:30", end: "13:00", label: "12:30 PM" },
    { start: "13:00", end: "13:30", label: "01:00 PM" },
    { start: "13:30", end: "14:00", label: "01:30 PM" },
    { start: "14:00", end: "14:30", label: "02:00 PM" },
    { start: "14:30", end: "15:00", label: "02:30 PM" },
    { start: "15:00", end: "15:30", label: "03:00 PM" },
    { start: "15:30", end: "16:00", label: "03:30 PM" },
    { start: "16:00", end: "16:30", label: "04:00 PM" },
    { start: "16:30", end: "17:00", label: "04:30 PM" },
    { start: "17:00", end: "17:30", label: "05:00 PM" },
    { start: "17:30", end: "18:00", label: "05:30 PM" },
    { start: "18:00", end: "18:30", label: "06:00 PM" },
    { start: "18:30", end: "19:00", label: "06:30 PM" },
    { start: "19:00", end: "19:30", label: "07:00 PM" },
    { start: "19:30", end: "20:00", label: "07:30 PM" },
    { start: "20:00", end: "20:30", label: "08:00 PM" },
    { start: "20:30", end: "21:00", label: "08:30 PM" },
    { start: "21:00", end: "21:30", label: "09:00 PM" },
    { start: "21:30", end: "22:00", label: "09:30 PM" },
    { start: "22:00", end: "22:30", label: "10:00 PM" },
    { start: "22:30", end: "23:00", label: "10:30 PM" },
  ];

  // Fetch booked slots from API
  const fetchBookings = React.useCallback(async () => {
    try {
      const res = await fetch('/api/bookings');
      if (res.ok) {
        const data = await res.json();
        setBookedSlots(data);
      }
    } catch (err) {
      console.error('Failed to fetch bookings:', err);
    }
  }, []);

  React.useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const handlePrevMonth = () => {
    const d = new Date(currentMonthDate);
    d.setMonth(d.getMonth() - 1);
    setCurrentMonthDate(d);
  };

  const handleNextMonth = () => {
    const d = new Date(currentMonthDate);
    d.setMonth(d.getMonth() + 1);
    setCurrentMonthDate(d);
  };

  const renderDays = () => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevTotalDays = new Date(year, month, 0).getDate();
    const days: React.ReactNode[] = [];

    // Prev month padding
    for (let i = firstDayIndex; i > 0; i--) {
      days.push(
        <div key={`prev-${i}`} className="text-zinc-750 py-1.5 cursor-default select-none text-zinc-700">
          {prevTotalDays - i + 1}
        </div>
      );
    }

    // Current month days
    const today = new Date();
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
      const isSelected = selectedDate === dateStr;

      days.push(
        <button
          key={`day-${day}`}
          type="button"
          onClick={() => {
            setSelectedDate(dateStr);
            setSelectedSlot(null);
          }}
          className={`py-1.5 rounded-lg transition-all font-medium text-xs ${
            isSelected
              ? 'bg-orange-500 text-black font-bold shadow-sm'
              : isToday
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              : 'hover:bg-zinc-800 text-zinc-300'
          }`}
        >
          {day}
        </button>
      );
    }
    return days;
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!selectedDate) {
      alert('Please select a date from the calendar.');
      return;
    }

    if (!selectedSlot) {
      alert('Please select a time slot.');
      return;
    }

    try {
      const response = await fetch('/api/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          date: selectedDate,
          start_time: selectedSlot.start,
          end_time: selectedSlot.end,
        }),
      });

      const data = await response.json();

      if (response.status === 409) {
        alert(`Scheduling conflict: ${data.message || 'The selected timeslot overlaps with an existing booking.'}`);
        setMessage({
          text: `Conflict: ${data.message}`,
          isError: true,
        });
      } else if (response.ok) {
        alert('Booking confirmed successfully!');
        setMessage({
          text: 'Booking confirmed!',
          isError: false,
        });
        // Reset form
        setName('');
        setEmail('');
        setSelectedDate('');
        setSelectedSlot(null);
        fetchBookings();
      } else {
        alert(`Error: ${data.message || 'Something went wrong.'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error. Please try again.');
    }
  };

  // Filter bookings for the selected date
  const bookingsForDate = bookedSlots.filter(b => b.date === selectedDate);

  return (
    <div className="bg-zinc-950 text-zinc-100 font-sans min-h-screen relative overflow-x-hidden selection:bg-orange-500/20 selection:text-orange-400">
      {/* 3D Particle Sphere Background */}
      <ParticleSphere color="#3f3f46" />

      {/* Top Navigation Bar */}
      <header className="flex justify-between items-center px-margin-desktop py-4 w-full sticky top-0 z-50 backdrop-blur-md bg-zinc-950/80 border-b border-zinc-900">
        <div className="flex items-center gap-base">
          <span className="text-headline-md font-headline-md text-orange-400 tracking-tight">AgeDash</span>
        </div>
        <nav className="hidden md:flex gap-xl items-center">
          <a className="text-orange-400 font-bold border-b-2 border-orange-400 font-body-md text-body-md transition-colors duration-200" href="#">Solutions</a>
          <a className="text-zinc-400 font-body-md text-body-md hover:text-orange-400 transition-colors duration-200" href="#">API Docs</a>
          <a className="text-zinc-400 font-body-md text-body-md hover:text-orange-400 transition-colors duration-200" href="#">Showcase</a>
          <a className="text-zinc-400 font-body-md text-body-md hover:text-orange-400 transition-colors duration-200" href="#">Company</a>
        </nav>
        <div className="flex items-center gap-md">
          <a href="login_page.html" className="text-label-md font-label-md text-zinc-400 hover:text-orange-400 transition-colors cursor-pointer">Portal Login</a>
          <button className="bg-orange-500 text-black px-md py-sm rounded-lg font-label-md hover:scale-95 transition-transform active:scale-90 font-semibold">Get Started</button>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="min-h-[921px] grid grid-cols-1 md:grid-cols-2 overflow-hidden items-stretch">
          <div className="flex flex-col justify-center px-margin-desktop py-xl bg-zinc-950/40 backdrop-blur-sm">
            <div className="space-y-md max-w-xl">
              <span className="text-label-md font-label-md text-orange-400 tracking-[0.2em] uppercase">Enterprise-Grade Intelligence</span>
              <h1 className="text-headline-xl font-headline-xl text-zinc-100 leading-tight">
                Scale Your Vision with <span className="text-orange-400">Humanized</span> AI.
              </h1>
              <p className="text-body-lg font-body-lg text-zinc-400">
                AgeDash delivers high-precision automation and custom API architectures designed for the modern enterprise. We bridge the gap between raw data and human decision-making.
              </p>
              <div className="flex flex-wrap gap-md pt-base">
                <button className="bg-orange-500 text-black px-xl py-md rounded-lg font-headline-md hover:shadow-lg transition-all flex items-center gap-xs font-semibold">
                  Start Building
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
                <button className="outline outline-1 outline-zinc-700 text-zinc-300 px-xl py-md rounded-lg font-headline-md hover:bg-zinc-900 transition-all">
                  View API Docs
                </button>
              </div>
            </div>
          </div>
          <div className="relative hidden md:block">
            <img
              className="w-full h-full object-cover grayscale opacity-60"
              alt="A professional, high-technical AI server rack"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDK14LeizOR2YLZ3M6k5RYiScHuGKoam_ZL-S--fWEYC1_j9no59j40Pds9y7quokPsy6s5r7PYDM_7vMTIvVDXqL2wxXiJ839JAUNjjCutVgU8Cematlgk0GhnUX9JgQwglg6o4DiGGxog7bKGXGnk4AVTENHt9uDHda1FhCJGjAwqiHSZIXP9Ql2ozyEgLBIq5f_cPQRQsOfh-q31lsZXiTDaD68u0i8kWdasN_vYf_TvWTXmrcqvsQx6-NRMLHzUJAL412p0BhaP"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/40 to-transparent"></div>
          </div>
        </section>

        {/* Engineered for Impact Section */}
        <section className="py-xl px-margin-desktop bg-zinc-900/30 backdrop-blur-md">
          <div className="text-center mb-xl">
            <h2 className="text-headline-lg font-headline-lg text-zinc-100 mb-xs">Engineered for Impact</h2>
            <p className="text-body-md font-body-md text-zinc-400 max-w-2xl mx-auto">
              Our core capabilities empower technical teams to move faster with robust, scalable infrastructure.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            <BorderLighting>
              <div className="p-lg bg-zinc-950 h-full flex flex-col">
                <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center mb-md text-orange-400">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                </div>
                <h3 className="text-headline-md font-headline-md mb-base text-zinc-100">Custom AI Agents</h3>
                <p className="text-body-md font-body-md text-zinc-400">Autonomous agents trained on your proprietary data, capable of complex multi-step reasoning and execution.</p>
              </div>
            </BorderLighting>

            <BorderLighting>
              <div className="p-lg bg-zinc-950 h-full flex flex-col">
                <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center mb-md text-orange-400">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>api</span>
                </div>
                <h3 className="text-headline-md font-headline-md mb-base text-zinc-100">Custom APIs</h3>
                <p className="text-body-md font-body-md text-zinc-400">Low-latency REST and GraphQL interfaces designed for high-concurrency environments and seamless integration.</p>
              </div>
            </BorderLighting>

            <BorderLighting>
              <div className="p-lg bg-zinc-950 h-full flex flex-col">
                <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center mb-md text-orange-400">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>account_tree</span>
                </div>
                <h3 className="text-headline-md font-headline-md mb-base text-zinc-100">Workflow Automation</h3>
                <p className="text-body-md font-body-md text-zinc-400">End-to-end orchestration of repetitive tasks, reducing operational overhead by up to 60% across departments.</p>
              </div>
            </BorderLighting>
          </div>
        </section>

        {/* Booking Section */}
        <section className="py-xl px-margin-desktop relative bg-zinc-950">
          <BorderLighting className="max-w-4xl mx-auto shadow-2xl">
            <div className="bg-zinc-950 p-xl relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl"></div>
              <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-xl">
                <div>
                  <h2 className="text-headline-lg font-headline-lg mb-md text-zinc-100">Schedule a Technical Deep Dive</h2>
                  <p className="text-body-md text-zinc-400 mb-xl">Consult with our lead engineers to map out your infrastructure requirements and ROI targets.</p>
                  <div className="space-y-md">
                    <div className="flex items-center gap-md text-zinc-300">
                      <span className="material-symbols-outlined text-orange-400">timer</span>
                      <span>30-minute Architecture Review</span>
                    </div>
                    <div className="flex items-center gap-md text-zinc-300">
                      <span className="material-symbols-outlined text-orange-400">videocam</span>
                      <span>Direct with Solutions Engineer</span>
                    </div>
                  </div>
                </div>

                {/* Form */}
                <form onSubmit={handleBookingSubmit} className="bg-zinc-900/50 backdrop-blur-md rounded-xl p-md border border-zinc-800 shadow-inner space-y-md">
                  <div>
                    <label className="block text-label-md text-zinc-300 mb-xs font-semibold">Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 placeholder-zinc-600 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 py-sm px-md outline-none transition-all"
                      placeholder="Your Name"
                    />
                  </div>
                  <div>
                    <label className="block text-label-md text-zinc-300 mb-xs font-semibold">Work Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 placeholder-zinc-600 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 py-sm px-md outline-none transition-all"
                      placeholder="you@company.com"
                    />
                  </div>

                  {/* Calendar Widget */}
                  <div>
                    <label className="block text-label-md text-zinc-300 mb-xs font-semibold">Select Date</label>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 shadow-sm select-none">
                      <div className="flex items-center justify-between mb-3 px-1">
                        <span className="text-sm font-bold text-zinc-200">{months[currentMonthDate.getMonth()]} {currentMonthDate.getFullYear()}</span>
                        <div className="flex gap-2">
                          <button type="button" onClick={handlePrevMonth} className="p-1 rounded hover:bg-zinc-850 text-orange-400 transition-all">
                            <span className="material-symbols-outlined text-sm">chevron_left</span>
                          </button>
                          <button type="button" onClick={handleNextMonth} className="p-1 rounded hover:bg-zinc-850 text-orange-400 transition-all">
                            <span className="material-symbols-outlined text-sm">chevron_right</span>
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-zinc-500 mb-2">
                        <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
                      </div>
                      <div className="grid grid-cols-7 gap-1 text-center text-xs">
                        {renderDays()}
                      </div>
                    </div>
                  </div>

                  {/* Time Slot Selection Grid */}
                  <div>
                    <label className="block text-label-md text-zinc-300 mb-xs font-semibold">Select Time Slot (30-Min Session)</label>
                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                      {!selectedDate ? (
                        <div className="col-span-3 text-center text-xs text-zinc-500 py-4">Please select a date first</div>
                      ) : (
                        slots.map(slot => {
                          const isBooked = bookingsForDate.some(b => {
                            return (slot.start < b.end_time && slot.end > b.start_time);
                          });
                          const isChosen = selectedSlot && selectedSlot.start === slot.start;

                          return (
                            <button
                              key={`slot-${slot.start}`}
                              type="button"
                              disabled={isBooked}
                              onClick={() => setSelectedSlot(slot)}
                              className={`py-2 rounded-lg text-xs font-semibold border transition-all ${
                                isBooked
                                  ? 'bg-zinc-950/40 border-zinc-900 text-zinc-600 line-through opacity-40 cursor-not-allowed'
                                  : isChosen
                                  ? 'bg-orange-500 border-orange-500 text-black font-bold shadow-sm'
                                  : 'bg-zinc-950 border-zinc-850 hover:border-orange-500/50 text-zinc-300'
                              }`}
                            >
                              {slot.label}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {message && (
                    <div className={`text-label-md font-semibold mt-sm ${message.isError ? 'text-red-500' : 'text-orange-400'}`}>
                      {message.text}
                    </div>
                  )}
                  <button type="submit" className="w-full bg-orange-500 text-black mt-md py-sm rounded-lg font-label-md hover:opacity-90 shadow-sm transition-all font-semibold">
                    Confirm Selection
                  </button>
                </form>
              </div>
            </div>
          </BorderLighting>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-zinc-950 border-t border-zinc-900 px-margin-desktop py-xl w-full grid grid-cols-1 md:grid-cols-2 gap-gutter text-zinc-400">
        <div className="space-y-md">
          <span className="text-headline-sm font-headline-sm text-orange-400">AgeDash</span>
          <p className="text-zinc-500 max-w-sm">Defining the next generation of industrial intelligence and seamless API orchestration.</p>
        </div>
        <div className="md:col-span-2 pt-xl border-t border-zinc-900/50 text-label-md text-zinc-600 flex justify-between">
          <span>© 2026 AgeDash AI Systems. All rights reserved.</span>
          <span>v3.0.0 React Migration Build</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
