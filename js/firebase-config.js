// Firebaseコンソールの「ウェブアプリの設定」の値。公開されても問題ない値で、データは firestore.rules で守る。
// null にすると、この端末だけで動くお試しモードになる。
export const firebaseConfig = {
  apiKey: 'AIzaSyDASdQJF5Txc9_HUETK_-pr7zTymhXR5BI',
  authDomain: 'tabi-shiori-de4a4.firebaseapp.com',
  projectId: 'tabi-shiori-de4a4',
  storageBucket: 'tabi-shiori-de4a4.firebasestorage.app',
  messagingSenderId: '300989374123',
  appId: '1:300989374123:web:a00409382deaec8db1e1ee',
  measurementId: 'G-FBNWJGL875',
};

// App Check（Google Cloud Fraud Defense、旧reCAPTCHA Enterprise）のキーID。このサイト以外からの書き込みを防ぐ。
// reCAPTCHA v3 のキーはApp Checkに登録できなくなったため使わない。null のあいだは App Check を使わない。
export const appCheckSiteKey = '6Lc2vAwuAAAAANGlA2yVPYQfdLDXULIjQcZyJ5MV';
