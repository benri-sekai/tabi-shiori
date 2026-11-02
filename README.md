# 旅のしおり帖

旅の計画、しおり作り、立て替えの精算を1つにまとめたWebアプリです。ビルド不要の素のHTML/CSS/JavaScriptで作り、GitHub Pagesで公開し、データはCloud Firestoreに保存します。

## 構成

- `index.html` / `style.css`: 画面の土台とデザイン
- `js/app.js`: 画面と操作
- `js/store.js`: データの読み書き（Firestore、未設定ならお試しモード）
- `js/settlement.js`: 精算の計算
- `js/covers.js`: しおりの表紙イラスト
- `js/firebase-config.js`: Firebaseの接続設定
- `firestore.rules`: データベースのアクセスルール（Firebaseコンソールに貼り付ける）
- `sw.js`: オフライン対応
- `tests/settlement.html`: 精算計算のテスト（ブラウザで開いて確認）
- `tools/make-images.swift`: アイコンと共有用画像の生成

## 更新するとき

`sw.js` の `VERSION` と、`?v=` の付いた読み込み（`sw.js`、`index.html`、`js/app.js`、`js/store.js`）をすべて同じ番号に上げてから公開します。`grep -rn "v=" index.html sw.js js` で漏れを確認できます。上げないと、利用者の端末に古い画面が残ります。

`firestore.rules` を変えたときは、Firebaseコンソールの Firestore Database → ルール に貼り直します。

URLに `?demo` を付けると、本番データに触れずにお試しモードで動きます。

## 注意

招待リンクを知っている人は、予約情報を含む旅の内容を読み書きできます。パスポート番号やカード番号は保存しないでください。
