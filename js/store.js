// データの読み書き。Firebaseの設定があればFirestore、なければこの端末のlocalStorageを使う。
// オフラインではFirestoreの書き込み完了を待つと止まるため、書き込みの完了は待たない。
import { firebaseConfig, appCheckSiteKey } from './firebase-config.js?v=5';

const SDK = 'https://www.gstatic.com/firebasejs/12.5.0';

export function randomId(length = 24) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function createLocalStore() {
  const KEY = 'tabi-shiori.demo';
  const listeners = new Set();
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      return {};
    }
  };
  const write = (db) => {
    localStorage.setItem(KEY, JSON.stringify(db));
    listeners.forEach((fn) => fn());
  };
  const listen = (fn) => {
    const run = () => fn();
    listeners.add(run);
    queueMicrotask(run);
    return () => listeners.delete(run);
  };
  return {
    mode: 'local',
    async init() {},
    async getTrip(tripId) {
      return read()[tripId]?.trip ?? null;
    },
    createTrip(tripId, data) {
      const db = read();
      db[tripId] = { trip: { id: tripId, ...data }, sections: {} };
      write(db);
    },
    updateTrip(tripId, data) {
      const db = read();
      Object.assign(db[tripId].trip, data);
      write(db);
    },
    watchTrip(tripId, onData) {
      return listen(() => onData(read()[tripId]?.trip ?? null));
    },
    watchSection(tripId, section, onData) {
      return listen(() => onData(Object.values(read()[tripId]?.sections?.[section] ?? {})));
    },
    set(tripId, section, id, data) {
      const db = read();
      const sections = db[tripId].sections;
      sections[section] ??= {};
      sections[section][id] = { ...data, id };
      write(db);
    },
    remove(tripId, section, id) {
      const db = read();
      delete db[tripId].sections[section]?.[id];
      write(db);
    },
    deleteTrip(tripId) {
      const db = read();
      delete db[tripId];
      write(db);
    },
  };
}

async function createFirebaseStore() {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  if (appCheckSiteKey) {
    // オフラインで reCAPTCHA を読めなくても、端末に保存した内容は開けるようにする
    try {
      const appCheck = await import(`${SDK}/firebase-app-check.js`);
      appCheck.initializeAppCheck(app, {
        provider: new appCheck.ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (error) {
      console.error(error);
    }
  }
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  const authInstance = auth.getAuth(app);
  const tripRef = (tripId) => fs.doc(db, 'trips', tripId);
  const itemRef = (tripId, section, id) => fs.doc(db, 'trips', tripId, section, id);
  const report = (promise) => promise.catch((error) => {
    console.error(error);
    window.dispatchEvent(new CustomEvent('store-error', { detail: error }));
  });
  return {
    mode: 'firebase',
    async init() {
      await authInstance.authStateReady();
      if (!authInstance.currentUser) await auth.signInAnonymously(authInstance);
    },
    async getTrip(tripId) {
      const snap = await fs.getDoc(tripRef(tripId));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },
    createTrip(tripId, data) {
      report(fs.setDoc(tripRef(tripId), data));
    },
    updateTrip(tripId, data) {
      report(fs.updateDoc(tripRef(tripId), data));
    },
    watchTrip(tripId, onData, onError) {
      return fs.onSnapshot(tripRef(tripId), (snap) => {
        // 未接続でキャッシュにもないときは「存在しない」と決めつけない
        if (!snap.exists() && snap.metadata.fromCache) return;
        onData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      }, onError);
    },
    watchSection(tripId, section, onData, onError) {
      return fs.onSnapshot(fs.collection(db, 'trips', tripId, section), (snap) => {
        onData(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      }, onError);
    },
    // 精算の対象者を外せるよう、部分更新ではなく1件まるごと置き換える
    set(tripId, section, id, { id: _ignored, ...data }) {
      report(fs.setDoc(itemRef(tripId, section, id), data));
    },
    remove(tripId, section, id) {
      report(fs.deleteDoc(itemRef(tripId, section, id)));
    },
    // Firestoreは中身を自動で消さないので、各項目を消してから旅を消す
    deleteTrip(tripId, itemsBySection) {
      Object.entries(itemsBySection).forEach(([section, items]) => {
        items.forEach((item) => report(fs.deleteDoc(itemRef(tripId, section, item.id))));
      });
      report(fs.deleteDoc(tripRef(tripId)));
    },
  };
}

export const SECTION_NAMES = ['members', 'itinerary', 'places', 'reservations', 'expenses', 'images'];

export async function openStore() {
  // URLに ?demo を付けると、本番データに触れずにお試しモードで動く
  const useFirebase = firebaseConfig && !new URLSearchParams(location.search).has('demo');
  const store = useFirebase ? await createFirebaseStore() : createLocalStore();
  await store.init();
  return store;
}

// この端末で参加している旅行。サーバーには送らない。
const MY_TRIPS = 'tabi-shiori.myTrips';

export function loadMyTrips() {
  try {
    return JSON.parse(localStorage.getItem(MY_TRIPS)) || {};
  } catch {
    return {};
  }
}

export function saveMyTrip(tripId, data) {
  const trips = loadMyTrips();
  trips[tripId] = { ...trips[tripId], ...data };
  try {
    localStorage.setItem(MY_TRIPS, JSON.stringify(trips));
  } catch (error) {
    console.error(error);
  }
}

export function forgetMyTrip(tripId) {
  const trips = loadMyTrips();
  delete trips[tripId];
  localStorage.setItem(MY_TRIPS, JSON.stringify(trips));
}
