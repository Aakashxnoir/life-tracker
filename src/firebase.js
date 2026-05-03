import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyAg_HOXZbFSREJ5KRhReWsKhPky76KCSXU',
  authDomain: 'life-tracker-52891.firebaseapp.com',
  databaseURL: 'https://life-tracker-52891-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'life-tracker-52891',
  storageBucket: 'life-tracker-52891.firebasestorage.app',
  messagingSenderId: '326649212586',
  appId: '1:326649212586:web:76b39a90117c2acc4cead3',
  measurementId: 'G-5SB1YKD7KQ',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

/** Optional: resolves when Analytics is ready (no-op in unsupported environments). */
export const analyticsReady = isSupported().then((yes) => (yes ? getAnalytics(app) : null));

/** Shown when Google does not provide a display name. */
export const DEFAULT_PROFILE_NAME = 'Aakash Life tracker';

/** Six Eyes analytics — merged into existing user docs on read; new users get this shape. */
export const DEFAULT_SIX_EYES = {
  personalBrand: {
    instagram: 0,
    shortForm: 0,
    youtubeSubs: 0,
    instagramDeltaToday: 0,
    shortFormDeltaToday: 0,
  },
  reflection: { working: '', failing: '' },
  energyZones: { development: 33, physical: 33, content: 34 },
};

/**
 * @param {unknown} raw - `users/{uid}.sixEyes` from Firestore
 * @returns {typeof DEFAULT_SIX_EYES}
 */
export function mergeSixEyes(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_SIX_EYES,
      personalBrand: { ...DEFAULT_SIX_EYES.personalBrand },
      reflection: { ...DEFAULT_SIX_EYES.reflection },
      energyZones: { ...DEFAULT_SIX_EYES.energyZones },
    };
  }
  const pb =
    raw.personalBrand && typeof raw.personalBrand === 'object' ? raw.personalBrand : {};
  const ref = raw.reflection && typeof raw.reflection === 'object' ? raw.reflection : {};
  const ez = raw.energyZones && typeof raw.energyZones === 'object' ? raw.energyZones : {};
  return {
    personalBrand: { ...DEFAULT_SIX_EYES.personalBrand, ...pb },
    reflection: { ...DEFAULT_SIX_EYES.reflection, ...ref },
    energyZones: { ...DEFAULT_SIX_EYES.energyZones, ...ez },
  };
}

/**
 * @param {string | null | undefined} googleDisplayName - from Firebase Auth `user.displayName`
 */
export function buildDefaultUserDocument(googleDisplayName = null) {
  const trimmed =
    typeof googleDisplayName === 'string' ? googleDisplayName.trim() : '';
  const profileName = trimmed || DEFAULT_PROFILE_NAME;

  return {
    userStats: {
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
      /** Cumulative “Spirits Exorcised” — incremented on task / habit / Domain completions. */
      spiritsExorcised: 0,
    },
    profile: {
      name: profileName,
      avatarUrl: null,
      equippedTool: null,
      equippedTechnique: null,
      inventory: [],
    },
    boss: {
      name: 'Mahito (Special Grade)',
      hp: 850,
      maxHp: 1000,
      img: '💀',
    },
    habits: [
      { id: 1, text: 'Drink Water (+CE)', positive: true, negative: false },
      { id: 2, text: 'Doomscrolling (-HP)', positive: false, negative: true },
      { id: 3, text: 'Meditate (+CE)', positive: true, negative: false },
    ],
    bindingVows: [
      {
        id: 1,
        text: 'Deep Work: 4 Hours No Phone',
        completed: false,
        xpReward: 300,
        hpPenalty: 25,
      },
      { id: 2, text: 'Zero Sugar Today', completed: false, xpReward: 150, hpPenalty: 15 },
    ],
    dailies: [
      { id: 1, text: 'Morning Workout', completed: false, grade: 'Grade 3' },
      { id: 2, text: 'Read 10 pages', completed: false, grade: 'Grade 4' },
    ],
    todos: [
      { id: 1, text: 'Edit New Reel', completed: false, grade: 'Semi-Grade 2' },
      { id: 2, text: 'Pay Bills', completed: false, grade: 'Grade 3' },
    ],
    sixEyes: mergeSixEyes(null),
  };
}
