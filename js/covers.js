// しおりの表紙イラスト。文字は app.js 側で重ねる。
const INK = '#4a3728';
const TERRA = '#c4673f';
const GREEN = '#4f6f52';
const PAPER = '#fbf6ea';
const SAND = '#e6d6b8';

const ticket = `
<svg viewBox="0 0 400 300" role="img" aria-label="切符とスタンプのイラスト" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <g transform="rotate(-8 200 150)">
      <path fill="${PAPER}" d="M70 90h260a12 12 0 0 1 12 12v26a22 22 0 0 0 0 44v26a12 12 0 0 1-12 12H70a12 12 0 0 1-12-12v-26a22 22 0 0 0 0-44v-26a12 12 0 0 1 12-12z"/>
      <path stroke-dasharray="4 9" d="M262 96v108"/>
      <path stroke="${TERRA}" d="M92 132h130M92 156h96M92 180h60"/>
      <circle cx="302" cy="150" r="20" fill="${SAND}"/>
      <path d="M294 150l6 7 11-14"/>
    </g>
    <g transform="translate(300 54)">
      <circle r="38" stroke="${GREEN}" stroke-dasharray="3 5"/>
      <circle r="27" stroke="${GREEN}"/>
      <path stroke="${GREEN}" d="M-14 8l14-22 14 22zM-5 8v-6h10v6"/>
    </g>
    <path stroke="${TERRA}" d="M42 42q18-12 36 0t36 0"/>
    <path stroke="${GREEN}" d="M40 262q20-14 40 0t40 0t40 0"/>
  </g>
</svg>`;

const suitcase = `
<svg viewBox="0 0 400 300" role="img" aria-label="スーツケースのイラスト" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="316" cy="70" r="30" fill="${SAND}"/>
    <path stroke="${GREEN}" d="M30 250c50-60 80-64 118-22 34-46 80-60 130-10 30-20 62-20 92 32"/>
    <path d="M168 92V66a12 12 0 0 1 12-12h40a12 12 0 0 1 12 12v26"/>
    <rect x="126" y="92" width="148" height="154" rx="16" fill="${PAPER}"/>
    <path stroke="${TERRA}" d="M162 92v154M238 92v154"/>
    <path d="M150 246v14M250 246v14"/>
    <circle cx="200" cy="146" r="17" fill="${SAND}"/>
    <path d="M200 132v28M186 146h28"/>
    <rect x="176" y="186" width="48" height="26" rx="4" stroke="${GREEN}"/>
    <path stroke="${GREEN}" d="M186 199h28"/>
    <path stroke="${TERRA}" d="M58 66q10-10 20 0q10-10 20 0"/>
    <path stroke="${TERRA}" d="M78 100q7-7 14 0q7-7 14 0"/>
  </g>
</svg>`;

const map = `
<svg viewBox="0 0 400 300" role="img" aria-label="地図とコンパスのイラスト" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path fill="${PAPER}" d="M64 66l90-22 92 22 90-22v190l-90 22-92-22-90 22z"/>
    <path d="M154 44v190M246 66v190"/>
    <path stroke="${GREEN}" d="M78 108q34 26 66 6M166 92q30 34 68 18M258 118q28-16 64 2"/>
    <path stroke="${TERRA}" stroke-dasharray="7 9" d="M92 214c28-48 62-46 96-36s66-2 86-54"/>
    <path stroke="${TERRA}" fill="${SAND}" d="M286 124c0-16-12-26-24-26s-24 10-24 26c0 18 24 40 24 40s24-22 24-40z" transform="translate(12 -30)"/>
    <circle cx="274" cy="92" r="7" fill="${PAPER}"/>
    <path stroke="${TERRA}" d="M82 214l20 0M92 204v20" transform="rotate(45 92 214)"/>
    <g transform="translate(330 232)">
      <circle r="34" fill="${SAND}"/>
      <path fill="${TERRA}" d="M0-24L8 0H-8z"/>
      <path fill="${PAPER}" d="M0 24L-8 0H8z"/>
    </g>
  </g>
</svg>`;

export const COVERS = {
  ticket: { label: '切符', svg: ticket },
  suitcase: { label: 'スーツケース', svg: suitcase },
  map: { label: '地図', svg: map },
};
