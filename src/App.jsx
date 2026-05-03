import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  deleteUser,
  reauthenticateWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import {
  auth,
  db,
  storage,
  googleProvider,
  buildDefaultUserDocument,
  DEFAULT_PROFILE_NAME,
  mergeSixEyes,
} from './firebase';
import { 
  Activity, 
  Dumbbell, 
  Moon, 
  TrendingUp, 
  Calendar,
  MessageSquare,
  Video,
  Heart,
  Star,
  Coins,
  Plus,
  Minus,
  Check,
  Square,
  Target,
  LayoutDashboard,
  Timer,
  Eye,
  ShoppingBag,
  Zap,
  Skull,
  Flame,
  ShieldAlert,
  Crosshair,
  User,
  Swords,
  BookOpen,
  Camera,
  Edit,
  Edit2,
  Trash2,
  Tv,
  LogOut,
} from 'lucide-react';

import gojoDomainVideo from '../Gojo.mp4';
import pomodoroBg from '../by me.jpg';

const ACCOUNT_DELETE_REDIRECT_FLAG = 'lt_accountDeleteAfterReauth';

/** Firebase redirect result can only be read once; Strict Mode double-mount must share the same promise. */
let authRedirectResultPromise = null;
function getAuthRedirectResultOnce() {
  if (!authRedirectResultPromise) {
    authRedirectResultPromise = getRedirectResult(auth);
  }
  return authRedirectResultPromise;
}

/** Pomodoro / Infinite Void — still image (local file, always loads). */
function PomodoroBackdrop() {
  return (
    <div
      className="absolute inset-0 z-0 bg-cover bg-center"
      style={{ backgroundImage: `url(${pomodoroBg})` }}
      aria-hidden
    />
  );
}

/** Six Eyes “Domain Expansion” card — local Gojo clip; image underneath if video stalls. */
function DomainExpansionClip({ videoClassName = '', onIntrinsicSize }) {
  return (
    <>
      <div
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${pomodoroBg})` }}
        aria-hidden
      />
      <video
        autoPlay
        loop
        muted
        playsInline
        poster={pomodoroBg}
        src={gojoDomainVideo}
        className={`absolute inset-0 z-1 h-full w-full object-cover ${videoClassName}`}
        onLoadedMetadata={(e) => {
          const { videoWidth, videoHeight } = e.currentTarget;
          if (videoWidth > 0 && videoHeight > 0) {
            onIntrinsicSize?.({ width: videoWidth, height: videoHeight });
          }
        }}
      />
    </>
  );
}

/** Frame matches the MP4’s pixel aspect ratio once metadata loads (no fixed 3:4 crop). */
function DomainExpansionVideoFrame({ videoClassName = '' }) {
  const [dims, setDims] = useState(null);
  return (
    <div
      className="relative w-full max-w-3xl mx-auto rounded-2xl overflow-hidden border border-gray-700/50 bg-[#0a0a0c] shadow-lg shadow-cyan-500/10"
      style={
        dims
          ? { aspectRatio: `${dims.width} / ${dims.height}` }
          : { minHeight: 220 }
      }
    >
      <DomainExpansionClip videoClassName={videoClassName} onIntrinsicSize={setDims} />
      <div className="pointer-events-none absolute inset-0 z-2 rounded-2xl border-2 border-cyan-500/20" />
    </div>
  );
}

/** Hover-reveal edit/delete controls for task rows (glass / low-emphasis default). */
function TaskListIconButtons({ onEdit, onDelete }) {
  return (
    <div
      className="flex shrink-0 items-center gap-0.5 opacity-30 transition-opacity duration-200 group-hover:opacity-100"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-emerald-300"
        title="Edit"
      >
        <Edit2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="rounded-lg p-1.5 text-gray-400/80 transition hover:bg-red-500/15 hover:text-red-400"
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function applyGainRewards(userStats, profile, boss, baseXp, baseGold, bossDamage, ceRestore) {
  let multiplier = userStats.hasBlackFlash ? 2.5 : 1;
  let bd = bossDamage;
  let bx = baseXp;
  let bg = baseGold;
  let cr = ceRestore;
  if (profile.equippedTool === 't1') bd += 5;
  if (profile.equippedTool === 't2') bx += 15;
  if (profile.equippedTool === 't3') bg += 30;
  if (profile.equippedTool === 't4') bd += 50;
  if (profile.equippedTechnique === 'c1') cr += 10;
  if (profile.equippedTechnique === 'c3') bx += 25;
  if (profile.equippedTechnique === 'c4') multiplier *= 2;
  if (profile.equippedTechnique === 'c5') cr += 20;
  if (profile.equippedTechnique === 'c7') {
    multiplier *= 3;
    bd += 100;
  }
  const xpGain = Math.floor(bx * multiplier);
  const goldGain = Math.floor(bg * multiplier);
  let newXp = userStats.xp + xpGain;
  let newLevel = userStats.level;
  let newMaxXp = userStats.maxXp;
  const newStreak = userStats.streak + 1;
  const newMaxStreak = Math.max(userStats.maxStreak, newStreak);
  let newCe = Math.min(userStats.maxCe, userStats.ce + cr);
  const nextHasBlackFlash = newStreak % 3 === 0;
  if (newXp >= newMaxXp) {
    newLevel += 1;
    newXp -= newMaxXp;
    newMaxXp = Math.floor(newMaxXp * 1.5);
  }
  const newUserStats = {
    ...userStats,
    xp: newXp,
    level: newLevel,
    maxXp: newMaxXp,
    gold: userStats.gold + goldGain,
    streak: newStreak,
    maxStreak: newMaxStreak,
    hasBlackFlash: nextHasBlackFlash,
    ce: newCe,
  };
  const newBoss = {
    ...boss,
    hp: Math.max(0, boss.hp - Math.floor(bd * multiplier)),
  };
  return {
    userStats: newUserStats,
    boss: newBoss,
    shouldFlashBlack: userStats.hasBlackFlash,
  };
}

function applyTakeDamage(userStats, profile, damage) {
  if (profile.equippedTechnique === 'c6') {
    return { userStats, changed: false };
  }
  const newHp = userStats.hp - damage;
  if (newHp <= 0) {
    return {
      userStats: {
        ...userStats,
        hp: userStats.maxHp,
        xp: 0,
        level: Math.max(1, userStats.level - 1),
        gold: Math.floor(userStats.gold / 2),
        streak: 0,
        hasBlackFlash: false,
      },
      changed: true,
    };
  }
  return {
    userStats: {
      ...userStats,
      hp: newHp,
      streak: 0,
      hasBlackFlash: false,
    },
    changed: true,
  };
}

// Reusable Glassmorphism Card Component
const GlassCard = ({ children, className = '', title, icon: Icon, titleColor = "text-gray-300" }) => (
  <div className={`bg-gray-900/40 backdrop-blur-xl border border-gray-700/50 rounded-3xl p-6 shadow-2xl transition-all duration-300 ${className}`}>
    {title && (
      <div className="flex items-center space-x-2 mb-4">
        {Icon && <Icon className={`w-5 h-5 ${titleColor === 'text-gray-300' ? 'text-gray-400' : titleColor}`} />}
        <h3 className={`${titleColor} font-semibold tracking-wider text-sm uppercase`}>{title}</h3>
      </div>
    )}
    {children}
  </div>
);

// --- AUTHENTICATION LOGIN SCREEN ---
const LoginScreen = ({ onLogin, signingIn, authError }) => {
  return (
    <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Local still + clip (no external CDN) */}
      <div className="absolute inset-0 z-0 opacity-50 mix-blend-screen">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${pomodoroBg})` }}
          aria-hidden
        />
        <video
          src={gojoDomainVideo}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover grayscale contrast-125 opacity-90"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent,#0a0a0c_80%)]" />
      </div>

      <GlassCard className="relative z-10 w-full max-w-md text-center p-10 border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.1)]">
        <div className="mb-10 space-y-3">
          <div className="mx-auto w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center border-2 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.4)] mb-6">
            <Zap className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-black bg-clip-text text-transparent bg-linear-to-r from-emerald-400 to-cyan-400 tracking-wider">
            JUJUTSU NETWORK
          </h1>
          <p className="text-[10px] text-gray-500 tracking-[0.2em] uppercase">Authorized Sorcerers Only</p>
        </div>

        <button 
          type="button"
          onClick={onLogin}
          disabled={signingIn}
          className="w-full py-4 px-6 rounded-2xl bg-white text-gray-900 font-bold text-sm uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(255,255,255,0.2)] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <div className="w-5 h-5 rounded-full border-2 border-gray-900 border-t-transparent flex items-center justify-center rotate-45"></div>
          {signingIn ? 'Signing in…' : 'Sign in with Google'}
        </button>

        {authError ? (
          <p className="text-xs text-red-400 mt-4 tracking-wide">{authError}</p>
        ) : null}
        <p className="text-xs text-gray-600 mt-6 tracking-wide">
          Progress syncs to your account in real time.
        </p>
      </GlassCard>
    </div>
  );
};

// --- WORKOUT DATA & COMPONENT ---
const workoutPlan = {
  mon: { day: 'Monday', title: 'Pull day', focus: 'Back · Biceps · Forearms · Grip', color: 'text-red-400 bg-red-500/20 border-red-500/30', exercises: [
    { num: '1', name: 'Pull-ups', sets: '4 sets × max reps — wide grip, full hang' },
    { num: '2', name: 'Dumbbell bent-over rows', sets: '4 sets × 12 reps each arm — squeeze at top' },
    { num: '3', name: 'Dumbbell bicep curls', sets: '3 sets × 15 reps — slow on the way down' },
    { num: '4', name: 'Hammer curls', sets: '3 sets × 12 reps — builds forearm thickness' },
    { num: '5', name: 'Dead hangs', sets: '3 sets × 30 sec — grip + shoulder health' },
  ], note: 'Pull day is your V-taper builder. Every rep of pull-ups compounds into wider lats. Never skip Monday.'},
  tue: { day: 'Tuesday', title: 'Push day', focus: 'Shoulders · Chest · Triceps', color: 'text-blue-400 bg-blue-500/20 border-blue-500/30', exercises: [
    { num: '1', name: 'Pike pushups', sets: '4 sets × 15 reps — primary shoulder builder at home' },
    { num: '2', name: 'Dumbbell shoulder press', sets: '4 sets × 12 reps — seated or standing' },
    { num: '3', name: 'Dumbbell lateral raises', sets: '3 sets × 15 reps — builds shoulder width, go light' },
    { num: '4', name: 'Tricep dips', sets: '3 sets × max reps — use a chair or floor' },
    { num: '5', name: 'Wide pushups', sets: '3 sets × 20 reps — chest focus, controlled' },
  ], note: 'Lateral raises are the most important exercise for broad shoulders. Never go heavy — feel the burn at the side delt.'},
  wed: { day: 'Wednesday', title: 'Leg day — athletic', focus: 'Explosive · Functional · Not bulky', color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30', exercises: [
    { num: '1', name: 'Jump squats', sets: '4 sets × 15 reps — explosive power, land soft' },
    { num: '2', name: 'DB Bulgarian split squats', sets: '4 sets × 10 reps each leg — hardest exercise here' },
    { num: '3', name: 'DB Romanian deadlift', sets: '4 sets × 12 reps — hamstrings + lower back' },
    { num: '4', name: 'Calf raises', sets: '3 sets × 25 reps — slow, full range of motion' },
    { num: '5', name: 'Lateral bounds', sets: '3 sets × 10 each side — athletic agility, boxers use this' },
  ], note: 'Bulgarian split squats will humble you. Start with no weight if needed. Athletic legs come from single-leg work, not just squats.'},
  thu: { day: 'Thursday', title: 'Pull+ day', focus: 'Upper back · Traps · Forearms · Grip', color: 'text-purple-400 bg-purple-500/20 border-purple-500/30', exercises: [
    { num: '1', name: 'Wide grip pull-ups', sets: '4 sets × max reps — wider than Monday' },
    { num: '2', name: 'DB shrugs', sets: '3 sets × 15 reps — trap thickness, hold at top 1 sec' },
    { num: '3', name: 'Towel rows (face pulls alternative)', sets: '3 sets × 20 reps — rear delt + upper back health' },
    { num: '4', name: 'Dumbbell forearm curls', sets: '3 sets × 20 reps — wrist up and down, both ways' },
    { num: '5', name: 'Dead hangs', sets: '3 sets × max time — grip endurance' },
  ], note: 'Forearm and grip work here is what separates you from guys who only train the mirror muscles. This is the boxing foundation too.'},
  fri: { day: 'Friday', title: 'Push+ day', focus: 'Chest · Triceps · Core', color: 'text-amber-400 bg-amber-500/20 border-amber-500/30', exercises: [
    { num: '1', name: 'Diamond pushups', sets: '4 sets × 15 reps — tricep mass builder' },
    { num: '2', name: 'Dumbbell chest fly', sets: '3 sets × 12 reps — full stretch at bottom' },
    { num: '3', name: 'Arnold press', sets: '3 sets × 12 reps — hits all 3 shoulder heads' },
    { num: '4', name: 'DB skull crushers', sets: '3 sets × 15 reps — lie on floor, lower to forehead' },
    { num: '5', name: 'Core circuit', sets: '3 rounds — plank 30s · leg raises 15 · bicycle crunches 20' },
  ], note: 'Friday ends your week strong. Core work here carries into boxing later — every punch comes from the core, not the arm.'},
  rest: { day: 'Sat / Sun', title: 'Rest & recover', focus: 'Muscles grow on rest days', color: 'text-gray-400 bg-gray-500/20 border-gray-500/30', exercises: [
    { num: '—', name: 'Light walk (optional)', sets: '20–30 min — keeps blood flowing, aids recovery' },
    { num: '—', name: 'Mobility / stretching (optional)', sets: '10 min — shoulders, hips, hamstrings' },
  ], note: 'Do not train. Eat well, sleep well. The growth happens here, not in the workout.'}
};

const WorkoutPlanView = () => {
  const [activeTab, setActiveTab] = useState('mon');
  const tabs = [
    { id: 'mon', label: 'Mon' },
    { id: 'tue', label: 'Tue' },
    { id: 'wed', label: 'Wed' },
    { id: 'thu', label: 'Thu' },
    { id: 'fri', label: 'Fri' },
    { id: 'rest', label: 'Sat / Sun' },
  ];
  const currentDay = workoutPlan[activeTab];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-gray-800/50 text-gray-400 border border-gray-700/50 hover:bg-gray-800'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      <GlassCard>
         <div className="flex items-center gap-4 mb-6">
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${currentDay.color}`}>{currentDay.day}</span>
            <div>
               <h2 className="text-xl font-bold text-gray-100">{currentDay.title}</h2>
               <p className="text-sm text-gray-400">{currentDay.focus}</p>
            </div>
         </div>
         <div className="space-y-0">
            {currentDay.exercises.map((ex, i) => (
              <div key={i} className="flex gap-4 py-4 border-b border-gray-700/50 last:border-0">
                <div className="w-6 text-sm font-bold text-gray-500 pt-0.5">{ex.num}</div>
                <div>
                  <div className="text-sm font-bold text-gray-200">{ex.name}</div>
                  <div className="text-xs text-gray-400 mt-1">{ex.sets}</div>
                </div>
              </div>
            ))}
         </div>
         <div className="mt-6 bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 text-sm text-gray-300 leading-relaxed">
           {currentDay.note}
         </div>
      </GlassCard>
    </div>
  );
};

// --- NEW VIRTUAL PAGES (Domain, Six Eyes, Shop) ---

/** HP + CE reserve average → “efficiency” readout for Six Eyes. */
function cursedEnergyEfficiencyPct(stats) {
  const ce = stats.maxCe ? stats.ce / stats.maxCe : 0;
  const hp = stats.maxHp ? stats.hp / stats.maxHp : 0;
  return Math.min(100, Math.round(((ce + hp) / 2) * 100));
}

/** +1 lifetime Spirits Exorcised (task / habit / Domain completion). */
function withSpiritExorcism(nextUserStats) {
  const prev = nextUserStats.spiritsExorcised ?? 0;
  return { ...nextUserStats, spiritsExorcised: prev + 1 };
}

/** Share of a list completed → 0–100 for zone bars. */
function zoneCompletionPct(completed, total) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

const DomainExpansionView = ({ gainRewards, takeDamage }) => {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  
  const clashPhrases = ["nah id win", "with this treasure i summon", "domain expansion malevolent shrine", "always bet on hakari"];
  const [isClashing, setIsClashing] = useState(false);
  const [clashText, setClashText] = useState("");
  const [userInput, setUserInput] = useState("");
  const [clashTimeLeft, setClashTimeLeft] = useState(10);
  
  useEffect(() => {
    let interval = null;
    if (isRunning && !isClashing && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isRunning && !isClashing) {
      setIsRunning(false);
      void gainRewards(150, 50, 200, 0, true).then(() => {
        alert("Domain Expansion Complete. You survived the Infinite Void.");
      });
    }
    return () => clearInterval(interval);
  }, [isRunning, isClashing, timeLeft]);

  useEffect(() => {
    let clashInterval = null;
    if (isClashing && clashTimeLeft > 0) {
      clashInterval = setInterval(() => {
        setClashTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isClashing && clashTimeLeft === 0) {
      setIsClashing(false);
      setIsRunning(false);
      void takeDamage(30).then(() => {
        alert("You lost the Domain Clash! Suffered 30 HP damage.");
      });
    }
    return () => clearInterval(clashInterval);
  }, [isClashing, clashTimeLeft]);

  const toggleTimer = () => {
    if (isRunning) {
      setIsClashing(true);
      setClashText(clashPhrases[Math.floor(Math.random() * clashPhrases.length)]);
      setUserInput("");
      setClashTimeLeft(10);
    } else {
      setIsRunning(true);
    }
  };

  const resetTimer = () => { setIsRunning(false); setIsClashing(false); setTimeLeft(25 * 60); };
  
  const handleClashInput = (e) => {
    setUserInput(e.target.value);
    if (e.target.value.toLowerCase() === clashText.toLowerCase()) {
      setIsClashing(false);
      setIsRunning(false);
      alert("Domain Clash Won! You escaped without taking damage.");
    }
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="max-w-4xl mx-auto animate-fade-in relative">
      <GlassCard className="border-cyan-500/50 shadow-[0_0_50px_rgba(34,211,238,0.15)] relative overflow-hidden min-h-[60vh] flex flex-col items-center justify-center">
        <div className="absolute inset-0 z-0">
          <PomodoroBackdrop />
          <div className="absolute inset-0 z-2 bg-linear-to-t from-[#0a0a0c] via-transparent to-[#0a0a0c]" />
        </div>
        
        {isClashing ? (
          <div className="relative z-10 w-full max-w-lg space-y-6 bg-red-950/80 p-8 rounded-3xl border border-red-500/50 backdrop-blur-md shadow-[0_0_50px_rgba(220,38,38,0.3)] text-center animate-fade-in">
             <h3 className="text-3xl font-black text-red-500 animate-pulse tracking-widest">DOMAIN CLASH!</h3>
             <p className="text-red-200">An enemy expanded their domain. Type the phrase to survive!</p>
             <div className="text-2xl md:text-3xl font-bold text-white tracking-widest bg-black/60 py-4 px-6 rounded-xl border border-red-500/30 font-mono">
               {clashText}
             </div>
             <input
               type="text"
               value={userInput}
               onChange={handleClashInput}
               autoFocus
               onPaste={(e) => e.preventDefault()}
               className="w-full bg-gray-900 border-2 border-red-500/50 rounded-xl p-4 text-xl text-white text-center focus:outline-none focus:border-red-400 font-mono"
               placeholder="Type here to survive..."
               autoComplete="off"
               spellCheck="false"
             />
             <div className="text-2xl font-black text-red-500 flex items-center justify-center gap-2">
               <Timer className="w-6 h-6 animate-spin-slow" /> {clashTimeLeft}s
             </div>
          </div>
        ) : (
          <div className="relative z-10 text-center space-y-8">
            <div className="space-y-2">
              <h2 className="text-4xl font-bold tracking-widest text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]">INFINITE VOID</h2>
              <p className="text-gray-300 tracking-widest uppercase text-sm">Absolute Focus Protocol</p>
            </div>
            
            <div className="text-8xl font-black text-white tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.5)] font-mono">
              {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
            </div>

            <div className="flex gap-4 justify-center">
              <button onClick={toggleTimer} className={`px-8 py-3 rounded-full font-bold tracking-widest uppercase transition-all ${isRunning ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' : 'bg-cyan-500 text-white shadow-[0_0_20px_rgba(34,211,238,0.4)] hover:bg-cyan-400'}`}>
                {isRunning ? 'Break Focus (Penalty)' : 'Expand Domain'}
              </button>
              <button onClick={resetTimer} className="px-6 py-3 rounded-full bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700">Reset</button>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

const SixEyesAnalyticsView = ({ stats, sixEyes, patchSixEyes, dailies, todos, bindingVows }) => {
  const efficiency = cursedEnergyEfficiencyPct(stats);
  const spirits = stats.spiritsExorcised ?? 0;

  const todosDone = todos.filter((t) => t.completed).length;
  const dailiesDone = dailies.filter((d) => d.completed).length;
  const vowsDone = bindingVows.filter((v) => v.completed).length;
  const dev = zoneCompletionPct(todosDone, todos.length);
  const phys = zoneCompletionPct(dailiesDone, dailies.length);
  const content = zoneCompletionPct(vowsDone, bindingVows.length);

  const [rw, setRw] = useState(sixEyes.reflection.working);
  const [rf, setRf] = useState(sixEyes.reflection.failing);
  useEffect(() => {
    setRw(sixEyes.reflection.working);
    setRf(sixEyes.reflection.failing);
  }, [sixEyes.reflection.working, sixEyes.reflection.failing]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <GlassCard title="Six Eyes: Cursed Energy Flow" icon={Eye} titleColor="text-cyan-400">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-800/40 border border-gray-700/50 p-6 rounded-2xl text-center">
            <div className="text-4xl font-bold text-cyan-400 mb-2">{efficiency}%</div>
            <div className="text-sm text-gray-400">Cursed Energy Efficiency</div>
            <div className="text-[10px] text-gray-600 mt-2 tracking-wide">From current HP &amp; CE reserves</div>
          </div>
          <div className="bg-gray-800/40 border border-gray-700/50 p-6 rounded-2xl text-center">
            <div className="text-4xl font-bold text-emerald-400 mb-2">{spirits}</div>
            <div className="text-sm text-gray-400">Spirits Exorcised</div>
            <div className="text-[10px] text-gray-600 mt-2 tracking-wide">
              Total exorcisms — each daily, todo, binding vow, good habit, or Domain session you finish
            </div>
          </div>
          <div className="bg-gray-800/40 border border-gray-700/50 p-6 rounded-2xl text-center">
            <div className="text-4xl font-bold text-purple-400 mb-2">{stats.maxStreak}</div>
            <div className="text-sm text-gray-400">Max Black Flash Streak</div>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h4 className="text-sm text-gray-400 uppercase tracking-widest">Energy Expenditure by Zone</h4>
            <p className="text-[10px] text-gray-600">
              Auto: todos · dailies · binding vows (share completed in each list)
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-gray-400 w-28 shrink-0">Development (todos)</span>
              <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 rounded-full transition-[width] duration-300"
                  style={{ width: `${dev}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-500 w-14 text-right tabular-nums">
                {todosDone}/{todos.length}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-gray-400 w-28 shrink-0">Physical (dailies)</span>
              <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-[width] duration-300"
                  style={{ width: `${phys}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-500 w-14 text-right tabular-nums">
                {dailiesDone}/{dailies.length}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-gray-400 w-28 shrink-0">Content (vows)</span>
              <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-400 rounded-full transition-[width] duration-300"
                  style={{ width: `${content}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-500 w-14 text-right tabular-nums">
                {vowsDone}/{bindingVows.length}
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <GlassCard title="Task throughput" icon={TrendingUp}>
            <p className="text-[10px] text-gray-600 mb-3">Live from your lists — no manual entry</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/30 text-center space-y-1">
                <Camera className="w-6 h-6 mx-auto text-pink-500" />
                <div className="text-2xl font-bold tabular-nums">{todosDone}</div>
                <div className="text-[10px] text-gray-500">Todos completed</div>
              </div>
              <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/30 text-center space-y-1">
                <Video className="w-6 h-6 mx-auto text-cyan-400" />
                <div className="text-2xl font-bold tabular-nums">{dailiesDone}</div>
                <div className="text-[10px] text-gray-500">Dailies completed</div>
              </div>
              <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/30 text-center col-span-2 space-y-1">
                <Tv className="w-6 h-6 mx-auto text-red-500" />
                <div className="text-2xl font-bold tabular-nums">{vowsDone}</div>
                <div className="text-[10px] text-gray-500">Binding vows completed</div>
              </div>
            </div>
          </GlassCard>

          <GlassCard title="Today's Reflection" icon={MessageSquare}>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">What&apos;s working?</label>
                <textarea
                  className="w-full mt-1 bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 text-sm text-gray-300 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none"
                  rows="2"
                  placeholder="Wins, momentum, systems that stick…"
                  value={rw}
                  onChange={(e) => setRw(e.target.value)}
                  onBlur={() => {
                    if (rw !== sixEyes.reflection.working) {
                      void patchSixEyes({
                        reflection: { ...sixEyes.reflection, working: rw },
                      });
                    }
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">What&apos;s failing?</label>
                <textarea
                  className="w-full mt-1 bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 text-sm text-gray-300 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none"
                  rows="2"
                  placeholder="Bottlenecks, distractions, energy leaks…"
                  value={rf}
                  onChange={(e) => setRf(e.target.value)}
                  onBlur={() => {
                    if (rf !== sixEyes.reflection.failing) {
                      void patchSixEyes({
                        reflection: { ...sixEyes.reflection, failing: rf },
                      });
                    }
                  }}
                />
              </div>
            </div>
          </GlassCard>
        </div>

        <div className="space-y-6">
          <GlassCard title="Domain Expansion" icon={Video}>
            <DomainExpansionVideoFrame videoClassName="opacity-95" />
            <div className="mt-4 p-3 bg-gray-800/40 rounded-xl border border-gray-700/30 text-center">
               <p className="text-sm font-semibold text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">
                 "Throughout Heaven and Earth, I alone am the honored one."
               </p>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

// --- SHOP DATA ---
const shopRewards = [
  { id: 1, type: 'reward', name: "Watch 1 Anime Episode", cost: 50, icon: Video },
  { id: 2, type: 'reward', name: "Cheat Meal (Guilt-Free)", cost: 300, icon: Flame },
  { id: 3, type: 'reward', name: "Buy New Book/Course", cost: 500, icon: Target },
  { id: 4, type: 'reward', name: "Full Day Off (No Penalties)", cost: 1000, icon: Moon },
];

const cursedTools = [
  { id: 't1', type: 'tool', name: 'Slaughter Demon', grade: 'Grade 4', cost: 200, desc: '+5 Boss DMG per task', icon: Swords },
  { id: 't2', type: 'tool', name: "Nanami's Cleaver", grade: 'Grade 1', cost: 800, desc: '+15 XP per task', icon: Swords },
  { id: 't3', type: 'tool', name: 'Playful Cloud', grade: 'Special Grade', cost: 2500, desc: '+30 Gold per task', icon: Swords },
  { id: 't4', type: 'tool', name: 'Inverted Spear of Heaven', grade: 'Special Grade', cost: 5000, desc: '+50 Boss DMG per task', icon: Swords },
];

const cursedTechniques = [
  { id: 'c1', type: 'technique', name: 'Boogie Woogie', grade: 'Grade 2', cost: 500, desc: '+10 CE restore per task', icon: BookOpen },
  { id: 'c2', type: 'technique', name: 'Blood Manipulation', grade: 'Grade 1', cost: 1000, desc: 'RCT Cost reduced to 40 CE', icon: BookOpen },
  { id: 'c3', type: 'technique', name: 'Ten Shadows', grade: 'Special Grade', cost: 3000, desc: '+25 Base XP on everything', icon: BookOpen },
  { id: 'c4', type: 'technique', name: 'Limitless (Gojo)', grade: 'Special Grade', cost: 8000, desc: '2x Boss DMG & 2x XP Multipliers', icon: BookOpen },
  { id: 'c5', type: 'technique', name: 'Six Eyes (Gojo)', grade: 'Special Grade', cost: 12000, desc: 'RCT costs 10 CE, +20 CE per task', icon: Eye },
  { id: 'c6', type: 'technique', name: 'Infinity (Gojo)', grade: 'Special Grade', cost: 15000, desc: 'Immune to all HP damage', icon: ShieldAlert },
  { id: 'c7', type: 'technique', name: 'Hollow Purple', grade: 'Special Grade', cost: 20000, desc: '3x Multiplier & +100 Boss DMG', icon: Zap },
];

const ShopView = ({ gold, profile, onPurchaseItem, onEquipItem }) => {
  const handlePurchase = async (item) => {
    try {
      await onPurchaseItem(item);
      if (item.type !== 'reward') {
        alert(`Acquired ${item.name}! You can equip it in your Profile.`);
      } else {
        alert(`Purchased Reward: ${item.name}!`);
      }
    } catch (e) {
      const code = e?.message;
      if (code === 'NO_GOLD') alert("Not enough gold! Go exorcise more curses.");
      else if (code === 'OWNED') alert("You already own this item!");
      else alert(e?.message || 'Purchase failed.');
    }
  };

  const equipItem = async (item) => {
    try {
      await onEquipItem(item);
      alert(`Equipped ${item.name}`);
    } catch (e) {
      alert(e?.message || 'Could not equip item.');
    }
  };

  const ShopCard = ({ item }) => {
    const isOwned = profile.inventory.includes(item.id);
    const isEquipped = profile.equippedTool === item.id || profile.equippedTechnique === item.id;
    
    return (
      <GlassCard className={`flex flex-col justify-between hover:border-amber-500/50 transition ${isEquipped ? 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] bg-amber-900/10' : ''}`}>
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 bg-gray-800 rounded-xl shrink-0"><item.icon className={`w-6 h-6 ${isEquipped ? 'text-amber-400' : 'text-gray-300'}`} /></div>
          <div>
            <div className="font-semibold">{item.name}</div>
            {item.grade && <div className="text-[10px] uppercase font-bold text-amber-500 tracking-widest mt-1">{item.grade}</div>}
            {item.desc && <div className="text-xs text-gray-400 mt-1">{item.desc}</div>}
          </div>
        </div>
        
        {item.type === 'reward' ? (
          <button type="button" onClick={() => void handlePurchase(item)} className={`w-full py-2 rounded-xl font-bold text-sm transition ${gold >= item.cost ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-gray-900' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}>
            Buy - {item.cost} G
          </button>
        ) : isOwned ? (
          <button type="button" onClick={() => void equipItem(item)} className={`w-full py-2 rounded-xl font-bold text-sm transition ${isEquipped ? 'bg-amber-500 text-gray-900' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
            {isEquipped ? 'Equipped' : 'Equip'}
          </button>
        ) : (
          <button type="button" onClick={() => void handlePurchase(item)} className={`w-full py-2 rounded-xl font-bold text-sm transition ${gold >= item.cost ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-gray-900' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}>
            Purchase - {item.cost} G
          </button>
        )}
      </GlassCard>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-10">
      <div className="flex justify-between items-center bg-amber-500/10 border border-amber-500/30 p-6 rounded-3xl">
        <div>
          <h2 className="text-xl font-bold text-amber-400">Jujutsu Armory & Shop</h2>
          <p className="text-sm text-gray-400">Trade your gold for real-world rewards or Cursed gear.</p>
        </div>
        <div className="flex items-center gap-2 bg-gray-900 px-6 py-3 rounded-2xl border border-amber-500/50 shadow-[0_0_15px_rgba(251,191,36,0.1)]">
          <Coins className="w-6 h-6 text-amber-400" />
          <span className="text-2xl font-bold text-amber-400">{gold}</span>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b border-gray-800 pb-2">Real World Rewards</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {shopRewards.map(item => <ShopCard key={item.id} item={item} />)}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b border-gray-800 pb-2">Cursed Tools (Passive Buffs)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cursedTools.map(item => <ShopCard key={item.id} item={item} />)}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b border-gray-800 pb-2">Innate Techniques (Gameplay Modifiers)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cursedTechniques.map(item => <ShopCard key={item.id} item={item} />)}
        </div>
      </div>
    </div>
  );
};

const ProfileView = ({
  userStats,
  profile,
  fileInputRef,
  handlePfpUpload,
  currentGrade,
  getJJKColor,
  onProfileNameCommit,
  onDeleteAccount,
  deletingAccount,
}) => {
  const [nameEdit, setNameEdit] = useState(profile.name);
  useEffect(() => {
    setNameEdit(profile.name);
  }, [profile.name]);

  const currentTool = cursedTools.find(t => t.id === profile.equippedTool);
  const currentTechnique = cursedTechniques.find(t => t.id === profile.equippedTechnique);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-10">
      <GlassCard className="border-t-4 border-t-emerald-500/50">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="w-32 h-32 rounded-full border-4 border-emerald-500/50 bg-gray-800 overflow-hidden cursor-pointer relative group flex items-center justify-center shrink-0"
            title="Click to change Profile Picture"
          >
            {profile.avatarUrl ? (
               <img src={profile.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
               <User className="w-12 h-12 text-gray-400" />
            )}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
               <Camera className="w-8 h-8 text-white" />
            </div>
          </div>
          
          <div className="flex-1 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
              <input 
                type="text" 
                value={nameEdit}
                onChange={(e) => setNameEdit(e.target.value)}
                onBlur={() => onProfileNameCommit(nameEdit)}
                className="bg-transparent text-3xl font-bold text-white focus:outline-none focus:border-b focus:border-emerald-500 w-full max-w-[250px]"
              />
              <Edit className="w-5 h-5 text-gray-500 cursor-pointer" />
            </div>
            <h2 className={`text-xl font-bold tracking-wide ${getJJKColor(currentGrade)}`}>
              {currentGrade === 'Satoru Gojo' ? 'Satoru Gojo' : `${currentGrade} Sorcerer`}
            </h2>
            <p className="text-sm text-gray-400 mt-2">Level {userStats.level} · {userStats.xp} / {userStats.maxXp} XP to next level</p>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassCard title="Combat Stats" icon={Target}>
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-700/50 pb-2">
              <span className="text-gray-400">Max Health (HP)</span>
              <span className="font-bold text-red-400">{userStats.maxHp}</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-700/50 pb-2">
              <span className="text-gray-400">Max Cursed Energy (CE)</span>
              <span className="font-bold text-blue-400">{userStats.maxCe}</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-700/50 pb-2">
              <span className="text-gray-400">Longest Streak</span>
              <span className="font-bold text-purple-400">{userStats.maxStreak} Days</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Wealth</span>
              <span className="font-bold text-amber-400">{userStats.gold} Gold</span>
            </div>
          </div>
        </GlassCard>

        <GlassCard title="Equipped Gear" icon={Swords}>
          <div className="space-y-4">
            <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
              <div className="text-xs text-emerald-500 uppercase tracking-widest mb-2 font-bold">Cursed Tool</div>
              {currentTool ? (
                <div>
                  <div className="font-bold text-white">{currentTool.name} <span className="text-[10px] text-amber-500 ml-2">{currentTool.grade}</span></div>
                  <div className="text-xs text-gray-400 mt-1">{currentTool.desc}</div>
                </div>
              ) : (
                <div className="text-sm text-gray-500 italic">None equipped</div>
              )}
            </div>

            <div className="bg-gray-800/40 p-4 rounded-xl border border-gray-700/50">
              <div className="text-xs text-purple-500 uppercase tracking-widest mb-2 font-bold">Innate Technique</div>
              {currentTechnique ? (
                <div>
                  <div className="font-bold text-white">{currentTechnique.name} <span className="text-[10px] text-amber-500 ml-2">{currentTechnique.grade}</span></div>
                  <div className="text-xs text-gray-400 mt-1">{currentTechnique.desc}</div>
                </div>
              ) : (
                <div className="text-sm text-gray-500 italic">None equipped</div>
              )}
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="border border-red-500/30 bg-red-950/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-red-400">Danger zone</h3>
            <p className="mt-2 text-sm text-gray-400 max-w-xl">
              Permanently delete your account and all saved progress (stats, tasks, profile, shop data). After you
              confirm, your browser opens Google in a full-page sign-in (not a popup) to verify it’s you. This cannot be
              undone.
            </p>
          </div>
          <button
            type="button"
            disabled={deletingAccount}
            onClick={() => void onDeleteAccount()}
            className="shrink-0 rounded-xl border border-red-500/50 bg-red-500/10 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-red-300 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deletingAccount ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </GlassCard>
    </div>
  );
};


// --- MAIN APP COMPONENT ---
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userDocReady, setUserDocReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [currentDate, setCurrentDate] = useState('');
  const [activePage, setActivePage] = useState('dashboard');
  const [showBlackFlash, setShowBlackFlash] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const accountDeleteInProgressRef = useRef(false);
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState({
    name: '',
    avatarUrl: null,
    equippedTool: null,
    equippedTechnique: null,
    inventory: [],
  });

  const [userStats, setUserStats] = useState({
    level: 1,
    hp: 50,
    maxHp: 50,
    ce: 100,
    maxCe: 100,
    xp: 0,
    maxXp: 100,
    gold: 0,
    streak: 0,
    maxStreak: 0,
    hasBlackFlash: false,
    spiritsExorcised: 0,
  });

  const [boss, setBoss] = useState({
    name: 'Mahito (Special Grade)',
    hp: 850,
    maxHp: 1000,
    img: '💀',
  });

  const [habits, setHabits] = useState([]);
  const [bindingVows, setBindingVows] = useState([]);
  const [dailies, setDailies] = useState([]);
  const [todos, setTodos] = useState([]);
  const [sixEyes, setSixEyes] = useState(() => mergeSixEyes(null));

  const [newVowText, setNewVowText] = useState('');
  const [newDailyText, setNewDailyText] = useState('');
  const [newTodoText, setNewTodoText] = useState('');
  const [newHabitText, setNewHabitText] = useState('');

  /** Inline edit: `{ kind, id }` or null — easy to mirror with Firestore field paths later. */
  const [editingTask, setEditingTask] = useState(null);
  const [editDraft, setEditDraft] = useState('');

  /** After Google redirect re-auth for account deletion, finish delete (avoids popup-blocked). */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await getAuthRedirectResultOnce();
        if (cancelled) return;
        if (sessionStorage.getItem(ACCOUNT_DELETE_REDIRECT_FLAG) !== '1') return;

        if (!result?.user) {
          sessionStorage.removeItem(ACCOUNT_DELETE_REDIRECT_FLAG);
          alert('Google verification was cancelled or did not finish. Your account was not deleted.');
          return;
        }

        if (accountDeleteInProgressRef.current) return;
        accountDeleteInProgressRef.current = true;

        sessionStorage.removeItem(ACCOUNT_DELETE_REDIRECT_FLAG);
        setDeletingAccount(true);
        const u = result.user;
        const uid = u.uid;
        try {
          try {
            const avatarsRef = ref(storage, `avatars/${uid}`);
            const { items } = await listAll(avatarsRef);
            await Promise.all(items.map((itemRef) => deleteObject(itemRef)));
          } catch (storageErr) {
            console.warn('Storage cleanup:', storageErr);
          }
          await deleteDoc(doc(db, 'users', uid));
          await deleteUser(u);
        } catch (err) {
          alert(err?.message || 'Could not finish deleting your account.');
        } finally {
          if (!cancelled) setDeletingAccount(false);
          accountDeleteInProgressRef.current = false;
        }
      } catch (e) {
        console.error(e);
        sessionStorage.removeItem(ACCOUNT_DELETE_REDIRECT_FLAG);
      } finally {
        authRedirectResultPromise = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthLoading(true);
      setUserDocReady(false);
      if (!firebaseUser) {
        setUser(null);
        setAuthLoading(false);
        return;
      }
      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          ...buildDefaultUserDocument(firebaseUser.displayName),
          email: firebaseUser.email ?? null,
          displayName: firebaseUser.displayName ?? null,
          createdAt: serverTimestamp(),
        });
      }
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    setUserDocReady(false);
    const userRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        setUserStats(d.userStats);
        setProfile({
          name: '',
          avatarUrl: null,
          equippedTool: null,
          equippedTechnique: null,
          inventory: [],
          ...(d.profile && typeof d.profile === 'object' ? d.profile : {}),
        });
        setBoss(d.boss);
        setHabits(d.habits ?? []);
        setBindingVows(d.bindingVows ?? []);
        setDailies(d.dailies ?? []);
        setTodos(d.todos ?? []);
        setSixEyes(mergeSixEyes(d.sixEyes));
        setUserDocReady(true);
      },
      (err) => console.error('Firestore snapshot error', err),
    );
    return () => unsub();
  }, [user]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err?.message || 'Sign-in failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setActivePage('dashboard');
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAccount = () => {
    if (!user) return;
    const sure = window.confirm(
      'Delete your account permanently? All progress, tasks, and profile data will be removed. This cannot be undone.',
    );
    if (!sure) return;
    const typed = window.prompt('Type DELETE in capital letters to confirm.');
    if (typed !== 'DELETE') {
      if (typed !== null) {
        alert('Text did not match. Your account was not deleted.');
      }
      return;
    }
    sessionStorage.setItem(ACCOUNT_DELETE_REDIRECT_FLAG, '1');
    setDeletingAccount(true);
    reauthenticateWithRedirect(user, googleProvider).catch((err) => {
      sessionStorage.removeItem(ACCOUNT_DELETE_REDIRECT_FLAG);
      setDeletingAccount(false);
      alert(err?.message || 'Could not start Google verification.');
    });
  };

  /**
   * Single choke point for list mutations — today: `updateDoc`; later: same signature works for optimistic local state.
   * @param {'bindingVows'|'dailies'|'todos'|'habits'} fieldName
   * @param {unknown[]} nextArray
   */
  const patchUserList = async (fieldName, nextArray) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), { [fieldName]: nextArray });
  };

  const patchSixEyes = useCallback(
    async (patch) => {
      if (!user) return;
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      const prev = mergeSixEyes(snap.data()?.sixEyes);
      const next = {
        ...prev,
        ...patch,
        personalBrand: patch.personalBrand
          ? { ...prev.personalBrand, ...patch.personalBrand }
          : prev.personalBrand,
        reflection: patch.reflection ? { ...prev.reflection, ...patch.reflection } : prev.reflection,
        energyZones: patch.energyZones ? { ...prev.energyZones, ...patch.energyZones } : prev.energyZones,
      };
      await updateDoc(userRef, { sixEyes: next });
    },
    [user],
  );

  const addVow = async (e) => {
    e.preventDefault();
    if (!user || !newVowText.trim()) return;
    await patchUserList('bindingVows', [
      ...bindingVows,
      { id: Date.now(), text: newVowText.trim(), completed: false, xpReward: 200, hpPenalty: 20 },
    ]);
    setNewVowText('');
  };

  const addDaily = async (e) => {
    e.preventDefault();
    if (!user || !newDailyText.trim()) return;
    await patchUserList('dailies', [
      ...dailies,
      { id: Date.now(), text: newDailyText.trim(), completed: false, grade: 'Grade 4' },
    ]);
    setNewDailyText('');
  };

  const addTodo = async (e) => {
    e.preventDefault();
    if (!user || !newTodoText.trim()) return;
    await patchUserList('todos', [
      ...todos,
      { id: Date.now(), text: newTodoText.trim(), completed: false, grade: 'Grade 4' },
    ]);
    setNewTodoText('');
  };

  const addHabit = async (e) => {
    e.preventDefault();
    if (!user || !newHabitText.trim()) return;
    await patchUserList('habits', [
      ...habits,
      { id: Date.now(), text: newHabitText.trim(), positive: true, negative: true },
    ]);
    setNewHabitText('');
  };

  const cancelTaskEdit = () => {
    setEditingTask(null);
    setEditDraft('');
  };

  const startTaskEdit = (kind, id, currentText) => {
    setEditingTask({ kind, id });
    setEditDraft(currentText);
  };

  const deleteVow = async (id) => {
    cancelTaskEdit();
    await patchUserList(
      'bindingVows',
      bindingVows.filter((v) => v.id !== id),
    );
  };

  const deleteDaily = async (id) => {
    cancelTaskEdit();
    await patchUserList(
      'dailies',
      dailies.filter((d) => d.id !== id),
    );
  };

  const deleteTodo = async (id) => {
    cancelTaskEdit();
    await patchUserList(
      'todos',
      todos.filter((t) => t.id !== id),
    );
  };

  const deleteHabit = async (id) => {
    cancelTaskEdit();
    await patchUserList(
      'habits',
      habits.filter((h) => h.id !== id),
    );
  };

  const saveVowText = async (id) => {
    const text = editDraft.trim();
    if (!text) {
      cancelTaskEdit();
      return;
    }
    await patchUserList(
      'bindingVows',
      bindingVows.map((v) => (v.id === id ? { ...v, text } : v)),
    );
    cancelTaskEdit();
  };

  const saveDailyText = async (id) => {
    const text = editDraft.trim();
    if (!text) {
      cancelTaskEdit();
      return;
    }
    await patchUserList(
      'dailies',
      dailies.map((d) => (d.id === id ? { ...d, text } : d)),
    );
    cancelTaskEdit();
  };

  const saveTodoText = async (id) => {
    const text = editDraft.trim();
    if (!text) {
      cancelTaskEdit();
      return;
    }
    await patchUserList(
      'todos',
      todos.map((t) => (t.id === id ? { ...t, text } : t)),
    );
    cancelTaskEdit();
  };

  const saveHabitText = async (id) => {
    const text = editDraft.trim();
    if (!text) {
      cancelTaskEdit();
      return;
    }
    await patchUserList(
      'habits',
      habits.map((h) => (h.id === id ? { ...h, text } : h)),
    );
    cancelTaskEdit();
  };

  const gainRewards = async (
    baseXp,
    baseGold,
    bossDamage = 10,
    ceRestore = 0,
    trackSpiritCompletion = false,
  ) => {
    if (!user) return;
    const shouldFlash = await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', user.uid);
      const snap = await transaction.get(userRef);
      const d = snap.data();
      const { userStats: nextStats, boss: nextBoss, shouldFlashBlack } = applyGainRewards(
        d.userStats,
        d.profile,
        d.boss,
        baseXp,
        baseGold,
        bossDamage,
        ceRestore,
      );
      let payload = { userStats: nextStats, boss: nextBoss };
      if (trackSpiritCompletion) {
        payload = { userStats: withSpiritExorcism(nextStats), boss: nextBoss };
      }
      transaction.update(userRef, payload);
      return shouldFlashBlack;
    });
    if (shouldFlash) {
      setShowBlackFlash(true);
      setTimeout(() => setShowBlackFlash(false), 800);
    }
  };

  const takeDamage = async (damage) => {
    if (!user) return;
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', user.uid);
      const snap = await transaction.get(userRef);
      const d = snap.data();
      const { userStats: nextStats, changed } = applyTakeDamage(d.userStats, d.profile, damage);
      if (changed) transaction.update(userRef, { userStats: nextStats });
    });
  };

  const useRCT = async () => {
    if (!user) return;
    let rctCost = 80;
    if (profile.equippedTechnique === 'c2') rctCost = 40;
    if (profile.equippedTechnique === 'c5') rctCost = 10;
    if (userStats.ce < rctCost) {
      alert(`Not enough Cursed Energy to use RCT! You need ${rctCost} CE.`);
      return;
    }
    if (userStats.hp >= userStats.maxHp) {
      alert('Your HP is already full!');
      return;
    }
    await updateDoc(doc(db, 'users', user.uid), {
      userStats: {
        ...userStats,
        ce: userStats.ce - rctCost,
        hp: Math.min(userStats.maxHp, userStats.hp + 20),
      },
    });
  };

  const handlePfpUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    try {
      const safeName = file.name.replace(/[^\w.\-]/g, '_');
      const storageRef = ref(storage, `avatars/${user.uid}/${Date.now()}_${safeName}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'users', user.uid), { 'profile.avatarUrl': url });
      setProfile((p) => ({ ...p, avatarUrl: url }));
    } catch (err) {
      console.error(err);
      alert('Could not upload profile picture.');
    }
    event.target.value = '';
  };

  const onProfileNameCommit = async (name) => {
    if (!user) return;
    const trimmed =
      (name || '').trim() ||
      user.displayName?.trim() ||
      DEFAULT_PROFILE_NAME;
    await updateDoc(doc(db, 'users', user.uid), { 'profile.name': trimmed });
  };

  /** @param {number} _habitId reserved for per-habit rules later */
  const handleHabit = (_habitId, isPositive) => {
    if (isPositive) void gainRewards(10, 2, 5, 10, true);
    else void takeDamage(5);
  };

  const triggerBlackFlashIf = (should) => {
    if (should) {
      setShowBlackFlash(true);
      setTimeout(() => setShowBlackFlash(false), 800);
    }
  };

  const toggleDaily = async (id) => {
    if (!user) return;
    const shouldFlash = await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', user.uid);
      const snap = await transaction.get(userRef);
      const d = snap.data();
      let nextUserStats = d.userStats;
      let nextBoss = d.boss;
      let flash = false;
      let completedNow = false;
      const nextDailies = d.dailies.map((day) => {
        if (day.id !== id) return day;
        if (!day.completed) {
          completedNow = true;
          const applied = applyGainRewards(nextUserStats, d.profile, nextBoss, 15, 5, 15, 0);
          nextUserStats = applied.userStats;
          nextBoss = applied.boss;
          if (applied.shouldFlashBlack) flash = true;
        }
        return { ...day, completed: !day.completed };
      });
      let payload = { dailies: nextDailies, userStats: nextUserStats, boss: nextBoss };
      if (completedNow) {
        payload = { ...payload, userStats: withSpiritExorcism(nextUserStats) };
      }
      transaction.update(userRef, payload);
      return flash;
    });
    triggerBlackFlashIf(shouldFlash);
  };

  const completeTodo = async (id) => {
    if (!user) return;
    const shouldFlash = await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', user.uid);
      const snap = await transaction.get(userRef);
      const d = snap.data();
      let nextUserStats = d.userStats;
      let nextBoss = d.boss;
      let flash = false;
      let completedNow = false;
      const nextTodos = d.todos.map((t) => {
        if (t.id !== id) return t;
        if (!t.completed) {
          completedNow = true;
          const applied = applyGainRewards(nextUserStats, d.profile, nextBoss, 20, 10, 20, 0);
          nextUserStats = applied.userStats;
          nextBoss = applied.boss;
          if (applied.shouldFlashBlack) flash = true;
        }
        return { ...t, completed: !t.completed };
      });
      let payload = { todos: nextTodos, userStats: nextUserStats, boss: nextBoss };
      if (completedNow) {
        payload = { ...payload, userStats: withSpiritExorcism(nextUserStats) };
      }
      transaction.update(userRef, payload);
      return flash;
    });
    triggerBlackFlashIf(shouldFlash);
  };

  const completeVow = async (id, isCompleting) => {
    if (!user) return;
    const shouldFlash = await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', user.uid);
      const snap = await transaction.get(userRef);
      const d = snap.data();
      let nextUserStats = d.userStats;
      let nextBoss = d.boss;
      let flash = false;
      let completedNow = false;
      const nextVows = d.bindingVows.map((v) => {
        if (v.id !== id) return v;
        if (isCompleting && !v.completed) {
          completedNow = true;
          const applied = applyGainRewards(
            nextUserStats,
            d.profile,
            nextBoss,
            v.xpReward,
            Math.floor(v.xpReward / 2),
            v.xpReward,
            0,
          );
          nextUserStats = applied.userStats;
          nextBoss = applied.boss;
          if (applied.shouldFlashBlack) flash = true;
        } else if (!isCompleting && v.completed) {
          const td = applyTakeDamage(nextUserStats, d.profile, v.hpPenalty);
          if (td.changed) nextUserStats = td.userStats;
        }
        return { ...v, completed: isCompleting };
      });
      let payload = { bindingVows: nextVows, userStats: nextUserStats, boss: nextBoss };
      if (completedNow) {
        payload = { ...payload, userStats: withSpiritExorcism(nextUserStats) };
      }
      transaction.update(userRef, payload);
      return flash;
    });
    triggerBlackFlashIf(shouldFlash);
  };

  const onPurchaseItem = (item) =>
    runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', user.uid);
      const snap = await transaction.get(userRef);
      const d = snap.data();
      const gold = d.userStats.gold;
      const inv = d.profile.inventory ?? [];
      if (gold < item.cost) throw new Error('NO_GOLD');
      if (item.type !== 'reward' && inv.includes(item.id)) throw new Error('OWNED');
      const newGold = gold - item.cost;
      if (item.type === 'reward') {
        transaction.update(userRef, { userStats: { ...d.userStats, gold: newGold } });
      } else {
        transaction.update(userRef, {
          userStats: { ...d.userStats, gold: newGold },
          profile: { ...d.profile, inventory: [...inv, item.id] },
        });
      }
    });

  const onEquipItem = (item) => {
    const field =
      item.type === 'tool' ? 'profile.equippedTool' : 'profile.equippedTechnique';
    return updateDoc(doc(db, 'users', user.uid), { [field]: item.id });
  };

  useEffect(() => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    setCurrentDate(new Date().toLocaleDateString('en-US', options));
  }, []);

  const getJJKGrade = (level) => {
    if (level < 5) return 'Grade 4';
    if (level < 10) return 'Grade 3';
    if (level < 15) return 'Semi-Grade 2';
    if (level < 20) return 'Grade 2';
    if (level < 30) return 'Semi-Grade 1';
    if (level < 40) return 'Grade 1';
    if (level < 50) return 'Special Grade 1';
    if (level < 100) return 'Special Grade';
    return 'Satoru Gojo';
  };

  const currentGrade = getJJKGrade(userStats.level);
  const getJJKColor = (grade) => {
    if (grade === 'Satoru Gojo') return 'text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.9)]';
    if (grade === 'Special Grade') return 'text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]';
    if (grade.includes('Grade 1')) return 'text-red-400';
    if (grade.includes('Grade 2')) return 'text-blue-400';
    if (grade.includes('Grade 3')) return 'text-emerald-400';
    return 'text-gray-200';
  };

  // Get currently equipped items to display in profile header
  const currentTool = cursedTools.find(t => t.id === profile.equippedTool);
  const currentTechnique = cursedTechniques.find(t => t.id === profile.equippedTechnique);

  let currentRctCost = 80;
  if (profile.equippedTechnique === 'c2') currentRctCost = 40;
  if (profile.equippedTechnique === 'c5') currentRctCost = 10;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center text-gray-400">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen onLogin={handleGoogleSignIn} signingIn={signingIn} authError={authError} />
    );
  }

  if (!userDocReady) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center text-gray-400">
        Syncing your curse data…
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#0a0a0c] text-white font-sans p-4 md:p-8 transition-colors duration-500 relative ${showBlackFlash ? 'bg-red-950' : 'bg-[radial-gradient(ellipse_at_top_right,var(--tw-gradient-stops))] from-gray-800/20 via-[#0a0a0c] to-[#0a0a0c]'}`}>
      
      {/* Black Flash Overlay Effect */}
      {showBlackFlash && (
        <div className="fixed inset-0 z-50 pointer-events-none bg-black/50 flex items-center justify-center mix-blend-overlay">
           <div className="text-9xl font-black italic text-red-600 outline-text drop-shadow-[0_0_50px_rgba(220,38,38,1)] transform -rotate-12 scale-150 tracking-tighter">BLACK FLASH</div>
        </div>
      )}

      {/* Header & Top Profile Section */}
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-linear-to-r from-emerald-400 to-cyan-400">{profile.name}</h1>
          <p className="text-gray-400 mt-1 flex items-center"><Calendar className="w-4 h-4 mr-2" /> {currentDate}</p>
        </div>
        
        {/* New Profile Corner */}
        <div 
          onClick={() => setActivePage('profile')}
          className="flex items-center gap-4 bg-gray-900/50 border border-gray-700/50 p-2 pl-4 rounded-full shadow-lg cursor-pointer hover:bg-gray-800/50 transition"
        >
          <div className="hidden md:flex flex-col items-end mr-2">
            <span className="text-sm font-bold text-white">Lvl {userStats.level} Sorcerer</span>
            <div className="flex gap-2 mt-0.5">
               {currentTool ? <Swords className="w-3.5 h-3.5 text-emerald-400" title={`Equipped: ${currentTool.name}`} /> : <Swords className="w-3.5 h-3.5 text-gray-600" />}
               {currentTechnique ? <BookOpen className="w-3.5 h-3.5 text-purple-400" title={`Equipped: ${currentTechnique.name}`} /> : <BookOpen className="w-3.5 h-3.5 text-gray-600" />}
            </div>
          </div>
          
          <div 
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            className="w-12 h-12 rounded-full border-2 border-emerald-500/50 bg-gray-800 overflow-hidden relative group flex items-center justify-center"
            title="Click to change Profile Picture"
          >
            {profile.avatarUrl ? (
               <img src={profile.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
               <User className="w-6 h-6 text-gray-400" />
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
               <Camera className="w-5 h-5 text-white" />
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handlePfpUpload} 
              accept="image/*" 
              className="hidden" 
            />
          </div>
        </div>
      </header>

      {/* Navigation */}
      <div className="flex w-full flex-wrap items-center gap-3 mb-8 border-b border-gray-700/50 pb-4 overflow-x-auto scrollbar-hide">
        <button onClick={() => setActivePage('dashboard')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${activePage === 'dashboard' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-400 hover:text-gray-200 border border-transparent'}`}><LayoutDashboard className="w-4 h-4" /> Dashboard</button>
        <button onClick={() => setActivePage('workout')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${activePage === 'workout' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-400 hover:text-gray-200 border border-transparent'}`}><Dumbbell className="w-4 h-4" /> Workout Plan</button>
        <button onClick={() => setActivePage('domain')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${activePage === 'domain' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-gray-400 hover:text-gray-200 border border-transparent'}`}><Timer className="w-4 h-4" /> Domain Expansion</button>
        <button onClick={() => setActivePage('sixEyes')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${activePage === 'sixEyes' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'text-gray-400 hover:text-gray-200 border border-transparent'}`}><Eye className="w-4 h-4" /> Six Eyes</button>
        <button onClick={() => setActivePage('shop')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${activePage === 'shop' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-gray-400 hover:text-gray-200 border border-transparent'}`}><ShoppingBag className="w-4 h-4" /> Armory Shop</button>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-300 border border-gray-800 whitespace-nowrap md:ml-auto"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>

      {activePage === 'profile' && (
        <ProfileView
          userStats={userStats}
          profile={profile}
          fileInputRef={fileInputRef}
          handlePfpUpload={handlePfpUpload}
          currentGrade={currentGrade}
          getJJKColor={getJJKColor}
          onProfileNameCommit={onProfileNameCommit}
          onDeleteAccount={handleDeleteAccount}
          deletingAccount={deletingAccount}
        />
      )}
      {activePage === 'workout' && <WorkoutPlanView />}
      {activePage === 'domain' && <DomainExpansionView gainRewards={gainRewards} takeDamage={takeDamage} />}
      {activePage === 'sixEyes' && (
        <SixEyesAnalyticsView
          stats={userStats}
          sixEyes={sixEyes}
          patchSixEyes={patchSixEyes}
          dailies={dailies}
          todos={todos}
          bindingVows={bindingVows}
        />
      )}
      {activePage === 'shop' && (
        <ShopView gold={userStats.gold} profile={profile} onPurchaseItem={onPurchaseItem} onEquipItem={onEquipItem} />
      )}

      {activePage === 'dashboard' && (
        <div className="animate-fade-in">
          {/* RPG Player Stats Bar */}
          <GlassCard className={`mb-8 flex flex-col md:flex-row items-center justify-between gap-6 py-4 px-6 transition-all duration-300 ${userStats.hasBlackFlash ? 'border-red-500 shadow-[0_0_30px_rgba(220,38,38,0.3)] bg-red-950/20' : 'border-emerald-500/30'}`}>
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center ${userStats.hasBlackFlash ? 'bg-red-500/20 border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)]' : 'bg-emerald-500/20 border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]'}`}>
                  <span className={`text-2xl font-bold ${userStats.hasBlackFlash ? 'text-red-500' : 'text-emerald-400'}`}>{userStats.level}</span>
                </div>
                {userStats.hasBlackFlash && <Zap className="absolute -top-2 -right-2 w-6 h-6 text-red-500 fill-red-500 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)] animate-pulse" />}
              </div>
              <div>
                <h2 className={`text-lg font-bold tracking-wide ${getJJKColor(currentGrade)}`}>
                  {currentGrade === 'Satoru Gojo' ? 'Satoru Gojo' : `${currentGrade} Sorcerer`}
                </h2>
                <div className="text-xs text-gray-400 uppercase tracking-widest flex items-center gap-2">
                   Streak: <span className="text-white font-bold">{userStats.streak}</span>
                   {userStats.hasBlackFlash && <span className="text-red-400 font-bold ml-1 border border-red-500/50 px-1.5 rounded bg-red-500/10 text-[10px]">2.5x NEXT REWARD</span>}
                </div>
              </div>
            </div>

            <div className="flex-1 w-full max-w-2xl space-y-3 px-4">
              {/* HP Bar */}
              <div className="flex items-center gap-3">
                <Heart className="w-4 h-4 text-red-500 fill-red-500/20" />
                <div className="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden border border-gray-700">
                  <div className="bg-linear-to-r from-red-600 to-red-400 h-full rounded-full transition-all duration-300" style={{width: `${(userStats.hp / userStats.maxHp) * 100}%`}}></div>
                </div>
                <span className="text-xs font-mono text-gray-400 w-12 text-right">{userStats.hp} / {userStats.maxHp}</span>
              </div>
              {/* Cursed Energy Bar */}
              <div className="flex items-center gap-3">
                <Flame className="w-4 h-4 text-blue-500 fill-blue-500/20" />
                <div className="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden border border-gray-700">
                  <div className="bg-linear-to-r from-blue-600 to-cyan-400 h-full rounded-full transition-all duration-300" style={{width: `${(userStats.ce / userStats.maxCe) * 100}%`}}></div>
                </div>
                <span className="text-xs font-mono text-gray-400 w-12 text-right">{userStats.ce} / {userStats.maxCe}</span>
              </div>
              {/* XP Bar */}
              <div className="flex items-center gap-3">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500/20" />
                <div className="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden border border-gray-700">
                  <div className="bg-linear-to-r from-yellow-600 to-yellow-400 h-full rounded-full transition-all duration-300" style={{width: `${(userStats.xp / userStats.maxXp) * 100}%`}}></div>
                </div>
                <span className="text-xs font-mono text-gray-400 w-12 text-right">{userStats.xp} / {userStats.maxXp}</span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 bg-gray-800/80 px-4 py-2 rounded-xl border border-amber-500/30">
                <Coins className="w-6 h-6 text-amber-400 fill-amber-400/20" />
                <span className="text-xl font-bold text-amber-400">{userStats.gold}</span>
              </div>
              <button type="button" onClick={() => void useRCT()} className={`px-4 py-1.5 rounded-xl text-xs font-bold border transition ${userStats.ce >= currentRctCost ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30' : 'bg-gray-800/50 text-gray-500 border-gray-700 cursor-not-allowed'}`}>
                RCT Heal ({currentRctCost} CE)
              </button>
            </div>
          </GlassCard>

          {/* MAIN DASHBOARD COLUMNS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* LEFT COLUMN: Bounty Board */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Boss Battle Card */}
              <div className="bg-purple-950/20 border border-purple-500/30 rounded-3xl p-6 relative overflow-hidden shadow-[0_0_30px_rgba(168,85,247,0.1)]">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                 <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Skull className="w-5 h-5 text-purple-400" />
                        <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">Active Exorcism</span>
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-4">{boss.name}</h3>
                    </div>
                    <div className="text-4xl">{boss.img}</div>
                 </div>
                 
                 <div className="bg-gray-900 rounded-full h-4 overflow-hidden border border-gray-700 p-0.5">
                   <div className="bg-linear-to-r from-purple-800 to-purple-400 h-full rounded-full transition-all duration-700" style={{width: `${(boss.hp / boss.maxHp) * 100}%`}}></div>
                 </div>
                 <div className="flex justify-between mt-2">
                    <span className="text-xs text-gray-400">Exorcise by completing Bounties</span>
                    <span className="text-xs font-mono font-bold text-purple-400">{boss.hp} / {boss.maxHp} HP</span>
                 </div>
              </div>

              {/* Binding Vows */}
              <GlassCard title="Binding Vows" icon={ShieldAlert} titleColor="text-red-400" className="border-red-500/30 bg-red-950/10">
                <div className="space-y-3">
                  {bindingVows.map(vow => (
                    <div key={vow.id} className="group flex flex-col md:flex-row items-start md:items-center justify-between bg-gray-900/60 p-4 rounded-xl border border-red-500/30 hover:border-red-500/50 transition gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                           {vow.completed ? <Check className="w-5 h-5 shrink-0 text-red-500 cursor-pointer" onClick={() => completeVow(vow.id, false)} /> : <Square className="w-5 h-5 shrink-0 text-gray-500 cursor-pointer" onClick={() => completeVow(vow.id, true)} />}
                           {editingTask?.kind === 'vow' && editingTask.id === vow.id ? (
                             <input
                               autoFocus
                               value={editDraft}
                               onChange={(e) => setEditDraft(e.target.value)}
                               onKeyDown={(e) => {
                                 if (e.key === 'Enter') {
                                   e.preventDefault();
                                   void saveVowText(vow.id);
                                 }
                                 if (e.key === 'Escape') {
                                   e.preventDefault();
                                   cancelTaskEdit();
                                 }
                               }}
                               placeholder="Vow text · Enter save · Esc cancel"
                               className="min-w-0 flex-1 rounded-lg border border-red-500/40 bg-gray-900/60 px-2 py-1 text-sm font-semibold text-red-100 placeholder:text-red-900/40 focus:border-red-400/60 focus:outline-none"
                             />
                           ) : (
                             <span className={`font-semibold ${vow.completed ? 'line-through text-gray-500' : 'text-red-100'}`}>{vow.text}</span>
                           )}
                           <TaskListIconButtons
                             onEdit={() => startTaskEdit('vow', vow.id, vow.text)}
                             onDelete={() => void deleteVow(vow.id)}
                           />
                        </div>
                        <p className="text-xs text-gray-400 mt-1 ml-7">Condition: Complete before midnight. Penalty: -{vow.hpPenalty} HP</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 ml-7 md:ml-0">
                        <div className="bg-red-500/20 text-red-400 px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap">
                         REWARD: +{vow.xpReward} XP
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Add New Vow Form */}
                  <form onSubmit={addVow} className="mt-4 flex gap-2">
                    <input 
                      value={newVowText} 
                      onChange={(e) => setNewVowText(e.target.value)} 
                      placeholder="Forge a new Binding Vow..." 
                      className="flex-1 bg-gray-900/50 border border-red-900/50 rounded-xl p-3 text-sm text-gray-300 focus:outline-none focus:border-red-500/50 transition-colors placeholder-red-900/50" 
                    />
                    <button type="submit" className="px-4 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/40 transition flex items-center justify-center">
                      <Plus className="w-5 h-5" />
                    </button>
                  </form>
                </div>
              </GlassCard>

              {/* Bounties (Todos & Dailies) */}
              <GlassCard title="Jujutsu High Bounty Board" icon={Target} className="border-t-4 border-t-emerald-500/50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs text-gray-400 uppercase tracking-widest mb-3">Daily Curses</h4>
                    <div className="space-y-3">
                      {dailies.map(daily => (
                        <div
                          key={daily.id}
                          className={`group flex items-center justify-between gap-2 bg-gray-800/40 p-3 rounded-xl border border-gray-700/50 transition hover:bg-gray-800/60 ${daily.completed ? 'opacity-50' : ''}`}
                        >
                          <div
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                            onClick={() =>
                              !(editingTask?.kind === 'daily' && editingTask.id === daily.id) &&
                              toggleDaily(daily.id)
                            }
                          >
                            {daily.completed ? <Check className="h-5 w-5 shrink-0 text-emerald-400" /> : <Square className="h-5 w-5 shrink-0 text-gray-500" />}
                            {editingTask?.kind === 'daily' && editingTask.id === daily.id ? (
                              <input
                                autoFocus
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void saveDailyText(daily.id);
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    cancelTaskEdit();
                                  }
                                }}
                                placeholder="Daily · Enter · Esc"
                                className="min-w-0 flex-1 rounded-lg border border-emerald-500/30 bg-gray-900/50 px-2 py-1 text-sm text-gray-200 placeholder:text-gray-600 focus:border-emerald-500/50 focus:outline-none"
                              />
                            ) : (
                              <span className={`text-sm font-medium ${daily.completed ? 'line-through text-gray-500' : ''}`}>{daily.text}</span>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-[10px] uppercase font-bold text-gray-400 border border-gray-600 px-2 py-0.5 rounded">{daily.grade}</span>
                            <TaskListIconButtons
                              onEdit={() => startTaskEdit('daily', daily.id, daily.text)}
                              onDelete={() => void deleteDaily(daily.id)}
                            />
                          </div>
                        </div>
                      ))}
                      
                      {/* Add New Daily Form */}
                      <form onSubmit={addDaily} className="mt-2 flex gap-2">
                        <input 
                          value={newDailyText} 
                          onChange={(e) => setNewDailyText(e.target.value)} 
                          placeholder="Add daily curse..." 
                          className="flex-1 bg-gray-800/40 border border-gray-700/50 rounded-xl p-2 text-sm text-gray-300 focus:outline-none focus:border-emerald-500/50 transition-colors" 
                        />
                        <button type="submit" className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/40 transition">
                          <Plus className="w-5 h-5" />
                        </button>
                      </form>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs text-gray-400 uppercase tracking-widest mb-3">Objective Bounties</h4>
                    <div className="space-y-3">
                      {todos.map(todo => (
                        <div
                          key={todo.id}
                          className={`group flex items-center justify-between gap-2 bg-gray-800/40 p-3 rounded-xl border border-gray-700/50 transition hover:bg-gray-800/60 ${todo.completed ? 'opacity-50' : ''}`}
                        >
                          <div
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                            onClick={() =>
                              !(editingTask?.kind === 'todo' && editingTask.id === todo.id) &&
                              completeTodo(todo.id)
                            }
                          >
                            {todo.completed ? <Check className="h-5 w-5 shrink-0 text-amber-400" /> : <Square className="h-5 w-5 shrink-0 text-gray-500" />}
                            {editingTask?.kind === 'todo' && editingTask.id === todo.id ? (
                              <input
                                autoFocus
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void saveTodoText(todo.id);
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    cancelTaskEdit();
                                  }
                                }}
                                placeholder="Bounty · Enter · Esc"
                                className="min-w-0 flex-1 rounded-lg border border-amber-500/30 bg-gray-900/50 px-2 py-1 text-sm text-gray-200 placeholder:text-gray-600 focus:border-amber-500/50 focus:outline-none"
                              />
                            ) : (
                              <span className={`text-sm font-medium ${todo.completed ? 'line-through text-gray-500' : ''}`}>{todo.text}</span>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-[10px] uppercase font-bold text-amber-400/70 border border-amber-600/50 bg-amber-500/10 px-2 py-0.5 rounded">{todo.grade}</span>
                            <TaskListIconButtons
                              onEdit={() => startTaskEdit('todo', todo.id, todo.text)}
                              onDelete={() => void deleteTodo(todo.id)}
                            />
                          </div>
                        </div>
                      ))}

                      {/* Add New Todo Form */}
                      <form onSubmit={addTodo} className="mt-2 flex gap-2">
                        <input 
                          value={newTodoText} 
                          onChange={(e) => setNewTodoText(e.target.value)} 
                          placeholder="Add objective bounty..." 
                          className="flex-1 bg-gray-800/40 border border-gray-700/50 rounded-xl p-2 text-sm text-gray-300 focus:outline-none focus:border-amber-500/50 transition-colors" 
                        />
                        <button type="submit" className="p-2 bg-amber-500/20 text-amber-400 rounded-xl hover:bg-amber-500/40 transition">
                          <Plus className="w-5 h-5" />
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </GlassCard>

            </div>

            {/* RIGHT COLUMN: Habits & Quick Stats */}
            <div className="space-y-6">
               <GlassCard title="Habits & Training" icon={Activity} className="border-t-4 border-t-purple-500/50">
                  <div className="space-y-3">
                    {habits.map(habit => (
                      <div key={habit.id} className="group flex items-center justify-between gap-2 bg-gray-800/40 p-3 rounded-xl border border-gray-700/50 transition hover:bg-gray-800/60">
                        <div className="min-w-0 flex-1">
                          {editingTask?.kind === 'habit' && editingTask.id === habit.id ? (
                            <input
                              autoFocus
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void saveHabitText(habit.id);
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  cancelTaskEdit();
                                }
                              }}
                              placeholder="Habit · Enter · Esc"
                              className="w-full rounded-lg border border-purple-500/30 bg-gray-900/50 px-2 py-1 text-sm text-gray-200 placeholder:text-gray-600 focus:border-purple-500/50 focus:outline-none"
                            />
                          ) : (
                            <span className="text-sm font-medium">{habit.text}</span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <TaskListIconButtons
                            onEdit={() => startTaskEdit('habit', habit.id, habit.text)}
                            onDelete={() => void deleteHabit(habit.id)}
                          />
                          {habit.positive && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleHabit(habit.id, true);
                              }}
                              className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/40 transition"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                          {habit.negative && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleHabit(habit.id, false);
                              }}
                              className="p-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/40 transition"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Add New Habit Form */}
                    <form onSubmit={addHabit} className="mt-2 flex gap-2">
                      <input 
                        value={newHabitText} 
                        onChange={(e) => setNewHabitText(e.target.value)} 
                        placeholder="Condition new habit..." 
                        className="flex-1 bg-gray-800/40 border border-gray-700/50 rounded-xl p-2 text-sm text-gray-300 focus:outline-none focus:border-purple-500/50 transition-colors" 
                      />
                      <button type="submit" className="p-2 bg-purple-500/20 text-purple-400 rounded-xl hover:bg-purple-500/40 transition">
                        <Plus className="w-5 h-5" />
                      </button>
                    </form>
                  </div>
               </GlassCard>

               <GlassCard title="Progressive Overload Coach" icon={Dumbbell}>
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-400 text-sm">Today's Split</span>
                      <span className="bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-xs font-semibold">PUSH DAY</span>
                    </div>
                    <h4 className="text-xl font-bold">Bicep Curls on Machine</h4>
                  </div>
                  <div className="bg-gray-800/40 rounded-2xl p-4 border border-gray-700/30 mb-4">
                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Last Session Target</div>
                    <div className="text-2xl font-bold text-gray-300">130kg <span className="text-sm font-normal text-gray-500">× 7 reps</span></div>
                  </div>
                  <div className="bg-emerald-900/20 rounded-2xl p-4 border border-emerald-500/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                    <div className="text-xs text-emerald-400 uppercase tracking-wider mb-1 font-semibold">Next Session Objective</div>
                    <div className="text-3xl font-bold text-white">130kg <span className="text-lg font-normal text-gray-400">× 8 reps</span></div>
                    <p className="text-xs text-gray-400 mt-2">7 days short of RPE 10. Required output adjusted for hypertrophy.</p>
                  </div>
                </GlassCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}