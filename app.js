'use strict';

/* ---------- Konfiguracja domyślna (arkusz Ustawienia i Progi może ją nadpisać) ---------- */

const DOMYSLNE = {
  masa_kg: 95,
  pula_tydzien: 600,
  etap_kcal: 3850,
  cel_kcal: 38500,
  kompensacja: 0.3,
  mnoznik_po_pracy: 0.15,
  cel_kcal_dzien: 1820, // Mifflin-St Jeor dla 95 kg i 185 cm, siedząca praca, minus 500
  typy: {
    mikro:    { nazwa: 'Mikro-ruch', opis: '5-10 min', minuty: 8, met: 3.8, punkty: 50, bonus: 0, sila: 0.5 },
    spacer:   { nazwa: 'Spacer', opis: '30 min', minuty: 30, met: 3.5, punkty: 180, bonus: 0, sila: 0, dodatek: { minuty: 15, punkty: 90 } },
    dom:      { nazwa: 'Dom: zestaw', opis: 'ok. 12 min', minuty: 12, met: 3.8, punkty: 200, bonus: 0, sila: 1 },
    silownia: { nazwa: 'Siłownia', opis: 'z bonusem za dojazd', minuty: 45, met: 5.0, punkty: 250, bonus: 150, sila: 1 }
  },
  sciezki: [
    { id: 'pompki', nazwa: 'Pompki', opis: 'max w jednej serii', jednostka: 'powt.', start: 7, progi: [10, 15, 20, 25, 30], max: 200 },
    { id: 'przysiady', nazwa: 'Przysiady', opis: 'max bez obciążenia', jednostka: 'powt.', start: 20, progi: [25, 35, 50, 75], max: 500 },
    { id: 'deska_s', nazwa: 'Deska', opis: 'sekundy', jednostka: 's', start: null, progi: [30, 45, 60, 90, 120], max: 900 },
    { id: 'przysiad_sztanga_kg', nazwa: 'Przysiad ze sztangą', opis: 'ciężar, 1 powt.', jednostka: 'kg', start: null, progi: [47.5, 70, 95], max: 300 },
    { id: 'wyciskanie_kg', nazwa: 'Wyciskanie leżąc', opis: 'ciężar', jednostka: 'kg', start: null, progi: [37.5, 57.5, 75], max: 300 },
    { id: 'martwy_ciag_kg', nazwa: 'Martwy ciąg', opis: 'ciężar', jednostka: 'kg', start: null, progi: [57.5, 95, 120], max: 350 }
  ]
};
const KOLEJNOSC_TYPOW = ['mikro', 'spacer', 'dom', 'silownia'];
const POLA_TESTU = [
  { id: 'pompki', etykieta: 'Pompki, max' },
  { id: 'przysiady', etykieta: 'Przysiady, max' },
  { id: 'deska_s', etykieta: 'Deska, sekundy' },
  { id: 'pas_cm', etykieta: 'Obwód pasa, cm', min: 50, max: 200 },
  { id: 'przysiad_sztanga_kg', etykieta: 'Przysiad ze sztangą, kg', silownia: true },
  { id: 'wyciskanie_kg', etykieta: 'Wyciskanie leżąc, kg', silownia: true },
  { id: 'martwy_ciag_kg', etykieta: 'Martwy ciąg, kg', silownia: true }
];
const DNI_MIEDZY_TESTAMI = 30;
const KCAL_NA_KG = 7700;

/* ---------- Pomocnicze ---------- */

function czytajLS(k, dom) {
  try { const v = localStorage.getItem(k); return v == null ? dom : JSON.parse(v); } catch (e) { return dom; }
}
function zapiszLS(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* tryb prywatny albo brak miejsca */ }
}
const fmt = (n, miejsca = 0) => Number(n).toLocaleString('pl-PL', { minimumFractionDigits: miejsca, maximumFractionDigits: miejsca });
const fmtW = v => fmt(v, v % 1 ? 1 : 0);
const ddmm = d => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
const nowyId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const suma = (arr, pole) => arr.reduce((s, x) => s + (Number(x[pole]) || 0), 0);
function poczatekDnia(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function poczatekTygodnia(d) { const x = poczatekDnia(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function dodajDni(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const maWartosc = v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
// Twarda spacja po krótkich słowach, żeby "Na", "za", "w" nie zostawały same na końcu wiersza.
// Dwa przebiegi: jeden zjada spację po krótkim słowie, więc sąsiednie krótkie słowo ("kg za") łapie dopiero drugi.
// Liczba trzyma się następnego słowa ("0,5 kg", "40 dni").
const bezSierot = s => [1, 2].reduce(t => t.replace(/(^|[ \u00a0])(\S{1,2}) /g, '$1$2\u00a0'), s).replace(/(\d) (?=\S)/g, '$1\u00a0');
// Polska odmiana po liczebniku: 1 pompka, 2-4 i 22-24 pompki, 5-21 pompek.
const odmiana = (n, [jeden, kilka, wiele]) => n === 1 ? jeden : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? kilka : wiele;
const ruchOgraniczony = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Konfiguracja z arkusza ---------- */

function zbudujKonfig(ustawienia, progi) {
  const k = JSON.parse(JSON.stringify(DOMYSLNE));
  const u = ustawienia || {};
  const liczba = v => maWartosc(v) ? Number(v) : null;
  for (const pole of ['masa_kg', 'pula_tydzien', 'etap_kcal', 'cel_kcal', 'kompensacja', 'mnoznik_po_pracy', 'cel_kcal_dzien']) {
    if (liczba(u[pole]) != null) k[pole] = liczba(u[pole]);
  }
  for (const typ of KOLEJNOSC_TYPOW) {
    for (const pole of ['minuty', 'met', 'punkty', 'bonus']) {
      const v = liczba(u[typ + '_' + pole]);
      if (v != null) k.typy[typ][pole] = v;
    }
  }
  if (Array.isArray(progi) && progi.length) {
    for (const s of k.sciezki) {
      const wiersze = progi.filter(p => p.sciezka === s.id && liczba(p.wartosc) != null)
        .sort((a, b) => Number(a.kolejnosc) - Number(b.kolejnosc));
      if (wiersze.length) s.progi = wiersze.map(p => Number(p.wartosc));
    }
  }
  return k;
}

/* ---------- Liczenie wpisu ---------- */

// Liczone w procentach całkowitych: 50 × 1.15 w ułamkach daje 57,4999 i zaokrągla się do 57 zamiast 58.
const punktyZMnoznikiem = (pkt, mnoznik) => Math.round(pkt * Math.round(mnoznik * 100) / 100);

function punktyWpisu(baza, bonus, poPracy, udzialSily, k) {
  const mnoznik = poPracy ? 1 + k.mnoznik_po_pracy : 1;
  const punkty = punktyZMnoznikiem(baza + bonus, mnoznik);
  const sila = Math.round(punkty * udzialSily);
  return { mnoznik, punkty, punkty_sila: sila, punkty_wytrzymalosc: punkty - sila };
}

function policzWpis(typ, opcje, k) {
  const t = k.typy[typ];
  const plus = !!(opcje.plus && t.dodatek);
  const minuty = t.minuty + (plus ? t.dodatek.minuty : 0);
  const baza = t.punkty + (plus ? t.dodatek.punkty : 0);
  const bonus = t.bonus || 0;
  const godziny = minuty / 60;
  return Object.assign({
    id: nowyId(),
    ts: new Date().toISOString(),
    typ,
    minuty,
    po_pracy: !!opcje.poPracy,
    punkty_baza: baza,
    bonus_logistyka: bonus
  }, punktyWpisu(baza, bonus, !!opcje.poPracy, t.sila, k), {
    kcal_spalone: Math.round(t.met * k.masa_kg * godziny),
    kcal_do_paska: Math.round(Math.max(0, t.met - 1) * k.masa_kg * godziny * (1 - k.kompensacja)),
    cofniety: false
  });
}

/* ---------- Dane demo ---------- */

function daneDemo() {
  let ziarno = 7;
  const los = () => { ziarno = (ziarno * 16807) % 2147483647; return ziarno / 2147483647; };
  const k = zbudujKonfig({}, []);
  const wpisy = [];
  const dzis = poczatekDnia(new Date());
  for (let d = 34; d >= 1; d--) {
    const dzien = dodajDni(dzis, -d);
    const r = los();
    let typ = null;
    if (r < 0.18) typ = 'spacer';
    else if (r < 0.30) typ = 'dom';
    else if (r < 0.40) typ = 'silownia';
    else if (r < 0.48) typ = 'mikro';
    if (!typ) continue;
    const w = policzWpis(typ, { plus: typ === 'spacer' && los() < 0.4, poPracy: los() < 0.3 }, k);
    dzien.setHours(17 + Math.floor(los() * 4), Math.floor(los() * 60));
    w.ts = dzien.toISOString();
    wpisy.push(w);
  }
  const dataTestu = dodajDni(dzis, -27);
  // Posiłki z 20 dni: śniadanie, obiad, kolacja. Losowane po wpisach ruchu, żeby nie zmienić ich ciągu.
  const sniadania = [['Owsianka z bananem', 450], ['Kanapki z szynką i serem', 520], ['Jogurt grecki z miodem', 250]];
  const obiady = [['Schabowy z ziemniakami i surówką', 770, 'Schabowy panierowany 160 g, ziemniaki 200 g, surówka 150 g'], ['Makaron z kurczakiem', 680],
    ['Zupa pomidorowa z makaronem', 320], ['Kebab duży w bułce', 1150, 'Bułka 180 g, mięso 220 g, sosy 70 g, warzywa 130 g'], ['Sałatka z tuńczykiem', 410]];
  const kolacje = [['Kanapki z szynką i serem', 520], ['Pizza, 3 kawałki', 840, '3 kawałki pizzy 32 cm po ok. 110 g'], ['Sałatka z tuńczykiem', 410], ['Jajecznica z 3 jaj na maśle', 330]];
  const jedzenie = [];
  for (let d = 20; d >= 0; d--) {
    [[sniadania, 8], [obiady, 14], [kolacje, 19]].forEach(([lista, godz], i) => {
      if (d === 0 && i > 0) return; // dziś na razie tylko śniadanie
      const [opis, kcal, zalozenia] = lista[Math.floor(los() * lista.length)];
      const t = dodajDni(dzis, -d);
      t.setHours(godz, Math.floor(los() * 50));
      jedzenie.push({ id: `demo-p${d}-${i}`, ts: t.toISOString(), opis, kcal, zrodlo: zalozenia ? 'ai' : 'ja', zalozenia: zalozenia || '', usuniety: false });
    });
  }
  return {
    wpisy,
    testy: [{ id: 'demo-test', data: dataTestu.toISOString(), pompki: 7, przysiady: 20, deska_s: 35, pas_cm: 104,
      przysiad_sztanga_kg: null, wyciskanie_kg: null, martwy_ciag_kg: null, usuniety: false }],
    ustawienia: {},
    progi: [],
    jedzenie
  };
}

/* ---------- Magazyn: demo w pamięci telefonu albo Apps Script z kolejką ----------
   Operacje wysyłane do Apps Script (action):
   add {wpis} · undo {id} · restore {id} · update {id, zmiany}
   test {test} · delete_test {id} · restore_test {id}
   food_add {posilek} · food_update {id, zmiany} · food_delete {id} · food_restore {id}
   Posiłek bez kcal (albo zmiany.kcal = null) szacuje model po stronie skryptu; odpowiedź niesie wynik.  */

// Dane zapisane przed dodaniem jedzenia nie mają tej listy.
const uzupelnij = d => { if (d && !Array.isArray(d.jedzenie)) d.jedzenie = []; return d; };
const czekaNaSzacunek = op => (op.action === 'food_add' && !maWartosc(op.posilek.kcal)) ||
  (op.action === 'food_update' && 'kcal' in op.zmiany && !maWartosc(op.zmiany.kcal));

class Magazyn {
  constructor(api, klucz, wymusDemo) {
    this.api = api;
    this.klucz = klucz;
    this.demo = wymusDemo || !api || !klucz;
    this.ns = this.demo ? 'ruch.demo.' : 'ruch.';
    this.dane = uzupelnij(czytajLS(this.ns + 'dane', null));
    this.kolejka = this.demo ? [] : czytajLS(this.ns + 'kolejka', []);
    this.status = this.demo ? 'demo' : 'laczenie';
    this.wysylanie = false;
  }
  zapisz() { zapiszLS(this.ns + 'dane', this.dane); }
  async wczytaj() {
    if (this.demo) {
      if (!this.dane) { this.dane = daneDemo(); this.zapisz(); }
      return uzupelnij(this.dane);
    }
    try {
      const r = await fetch(this.api + '?action=load&key=' + encodeURIComponent(this.klucz));
      const j = await r.json();
      if (!j.ok) throw new Error(j.blad || 'Błąd serwera');
      this.dane = { wpisy: j.wpisy || [], testy: j.testy || [], ustawienia: j.ustawienia || {}, progi: j.progi || [], jedzenie: j.jedzenie || [] };
      for (const op of this.kolejka) this.zastosuj(op);
      this.zapisz();
      this.status = 'ok';
    } catch (e) {
      this.status = 'offline';
      this.ostatniBlad = String(e.message || e);
      if (!this.dane) this.dane = { wpisy: [], testy: [], ustawienia: {}, progi: [], jedzenie: [] };
    }
    this.wyslij();
    return this.dane;
  }
  zastosuj(op) {
    const d = this.dane;
    const wpis = () => d.wpisy.find(x => x.id === op.id);
    const test = () => d.testy.find(x => x.id === op.id);
    if (op.action === 'add' && !d.wpisy.some(w => w.id === op.wpis.id)) d.wpisy.push(op.wpis);
    if (op.action === 'undo' && wpis()) wpis().cofniety = true;
    if (op.action === 'restore' && wpis()) wpis().cofniety = false;
    if (op.action === 'update' && wpis()) Object.assign(wpis(), op.zmiany);
    if (op.action === 'test' && !d.testy.some(t => t.id === op.test.id)) d.testy.push(op.test);
    if (op.action === 'delete_test' && test()) test().usuniety = true;
    if (op.action === 'restore_test' && test()) test().usuniety = false;
    const posilek = () => d.jedzenie.find(x => x.id === op.id);
    if (op.action === 'food_add' && !d.jedzenie.some(p => p.id === op.posilek.id)) d.jedzenie.push(Object.assign({}, op.posilek));
    if (op.action === 'food_update' && posilek()) {
      Object.assign(posilek(), op.zmiany);
      if (czekaNaSzacunek(op)) Object.assign(posilek(), { kcal: null, zrodlo: 'czeka', zalozenia: '' });
    }
    if (op.action === 'food_delete' && posilek()) posilek().usuniety = true;
    if (op.action === 'food_restore' && posilek()) posilek().usuniety = false;
  }
  // Wynik szacunku z odpowiedzi skryptu (albo udawany w demo) trafia do posiłku na telefonie.
  przyjmijPosilek(p) {
    const x = this.dane.jedzenie.find(y => y.id === p.id);
    if (!x) return;
    const czekal = x.zrodlo === 'czeka';
    Object.assign(x, { kcal: p.kcal, zrodlo: p.zrodlo, zalozenia: p.zalozenia });
    this.zapisz();
    if (czekal) poSzacunku(x);
  }
  wykonaj(op) {
    this.zastosuj(op);
    this.zapisz();
    if (this.demo) {
      // W demo nie ma modelu: przykładowa liczba po chwili, żeby dało się przejść całą ścieżkę.
      if (czekaNaSzacunek(op)) {
        const id = op.action === 'food_add' ? op.posilek.id : op.id;
        setTimeout(() => this.przyjmijPosilek({ id, kcal: 500, zrodlo: 'ai', zalozenia: 'Tryb demo: liczba przykładowa, bez modelu AI.' }), 600);
      }
      return;
    }
    this.kolejka.push(op);
    zapiszLS(this.ns + 'kolejka', this.kolejka);
    this.wyslij();
  }
  async wyslij() {
    if (this.demo || this.wysylanie || !this.kolejka.length) { odswiezStatus(); return; }
    this.wysylanie = true;
    try {
      while (this.kolejka.length) {
        const op = this.kolejka[0];
        const r = await fetch(this.api, { method: 'POST', body: JSON.stringify(Object.assign({}, op, { key: this.klucz })) });
        const j = await r.json();
        if (!j.ok) throw new Error(j.blad || 'Błąd serwera');
        this.kolejka.shift();
        zapiszLS(this.ns + 'kolejka', this.kolejka);
        if (j.posilek) this.przyjmijPosilek(j.posilek);
      }
      this.status = 'ok';
    } catch (e) {
      this.status = 'offline';
      this.ostatniBlad = String(e.message || e);
    } finally {
      this.wysylanie = false;
      odswiezStatus();
    }
  }
}

/* ---------- Stan aplikacji ---------- */

const parametry = new URLSearchParams(location.search);
if (parametry.get('key')) zapiszLS('ruch.klucz', parametry.get('key'));
const magazyn = new Magazyn((window.APP_CONFIG || {}).api, czytajLS('ruch.klucz', ''), parametry.get('demo') === '1');

const stan = {
  ekran: 'start',
  spacerPlus: false,
  komunikatTestu: '',
  szkicTestu: {}, // wpisane, jeszcze niezapisane wartości testu
  szkicPosilku: {}, // to samo dla formularza posiłku
  edycjaPosilku: null, // id posiłku z otwartą poprawką w dzienniku
  ostatniKlik: null, // { typ, czas }: chroni przed przypadkowym podwójnym dotknięciem tego samego kafelka
  przekazanieEtapu: false // jeden render po zamknięciu etapu: zamknięty segment zwija się, nowy przejmuje miejsce
};
// Ostatnio pokazane wartości pasków i liczb: z nich startuje animacja przyrostu.
const pamiec = { szer: {}, licz: {} };
let K = DOMYSLNE;

function aktywne() { return magazyn.dane.wpisy.filter(w => !w.cofniety); }
function aktywneTesty() { return magazyn.dane.testy.filter(t => !t.usuniety).sort((a, b) => new Date(a.data) - new Date(b.data)); }

function najlepszy(sciezka) {
  let v = null;
  for (const t of aktywneTesty()) if (maWartosc(t[sciezka.id]) && (v == null || Number(t[sciezka.id]) > v)) v = Number(t[sciezka.id]);
  return { v: v != null ? v : sciezka.start, zTestu: v != null };
}
function ostatni(sciezka) {
  const t = aktywneTesty().reverse().find(t => maWartosc(t[sciezka.id]));
  return t ? Number(t[sciezka.id]) : sciezka.start;
}

function liczniki() {
  const a = aktywne();
  const pasek = suma(a, 'kcal_do_paska');
  const odTygodnia = poczatekTygodnia(new Date());
  const tydzien = a.filter(w => new Date(w.ts) >= odTygodnia);
  const odPoprzedniego = dodajDni(odTygodnia, -7);
  const poprzedni = a.filter(w => { const t = new Date(w.ts); return t >= odPoprzedniego && t < odTygodnia; });
  const etapow = Math.round(K.cel_kcal / K.etap_kcal);
  const zamkniete = Math.min(Math.floor(pasek / K.etap_kcal), etapow);
  const etapNr = Math.min(zamkniete + 1, etapow);
  const wEtapie = Math.min(pasek - (etapNr - 1) * K.etap_kcal, K.etap_kcal);
  const odDzis = poczatekDnia(new Date());
  const pasekPrzedDzis = suma(a.filter(w => new Date(w.ts) < odDzis), 'kcal_do_paska');
  return {
    pasek, etapNr, etapow, zamkniete, wEtapie,
    procentEtapu: Math.floor(100 * wEtapie / K.etap_kcal),
    zamknieteDzis: zamkniete - Math.min(Math.floor(pasekPrzedDzis / K.etap_kcal), etapow),
    ostatniTs: a.reduce((m, w) => (!m || new Date(w.ts) > new Date(m) ? w.ts : m), null),
    poprzedniPkt: suma(poprzedni, 'punkty'),
    tydzienPkt: suma(tydzien, 'punkty'),
    tydzienSila: suma(tydzien, 'punkty_sila'),
    tydzienWytrz: suma(tydzien, 'punkty_wytrzymalosc'),
    sila: suma(a, 'punkty_sila'),
    wytrz: suma(a, 'punkty_wytrzymalosc')
  };
}

/* ---------- Wykresy (SVG) ---------- */

function wykresNarastajacy() {
  const a = aktywne().slice().sort((x, y) => new Date(x.ts) - new Date(y.ts));
  if (!a.length) return '<p class="drobny pusty-wykres">Tu narysuje się twoja droga do celu. Wystarczy pierwszy wpis.</p>';
  const dzis = poczatekDnia(new Date());
  let start = poczatekDnia(new Date(a[0].ts));
  if ((dzis - start) / 864e5 < 13) start = dodajDni(dzis, -13);
  const dni = Math.round((dzis - start) / 864e5) + 1;
  const punkty = [];
  let narastajaco = 0, i = 0;
  for (let d = 0; d < dni; d++) {
    const koniec = dodajDni(start, d + 1);
    while (i < a.length && new Date(a[i].ts) < koniec) { narastajaco += Number(a[i].kcal_do_paska) || 0; i++; }
    punkty.push(narastajaco);
  }
  const W = 340, H = 112, L = 40, R = 6, T = 10, B = 20;
  const ymax = (Math.floor(narastajaco / K.etap_kcal) + 1) * K.etap_kcal;
  const x = d => L + (W - L - R) * (dni === 1 ? 1 : d / (dni - 1));
  const y = v => T + (H - T - B) * (1 - v / ymax);
  let linie = '';
  for (let e = 1; e * K.etap_kcal <= ymax; e++) {
    const yy = y(e * K.etap_kcal).toFixed(1);
    linie += `<line class="linia-etapu" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/>` +
      `<text x="${L - 6}" y="${Number(yy) + 4}" text-anchor="end">${fmtW(e * 0.5)} kg</text>`;
  }
  const sciezka = punkty.map((v, d) => (d ? 'L' : 'M') + x(d).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const pole = sciezka + ` L${x(dni - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Droga do celu od ${ddmm(start)}: ${fmt(narastajaco)} kcal">
    <g aria-hidden="true">
      <line class="os" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>
      <text x="${L - 6}" y="${y(0) + 4}" text-anchor="end">0</text>
      ${linie}
      <path class="pole-wykresu" d="${pole}"/>
      <path class="linia-wykresu" d="${sciezka}"/>
      <circle class="punkt-dzis" cx="${x(dni - 1).toFixed(1)}" cy="${y(narastajaco).toFixed(1)}" r="4"/>
      <text x="${L}" y="${H - 4}">${ddmm(start)}</text>
      <text x="${W - R}" y="${H - 4}" text-anchor="end">dziś</text>
    </g>
  </svg>`;
}

function wykresTygodni() {
  const a = aktywne();
  const teraz = poczatekTygodnia(new Date());
  const tygodnie = [3, 2, 1, 0].map(n => {
    const od = dodajDni(teraz, -7 * n), do_ = dodajDni(od, 7);
    const w = a.filter(x => { const t = new Date(x.ts); return t >= od && t < do_; });
    return { od, sila: suma(w, 'punkty_sila'), wytrz: suma(w, 'punkty_wytrzymalosc'), biezacy: n === 0 };
  });
  // Cztery puste kolumny pod linią puli wyglądają jak przerwana seria. Zamiast nich: co zostało.
  if (tygodnie.every(t => !(t.sila + t.wytrz))) {
    return a.length
      ? `<p class="pusty-wykres">Ostatnie 4 tygodnie bez wpisów. Od początku zebrane: <strong>${fmt(suma(a, 'punkty'))} pkt</strong>, nic z tego nie przepadło. Pierwszy wpis narysuje nowy słupek.</p>`
      : '<p class="drobny pusty-wykres">Tu staną słupki z ostatnich 4 tygodni.</p>';
  }
  const W = 340, H = 170, L = 4, R = 46, T = 18, B = 20; // prawy margines na etykietę puli
  const ymax = Math.max(K.pula_tydzien, ...tygodnie.map(t => t.sila + t.wytrz)) * 1.12;
  const y = v => T + (H - T - B) * (1 - v / ymax);
  const szer = (W - L - R) / 4;
  const slupek = szer * 0.56;
  let s = '';
  tygodnie.forEach((t, i) => {
    const x0 = L + i * szer + (szer - slupek) / 2;
    const hS = y(0) - y(t.sila), hW = y(0) - y(t.wytrz);
    s += `<rect x="${x0.toFixed(1)}" y="${(y(0) - hS).toFixed(1)}" width="${slupek.toFixed(1)}" height="${hS.toFixed(1)}" fill="var(--sila)" rx="2"/>`;
    s += `<rect x="${x0.toFixed(1)}" y="${(y(0) - hS - hW).toFixed(1)}" width="${slupek.toFixed(1)}" height="${hW.toFixed(1)}" fill="var(--wytrz)" rx="2"/>`;
    s += `<text x="${(x0 + slupek / 2).toFixed(1)}" y="${(y(0) - hS - hW - 5).toFixed(1)}" text-anchor="middle">${t.sila + t.wytrz ? fmt(t.sila + t.wytrz) : ''}</text>`;
    s += `<text x="${(x0 + slupek / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${t.biezacy ? 'ten tydzień' : 'od ' + ddmm(t.od)}</text>`;
  });
  const yp = y(K.pula_tydzien).toFixed(1);
  const opis = tygodnie.map(t => `${t.biezacy ? 'ten tydzień' : 'od ' + ddmm(t.od)}: ${fmt(t.sila + t.wytrz)}`).join(', ');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Punkty w ostatnich 4 tygodniach przy puli ${fmt(K.pula_tydzien)}: ${opis}">
    <g aria-hidden="true">
      <line class="os" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>
      ${s}
      <line class="linia-puli" x1="${L}" x2="${W - R}" y1="${yp}" y2="${yp}"/>
      <text x="${W - R + 4}" y="${Number(yp) - 2}">pula</text>
      <text x="${W - R + 4}" y="${Number(yp) + 11}">${fmt(K.pula_tydzien)}</text>
    </g>
  </svg>
  <div class="legenda"><span><i class="kropka-sila"></i>Siła</span><span><i class="kropka-wytrz"></i>Wytrzymałość</span></div>`;
}

/* ---------- Ekrany ---------- */

function zestawDomowy() {
  const s = id => K.sciezki.find(x => x.id === id);
  const deskaMax = ostatni(s('deska_s'));
  return {
    pompki: Math.max(1, Math.round(0.6 * ostatni(s('pompki')))),
    przysiady: Math.max(1, Math.round(0.6 * ostatni(s('przysiady')))),
    deska: deskaMax ? Math.max(10, Math.round(0.6 * deskaMax / 5) * 5) : 20
  };
}

function kafelkiHtml() {
  return KOLEJNOSC_TYPOW.map(typ => {
    const t = K.typy[typ];
    const plus = typ === 'spacer' && stan.spacerPlus;
    const pkt = t.punkty + (plus ? t.dodatek.punkty : 0) + (t.bonus || 0);
    const opis = typ === 'spacer' ? (t.minuty + (plus ? t.dodatek.minuty : 0)) + ' min' : t.opis;
    const rodzaj = t.sila === 1 ? 'sila' : t.sila === 0 ? 'wytrz' : 'obie';
    const rodzajTxt = { sila: 'Siła', wytrz: 'Wytrzymałość', obie: 'Siła i wytrzymałość' }[rodzaj];
    let opcja = '';
    if (typ === 'spacer') opcja = `<button type="button" class="kafelek-opcja" data-opcja="plus" aria-pressed="${stan.spacerPlus}">+15 min</button>`;
    if (typ === 'dom') opcja = `<button type="button" class="kafelek-opcja" data-opcja="zestaw" aria-haspopup="dialog" aria-label="Pokaż zestaw">Zestaw</button>`;
    return `<div class="kafelek kafelek-${rodzaj}">
      <button type="button" class="kafelek-zapis" data-typ="${typ}" aria-label="Zapisz: ${esc(t.nazwa)}, ${esc(opis)}, ${fmt(pkt)} punktów, ${rodzajTxt}">
        <span class="kafelek-nazwa">${esc(t.nazwa)}</span>
        <span class="kafelek-opis">${esc(opis)}</span>
        <span class="kafelek-punkty">+${fmt(pkt)} <small>pkt</small></span>
      </button>${opcja}</div>`;
  }).join('');
}

const szerokosc = (v, max) => Math.max(0, Math.min(100, 100 * v / max)).toFixed(2) + '%';

// Pasek celu z 10 segmentów. Zamknięte etapy zostają pełne, a bieżący jest szeroki,
// żeby dzienny przyrost było widać. Nic na tym pasku nie wraca do zera.
function torEtapow(l) {
  const koniec = l.zamkniete >= l.etapow;
  const przekazanie = stan.przekazanieEtapu && !koniec;
  let s = '';
  for (let i = 1; i <= l.etapow; i++) {
    if (i <= l.zamkniete) s += `<span class="etap-seg zamkniety${przekazanie && i === l.zamkniete ? ' zwija-sie' : ''}"></span>`;
    else if (i === l.etapNr) s += `<span class="etap-seg biezacy${przekazanie ? ' rozwija-sie' : ''}"><span class="wypelnienie" data-anim="etap" style="width:${szerokosc(l.wEtapie, K.etap_kcal)}"></span></span>`;
    else s += '<span class="etap-seg"></span>';
  }
  return `<div class="tor-etapy${koniec ? ' pelny' : ''}" role="progressbar" aria-label="Droga do celu" aria-valuemin="0" aria-valuemax="${K.cel_kcal}" aria-valuenow="${l.pasek}" aria-valuetext="Zamknięte etapy: ${l.zamkniete} z ${l.etapow}${koniec ? '' : `, bieżący etap: ${l.procentEtapu}%`}">${s}</div>`;
}

// Zdanie pod paskiem tygodnia na dołki: pusty start, poniedziałkowe zero, powrót po przerwie.
function notkaTygodnia(l) {
  const m = K.typy.mikro;
  const krok = `${m.nazwa}: +${fmt(m.punkty)} pkt`;
  if (!l.ostatniTs) return bezSierot(`Pierwszy wpis może być mały. ${krok}.`);
  const dniPrzerwy = Math.round((poczatekDnia(new Date()) - poczatekDnia(new Date(l.ostatniTs))) / 864e5);
  if (dniPrzerwy > 7) return bezSierot(`Ostatni ruch ${dniPrzerwy} dni temu. Nic nie przepadło: ${fmt(l.pasek)} kcal zostaje. Wystarczy ${krok}.`);
  return l.tydzienPkt === 0 ? bezSierot(`Na start wystarczy ${krok}.`) : '';
}

// Prawa strona nagłówka tygodnia. Wynik poprzedniego tygodnia tylko w poniedziałek, wtorek albo przy zerze,
// żeby w środku tygodnia porównanie nie zniechęcało. Stoi w nagłówku, a nie w osobnym zdaniu,
// bo każdy dodatkowy wiersz spycha kafelki pod pasek zakładek.
function etykietaTygodnia(l) {
  const poczatekTyg = (new Date().getDay() + 6) % 7 < 2; // poniedziałek albo wtorek
  if (l.poprzedniPkt > 0 && (poczatekTyg || l.tydzienPkt === 0)) return `poprzedni: ${fmt(l.poprzedniPkt)} pkt${l.poprzedniPkt >= K.pula_tydzien ? ', pula zrobiona' : ''}`;
  const ponad = l.tydzienPkt - K.pula_tydzien;
  return ponad > 0 ? '+' + fmt(ponad) + ' ponad pulę' : 'pula ' + fmt(K.pula_tydzien) + ' pkt';
}

function ekranStart() {
  const l = liczniki();
  const naPule = Math.max(K.pula_tydzien, l.tydzienPkt);
  const kg = l.pasek / KCAL_NA_KG;
  const koniec = l.zamkniete >= l.etapow;
  const notka = notkaTygodnia(l);
  // W dniu zamknięcia etapu zdanie "Dziś" zastępuje wiersz całej drogi (oba mówią o kilogramach),
  // żeby karta nie urosła i kafelki zostały nad paskiem zakładek.
  const dzisEtap = l.zamknieteDzis > 0 && !koniec;
  return `<div class="status" id="status"></div>
  <h1 class="tylko-czytnik">Start</h1>
  <section class="karta karta-cel" id="karta-cel" aria-labelledby="naglowek-cel">
    <div class="pasek-naglowek">
      <h2 class="naglowek-karty" id="naglowek-cel">${koniec ? 'Cel 5 kg osiągnięty' : `Etap ${l.etapNr} z ${l.etapow}`}</h2>
      <span class="procent" data-licz="procent" data-wartosc="${l.procentEtapu}" data-sufiks="%">${l.procentEtapu}%</span>
    </div>
    <p class="wiersz-liczby"><span class="liczba-duza" data-licz="etap" data-wartosc="${l.wEtapie}">${fmt(l.wEtapie)}</span> <span class="drobny">/ ${fmt(K.etap_kcal)} kcal do 0,5 kg</span></p>
    ${torEtapow(l)}
    ${dzisEtap ? `<p class="notka notka-ok">${bezSierot(`Dziś: etap ${l.zamkniete} zamknięty, ekwiwalent ${fmtW(l.zamkniete * 0.5)} kg za tobą.`)}</p>` : ''}
    <div class="wykres wykres-cel">${wykresNarastajacy()}</div>
    ${dzisEtap ? '' : `<p class="drobny">Cała droga do 5 kg: ${fmt(l.pasek)} z ${fmt(K.cel_kcal)} kcal${kg >= 0.1 ? `, ekwiwalent ok. ${fmt(kg, 1)} kg` : ''}</p>`}
  </section>
  <section class="karta" id="karta-tydzien" aria-labelledby="naglowek-tydzien">
    <div class="pasek-naglowek">
      <h2 class="naglowek-karty" id="naglowek-tydzien">Ten tydzień</h2>
      <span class="drobny" id="etykieta-tygodnia">${etykietaTygodnia(l)}</span>
    </div>
    <p class="wiersz-liczby"><span class="liczba-duza" data-licz="tydzien" data-wartosc="${l.tydzienPkt}">${fmt(l.tydzienPkt)}</span> <span class="drobny">/ ${fmt(K.pula_tydzien)} pkt</span></p>
    <div class="tor" role="progressbar" aria-label="Pula tygodnia" aria-valuemin="0" aria-valuemax="${K.pula_tydzien}" aria-valuenow="${l.tydzienPkt}">
      <span class="seg-sila" data-anim="tydz-sila" style="width:${szerokosc(l.tydzienSila, naPule)}"></span><span class="seg-wytrz" data-anim="tydz-wytrz" style="width:${szerokosc(l.tydzienWytrz, naPule)}"></span>
    </div>
    ${l.tydzienPkt ? `<div class="legenda"><span><i class="kropka-sila"></i>Siła ${fmt(l.tydzienSila)}</span><span><i class="kropka-wytrz"></i>Wytrzymałość ${fmt(l.tydzienWytrz)}</span></div>` : ''}
    ${notka ? `<p class="notka" id="notka-tygodnia">${notka}</p>` : ''}
  </section>
  <h2 class="tylko-czytnik">Zapisz ruch</h2>
  <div class="kafelki">${kafelkiHtml()}</div>
  <h2 class="sekcja">Ostatnie 4 tygodnie (punkty)</h2>
  <div class="karta wykres" id="wykres-tygodni">${wykresTygodni()}</div>`;
}

function ekranDrzewko() {
  const l = liczniki();
  const razem = l.sila + l.wytrz || 1;
  const karty = K.sciezki.map(s => {
    const { v, zTestu } = najlepszy(s);
    const zdobyte = s.progi.map(p => zTestu && v >= p);
    const nast = zdobyte.indexOf(false);
    let wezly = '';
    s.progi.forEach((p, i) => {
      if (i) wezly += `<span class="lacznik ${zdobyte[i] ? 'zdobyty' : ''}"></span>`;
      wezly += `<span class="prog ${zdobyte[i] ? 'zdobyty' : ''} ${i === nast && v != null ? 'nastepny' : ''}"><span class="prog-kropka"></span><span class="prog-wartosc">${fmtW(p)}</span></span>`;
    });
    let stanTxt;
    if (v == null) stanTxt = 'Do zmierzenia w teście';
    else {
      const wynik = zTestu ? `Wynik ${fmtW(v)} ${s.jednostka}` : `Start z planu: ${fmtW(v)} ${s.jednostka}`;
      stanTxt = nast === -1 ? `${wynik} · wszystkie progi zdobyte` : `${wynik} · do progu ${fmtW(s.progi[nast])} brakuje ${fmtW(s.progi[nast] - v)}`;
    }
    const zdobytych = zdobyte.filter(Boolean).length;
    return `<section class="karta" aria-label="${esc(s.nazwa)}: ${zdobytych} z ${s.progi.length} progów">
      <div class="sciezka-naglowek"><h3>${esc(s.nazwa)}</h3><span class="drobny">${esc(s.opis)}</span></div>
      <div class="progi" aria-hidden="true">${wezly}</div>
      <p class="drobny">${stanTxt}</p>
    </section>`;
  }).join('');
  return `<h1>Drzewko</h1>
  <section class="karta" aria-label="Indeksy">
    <div class="indeksy">
      <div><div class="indeks-nazwa">Siła</div><div class="liczba-duza kolor-sila">${fmt(l.sila)}</div></div>
      <div><div class="indeks-nazwa">Wytrzymałość</div><div class="liczba-duza kolor-wytrz">${fmt(l.wytrz)}</div></div>
    </div>
    <div class="tor" aria-hidden="true"><span class="seg-sila" style="width:${szerokosc(l.sila, razem)}"></span><span class="seg-wytrz" style="width:${szerokosc(l.wytrz, razem)}"></span></div>
    <p class="drobny">Punkty zebrane od początku. Siłę budują zestaw domowy i siłownia, wytrzymałość spacery.</p>
  </section>
  <h2 class="sekcja">Progi (wyniki z testu miesięcznego)</h2>
  ${karty}`;
}

function wykresPasa() {
  const t = aktywneTesty().filter(x => maWartosc(x.pas_cm));
  if (!t.length) return '<p class="drobny">Obwód pasa pojawi się po pierwszym pomiarze.</p>';
  if (t.length === 1) return `<p>Obwód pasa: <strong>${fmt(Number(t[0].pas_cm), 1)} cm</strong> <span class="drobny">(${ddmm(new Date(t[0].data))}, pierwszy pomiar)</span></p>`;
  const W = 340, H = 120, L = 36, R = 8, T = 10, B = 20;
  const v = t.map(x => Number(x.pas_cm));
  const mn = Math.floor(Math.min(...v) - 2), mx = Math.ceil(Math.max(...v) + 2);
  const x = i => L + (W - L - R) * i / (t.length - 1);
  const y = c => T + (H - T - B) * (1 - (c - mn) / (mx - mn));
  const d = v.map((c, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(c).toFixed(1)).join(' ');
  const kropki = v.map((c, i) => `<circle class="punkt-dzis" cx="${x(i).toFixed(1)}" cy="${y(c).toFixed(1)}" r="3"/><text x="${x(i).toFixed(1)}" y="${H - 4}" text-anchor="middle">${ddmm(new Date(t[i].data))}</text>`).join('');
  const zmiana = v[v.length - 1] - v[0];
  return `<p class="nad-wykresem">Obwód pasa: <strong>${fmt(v[v.length - 1], 1)} cm</strong> <span class="drobny">(${zmiana <= 0 ? '' : '+'}${fmt(zmiana, 1)} cm od pierwszego pomiaru)</span></p>
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Obwód pasa w kolejnych pomiarach: ${v.map(c => fmt(c, 1)).join(', ')} cm">
    <g aria-hidden="true">
      <text x="${L - 6}" y="${y(mx) + 4}" text-anchor="end">${mx}</text><text x="${L - 6}" y="${y(mn) + 4}" text-anchor="end">${mn}</text>
      <path class="linia-wykresu" d="${d}"/>${kropki}
    </g>
  </svg>`;
}

function listaTestow() {
  const t = aktywneTesty().reverse();
  if (!t.length) return '';
  const opis = test => POLA_TESTU.filter(p => maWartosc(test[p.id])).map(p => `${p.etykieta.split(',')[0]} ${fmtW(Number(test[p.id]))}`).join(' · ');
  return `<h2 class="sekcja">Zapisane testy</h2><div class="karta">${t.map(test => `
    <div class="wpis">
      <div class="wpis-opis"><strong>${ddmm(new Date(test.data))}</strong><br><span class="drobny">${esc(opis(test))}</span></div>
      <button type="button" class="przycisk-maly" data-usun-test="${esc(test.id)}">Usuń</button>
    </div>`).join('')}</div>`;
}

function ekranTest() {
  const t = aktywneTesty();
  const ost = t[t.length - 1];
  let kiedy = 'Pierwszy test: zmierz punkt startowy.';
  if (ost) {
    const nast = dodajDni(poczatekDnia(new Date(ost.data)), DNI_MIEDZY_TESTAMI);
    kiedy = nast > new Date()
      ? `Ostatni test: ${ddmm(new Date(ost.data))}. Następny od ${ddmm(nast)}.`
      : `Ostatni test: ${ddmm(new Date(ost.data))}. Czas na kolejny.`;
  }
  // type="text" zamiast "number": polska klawiatura iPhone'a wstawia przecinek, który pole liczbowe odrzuca.
  const pole = p => {
    const s = K.sciezki.find(x => x.id === p.id);
    const poprzedni = s ? ostatni(s) : (aktywneTesty().reverse().find(x => maWartosc(x[p.id])) || {})[p.id];
    // Ostatni wynik w etykiecie, nie w polu: jako placeholder wyglądał jak już wpisana wartość.
    const podpowiedz = maWartosc(poprzedni) ? ` <span class="ostatnio">·&nbsp;ostatnio&nbsp;${fmtW(Number(poprzedni))}</span>` : '';
    // Szkic ze stanu: przejście na inną zakładkę i powrót nie kasuje wpisanych wartości.
    return `<label class="pole"><span>${p.etykieta}${podpowiedz}</span><input type="text" inputmode="decimal" autocomplete="off" name="${p.id}" value="${esc(stan.szkicTestu[p.id] || '')}" aria-describedby="blad-${p.id}"><span class="pole-blad" id="blad-${p.id}"></span></label>`;
  };
  return `<h1>Test miesięczny</h1>
  <p class="drobny podtytul">${kiedy}</p>
  <form id="formularz-testu" class="karta" novalidate>
    <div class="pola">${POLA_TESTU.filter(p => !p.silownia).map(pole).join('')}</div>
    <h2 class="sekcja">Siłownia, jeśli robisz</h2>
    <div class="pola">${POLA_TESTU.filter(p => p.silownia).map(pole).join('')}</div>
    <button class="przycisk" type="submit">Zapisz test</button>
    <div id="komunikat-testu" class="komunikat" role="status" ${stan.komunikatTestu ? '' : 'hidden'}>${esc(stan.komunikatTestu)}${stan.komunikatTestu ? ' <button type="button" class="link" data-przejdz="drzewko">Zobacz Drzewko</button>' : ''}</div>
  </form>
  <h2 class="sekcja">Efekt</h2>
  <div class="karta wykres">${wykresPasa()}</div>
  ${listaTestow()}`;
}

const NAZWA_TYPU = typ => (K.typy[typ] || { nazwa: typ }).nazwa;

function nazwaDnia(t) {
  if (t === poczatekDnia(new Date()).getTime()) return 'Dziś';
  if (t === poczatekDnia(dodajDni(new Date(), -1)).getTime()) return 'Wczoraj';
  return new Date(t).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function ekranHistoria() {
  const wpisy = magazyn.dane.wpisy.slice().sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 120);
  if (!wpisy.length) return '<h1>Historia</h1><p class="drobny">Na razie pusto. Pierwszy wpis zrobisz kafelkiem na ekranie Start.</p>';
  const grupy = new Map();
  for (const w of wpisy) {
    const d = poczatekDnia(new Date(w.ts)).getTime();
    if (!grupy.has(d)) grupy.set(d, []);
    grupy.get(d).push(w);
  }
  let html = '<h1>Historia</h1>';
  for (const [t, lista] of grupy) {
    html += `<section class="dzien"><h2 class="sekcja">${nazwaDnia(t)}</h2><div class="karta">`;
    for (const w of lista) {
      const czas = new Date(w.ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
      html += `<div class="wpis ${w.cofniety ? 'cofniety' : ''}">
        <div class="wpis-opis"><strong>${esc(NAZWA_TYPU(w.typ))}</strong> ${w.minuty} min${w.po_pracy ? ', po pracy' : ''}<br>
        <span class="drobny">${czas} · +${fmt(w.punkty)} pkt · ${fmt(w.kcal_do_paska)} kcal do celu${w.cofniety ? ' · cofnięty' : ''}</span></div>
        ${w.cofniety
          ? `<button type="button" class="przycisk-maly" data-przywroc="${esc(w.id)}">Przywróć</button>`
          : `<button type="button" class="przycisk-maly" data-cofnij="${esc(w.id)}">Cofnij</button>`}
      </div>`;
    }
    html += '</div></section>';
  }
  return html;
}

/* ---------- Jedzenie: dziennik i średnia z 7 dni ----------
   Bez dziennego limitu, który codziennie wraca do zera. Średnia liczy się z pełnych dni (bez dzisiaj)
   i tylko z dni z wpisami: zapomniany dzień nie udaje głodówki, a jeden obfity przesuwa ją o 1/7. */

function aktywneJedzenie() { return magazyn.dane.jedzenie.filter(p => !p.usuniety); }
const skrot = s => s.length > 40 ? s.slice(0, 38).trimEnd() + '…' : s;
const czasWpisu = ts => new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

function sumyDni() {
  const m = new Map();
  for (const p of aktywneJedzenie()) {
    if (!maWartosc(p.kcal)) continue;
    const d = poczatekDnia(new Date(p.ts)).getTime();
    m.set(d, (m.get(d) || 0) + Number(p.kcal));
  }
  return m;
}
function sumaDzis() { return sumyDni().get(poczatekDnia(new Date()).getTime()) || 0; }

// Średnia z dni z wpisami w oknie 7 dni kończącym się w dniu `koniec`.
function sredniaOkna(sumy, koniec) {
  let s = 0, n = 0;
  for (let i = 0; i < 7; i++) {
    const v = sumy.get(dodajDni(koniec, -i).getTime());
    if (v != null) { s += v; n++; }
  }
  return n ? { srednia: Math.round(s / n), dni: n } : null;
}

function wykresSredniej(sumy) {
  const wczoraj = dodajDni(poczatekDnia(new Date()), -1);
  const DNI = 28;
  const pkt = [];
  for (let d = 0; d < DNI; d++) { const s = sredniaOkna(sumy, dodajDni(wczoraj, d - DNI + 1)); pkt.push(s ? s.srednia : null); }
  const znane = pkt.filter(v => v != null);
  if (znane.length < 2) return '';
  const W = 340, H = 112, L = 40, R = 54, T = 10, B = 20; // prawy margines na etykietę celu obok kropki
  const cel = K.cel_kcal_dzien;
  const ymax = Math.ceil(Math.max(cel, ...znane) * 1.15 / 500) * 500;
  const x = d => L + (W - L - R) * d / (DNI - 1);
  const y = v => T + (H - T - B) * (1 - v / ymax);
  let linie = '';
  const krok = ymax > 3500 ? 2000 : 1000;
  for (let v = krok; v < ymax; v += krok) linie += `<text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`;
  let sciezka = '', poprzedni = false;
  pkt.forEach((v, d) => { if (v == null) { poprzedni = false; return; } sciezka += (poprzedni ? 'L' : 'M') + x(d).toFixed(1) + ' ' + y(v).toFixed(1) + ' '; poprzedni = true; });
  const ost = pkt.length - 1 - pkt.slice().reverse().findIndex(v => v != null);
  const yc = y(cel).toFixed(1);
  const start = dodajDni(wczoraj, -DNI + 1);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Średnia z 7 dni od ${ddmm(start)} do wczoraj, ostatnio ${fmt(pkt[ost])} kcal, cel ${fmt(cel)} kcal">
    <g aria-hidden="true">
      <line class="os" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>
      <text x="${L - 6}" y="${y(0) + 4}" text-anchor="end">0</text>
      ${linie}
      <line class="linia-puli" x1="${L}" x2="${W - R}" y1="${yc}" y2="${yc}"/>
      <text x="${W - R + 10}" y="${Number(yc) - 2}">cel</text>
      <text x="${W - R + 10}" y="${Number(yc) + 11}">${fmt(cel)}</text>
      <path class="linia-wykresu" d="${sciezka.trim()}"/>
      <circle class="punkt-dzis" cx="${x(ost).toFixed(1)}" cy="${y(pkt[ost]).toFixed(1)}" r="4"/>
      <text x="${L}" y="${H - 4}">${ddmm(start)}</text>
      <text x="${W - R}" y="${H - 4}" text-anchor="end">wczoraj</text>
    </g>
  </svg>`;
}

function kartaSredniejHtml() {
  const sumy = sumyDni();
  const sr = sredniaOkna(sumy, dodajDni(poczatekDnia(new Date()), -1));
  const cel = K.cel_kcal_dzien;
  let tresc;
  if (!sr) tresc = `<p class="drobny">${bezSierot('Średnia liczy się z pełnych dni, więc pierwsza pojawi się dzień po pierwszym wpisie.')}</p>`;
  else {
    const r = sr.srednia - cel;
    const roznica = Math.abs(r) < 10 ? 'równo z celem' : `${fmt(Math.abs(r))} kcal ${r > 0 ? 'powyżej' : 'poniżej'} celu`;
    const zIlu = sr.dni === 7 ? 'z 7 dni' : `z ${sr.dni} ${odmiana(sr.dni, ['dnia', 'dni', 'dni'])} z wpisami`;
    const wykres = wykresSredniej(sumy);
    tresc = `<p class="wiersz-liczby"><span class="liczba-duza" id="srednia-7">${fmt(sr.srednia)}</span> <span class="drobny">kcal dziennie</span></p>
    <p class="drobny" id="srednia-opis">${roznica} · ${zIlu}, bez dzisiaj</p>
    ${wykres ? `<div class="wykres wykres-cel">${wykres}</div>` : ''}`;
  }
  return `<section class="karta" id="karta-srednia" aria-labelledby="naglowek-srednia">
    <div class="pasek-naglowek"><h2 class="naglowek-karty" id="naglowek-srednia">Średnia z 7 dni</h2><span class="drobny">cel ${fmt(cel)} kcal</span></div>
    ${tresc}
  </section>`;
}

// Ostatnie różne posiłki do zapisania jednym dotknięciem, bez ponownego szacowania.
function ostatniePosilki() {
  const widziane = new Set(), wynik = [];
  for (const p of aktywneJedzenie().slice().sort((a, b) => new Date(b.ts) - new Date(a.ts))) {
    const k = p.opis.trim().toLowerCase();
    if (!maWartosc(p.kcal) || widziane.has(k)) continue;
    widziane.add(k);
    wynik.push(p);
    if (wynik.length === 6) break;
  }
  return wynik;
}

function ostatnieHtml() {
  const lista = ostatniePosilki();
  return `<div id="ostatnie-posilki">${lista.length ? `<h2 class="sekcja">Jeszcze raz, jednym dotknięciem</h2><div class="szybkie">${lista.map(p => `
    <button type="button" class="szybki" data-powtorz="${esc(p.id)}" aria-label="Zapisz jeszcze raz: ${esc(p.opis)}, ${fmt(p.kcal)} kcal">
      <span class="szybki-opis">${bezSierot(esc(p.opis))}</span><span class="szybki-kcal">${p.zrodlo === 'ai' ? 'ok. ' : ''}${fmt(p.kcal)} kcal</span>
    </button>`).join('')}</div>` : ''}</div>`;
}

function kcalPosilku(p) {
  if (p.zrodlo === 'czeka') return magazyn.status === 'offline' ? 'kcal po połączeniu' : 'liczę kcal…';
  if (!maWartosc(p.kcal)) return 'bez kcal';
  return (p.zrodlo === 'ai' ? 'ok. ' : '') + fmt(p.kcal) + ' kcal';
}

function wierszPosilku(p) {
  if (stan.edycjaPosilku === p.id) {
    return `<form class="wpis popraw" data-popraw-posilek="${esc(p.id)}" novalidate>
      <div class="wpis-opis"><strong>${bezSierot(esc(p.opis))}</strong><br><span class="drobny">${czasWpisu(p.ts)} · ${kcalPosilku(p)}</span></div>
      <div class="popraw-wiersz">
        <label class="pole-kcal"><span class="tylko-czytnik">Kcal: ${esc(p.opis)}</span><input type="text" inputmode="numeric" autocomplete="off" name="kcal" value="${maWartosc(p.kcal) ? esc(p.kcal) : ''}" aria-describedby="blad-popraw"></label>
        <span class="drobny">kcal</span>
        <button type="submit" class="przycisk-maly glowny">Zapisz</button>
      </div>
      <span class="pole-blad" id="blad-popraw"></span>
      <div class="popraw-wiersz">
        ${p.zrodlo === 'ai' || p.zrodlo === 'blad' ? '<button type="button" class="przycisk-maly" data-przelicz>Policz ponownie</button>' : ''}
        <button type="button" class="przycisk-maly" data-usun-posilek>Usuń</button>
        <button type="button" class="przycisk-maly" data-anuluj-edycje>Anuluj</button>
      </div>
    </form>`;
  }
  const dopisek = p.zalozenia && (p.zrodlo === 'ai' || p.zrodlo === 'blad') ? `<br><span class="drobny zalozenia">${esc(p.zalozenia)}</span>` : '';
  return `<div class="wpis">
    <div class="wpis-opis"><strong>${bezSierot(esc(p.opis))}</strong><br><span class="drobny">${czasWpisu(p.ts)} · ${kcalPosilku(p)}</span>${dopisek}</div>
    <button type="button" class="przycisk-maly" data-zmien-posilek="${esc(p.id)}" aria-label="Zmień: ${esc(p.opis)}">Zmień</button>
  </div>`;
}

// Dziennik z ostatnich 7 dni. Suma dnia stoi bez porównania z celem: cel dotyczy średniej.
function dziennikHtml() {
  const dzis = poczatekDnia(new Date());
  const od = dodajDni(dzis, -6);
  const grupy = new Map([[dzis.getTime(), []]]);
  aktywneJedzenie().filter(p => new Date(p.ts) >= od).sort((a, b) => new Date(b.ts) - new Date(a.ts)).forEach(p => {
    const d = poczatekDnia(new Date(p.ts)).getTime();
    if (!grupy.has(d)) grupy.set(d, []);
    grupy.get(d).push(p);
  });
  const sumy = sumyDni();
  let html = '';
  for (const [t, lista] of grupy) {
    const suma = sumy.get(t) || 0;
    html += `<section class="dzien"><h2 class="sekcja">${nazwaDnia(t)}${suma ? ` · ${fmt(suma)} kcal` : ''}</h2><div class="karta">${lista.length ? lista.map(wierszPosilku).join('') : '<p class="drobny">Na razie pusto.</p>'}</div></section>`;
  }
  return `<div id="dziennik">${html}</div>`;
}

function ekranJedzenie() {
  // type="text" przy kcal z tego samego powodu co w teście: polska klawiatura iPhone'a.
  return `<div class="status" id="status"></div>
  <h1>Jedzenie</h1>
  ${kartaSredniejHtml()}
  <form id="formularz-posilku" class="karta formularz-posilku" novalidate>
    <div class="pola pola-posilek">
      <label class="pole"><span>Posiłek</span><input type="text" name="opis" autocomplete="off" enterkeyhint="done" maxlength="200" placeholder="np. schabowy, frytki" value="${esc(stan.szkicPosilku.opis || '')}" aria-describedby="blad-opis podpowiedz-posilku"><span class="pole-blad" id="blad-opis"></span></label>
      <label class="pole"><span>kcal</span><input type="text" inputmode="numeric" name="kcal" autocomplete="off" value="${esc(stan.szkicPosilku.kcal || '')}" aria-describedby="blad-kcal podpowiedz-posilku"><span class="pole-blad" id="blad-kcal"></span></label>
    </div>
    <p class="drobny" id="podpowiedz-posilku">${bezSierot('Bez kcal policzy je model AI. Z gramami będzie dokładniej.')}</p>
    <button class="przycisk" type="submit">Zapisz posiłek</button>
  </form>
  ${ostatnieHtml()}
  ${dziennikHtml()}`;
}

// Gdy szacunek przychodzi w trakcie pisania, formularz zostaje nietknięty (fokus, kursor, wpisany tekst).
function odswiezJedzenie() {
  if (stan.ekran !== 'jedzenie') return;
  const wymien = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.outerHTML = html;
  };
  wymien('karta-srednia', kartaSredniejHtml());
  wymien('ostatnie-posilki', ostatnieHtml());
  const dz = document.getElementById('dziennik');
  if (dz && !dz.contains(document.activeElement)) wymien('dziennik', dziennikHtml());
}

/* ---------- Renderowanie, animacja przyrostu ---------- */

const widok = document.getElementById('widok');

function renderuj(animuj = false) {
  const ekrany = { start: ekranStart, jedzenie: ekranJedzenie, drzewko: ekranDrzewko, test: ekranTest, historia: ekranHistoria };
  widok.innerHTML = ekrany[stan.ekran]();
  document.querySelectorAll('.zakladki button').forEach(b => {
    const aktywna = b.dataset.ekran === stan.ekran;
    b.classList.toggle('aktywna', aktywna);
    if (aktywna) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  ozyw(animuj);
  odswiezStatus();
}

// Paski i liczby startują od ostatnio pokazanej wartości i dochodzą do nowej.
// Ekran rysuje się od nowa, więc bez tego przyrost byłby niewidoczny.
function ozyw(animuj) {
  const plynnie = animuj && !ruchOgraniczony();
  widok.querySelectorAll('[data-anim]').forEach(el => {
    const k = el.dataset.anim, cel = el.style.width, poprz = pamiec.szer[k];
    pamiec.szer[k] = cel;
    if (!plynnie || poprz == null || poprz === cel || parseFloat(poprz) > parseFloat(cel)) return;
    el.style.transition = 'none';
    el.style.width = poprz;
    void el.offsetWidth;
    el.style.transition = '';
    el.style.width = cel;
  });
  widok.querySelectorAll('[data-licz]').forEach(el => {
    const k = el.dataset.licz, cel = Number(el.dataset.wartosc), poprz = pamiec.licz[k];
    const sufiks = el.dataset.sufiks || '';
    pamiec.licz[k] = cel;
    if (!plynnie || poprz == null || poprz >= cel) return;
    const t0 = performance.now(), czas = 700;
    el.textContent = fmt(poprz) + sufiks;
    const krok = t => {
      const p = Math.min(1, (t - t0) / czas);
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = fmt(Math.round(poprz + (cel - poprz) * e)) + sufiks;
      if (p < 1) requestAnimationFrame(krok);
    };
    requestAnimationFrame(krok);
  });
}

function swietuj(karty) {
  for (const id of [].concat(karty)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.classList.remove('swieto');
    void el.offsetWidth;
    el.classList.add('swieto');
  }
}

let ostatniStatus = null;
function odswiezStatus() {
  // Wysyłka pada albo wraca już po narysowaniu ekranu: "liczę kcal…" musi wtedy przejść w "kcal po połączeniu" i z powrotem.
  if (magazyn.status !== ostatniStatus) {
    const bylo = ostatniStatus;
    ostatniStatus = magazyn.status;
    if (bylo !== null && magazyn.dane && magazyn.dane.jedzenie.some(p => p.zrodlo === 'czeka')) odswiezJedzenie();
  }
  const el = document.getElementById('status');
  if (!el) return;
  const n = magazyn.kolejka.length;
  if (magazyn.status === 'demo') el.textContent = 'Tryb demo: dane testowe tylko na tym telefonie';
  else if (magazyn.status === 'offline') el.textContent = n ? `Brak połączenia z arkuszem. Do wysłania: ${n}` : 'Brak połączenia z arkuszem';
  else if (n) el.textContent = `Wysyłanie: ${n}`;
  else el.textContent = '';
}

/* ---------- Komunikat na dole z akcjami ---------- */

const toast = { el: document.getElementById('toast'), timer: null, akcje: [], czas: 0, wstrzymany: false };

function pokazToast({ tytul, opis = '', akcje = [], swieto = false }) {
  toast.akcje = akcje;
  document.getElementById('toast-tytul').textContent = tytul;
  const o = document.getElementById('toast-opis');
  o.textContent = opis;
  o.hidden = !opis;
  document.getElementById('toast-akcje').innerHTML = akcje
    .map((a, i) => `<button type="button" data-akcja="${i}" class="${a.glowna ? 'glowna' : ''}${a.cicha ? 'cicha' : ''}">${esc(a.etykieta)}</button>`).join('');
  toast.el.classList.toggle('toast-swieto', swieto);
  toast.el.hidden = false;
  toast.czas = akcje.length ? 8000 : 3500;
  clearTimeout(toast.timer);
  // Palec, kursor albo fokus na komunikacie zatrzymują zegar (także gdy nowy komunikat zastąpił stary pod palcem).
  toast.wstrzymany = toast.el.matches(':hover') || toast.el.contains(document.activeElement);
  if (!toast.wstrzymany) toast.timer = setTimeout(schowajToast, toast.czas);
}
function schowajToast() { toast.el.hidden = true; toast.akcje = []; toast.wstrzymany = false; clearTimeout(toast.timer); }
function wstrzymajToast() { if (toast.el.hidden) return; toast.wstrzymany = true; clearTimeout(toast.timer); }
// Po zdjęciu palca zostaje połowa czasu, żeby komunikat nie znikał w pół czytania.
function wznowToast() {
  if (toast.el.hidden || !toast.wstrzymany) return;
  toast.wstrzymany = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(schowajToast, toast.czas / 2);
}
toast.el.addEventListener('pointerenter', wstrzymajToast);
toast.el.addEventListener('pointerleave', wznowToast);
toast.el.addEventListener('focusin', wstrzymajToast);
toast.el.addEventListener('focusout', e => { if (!toast.el.contains(e.relatedTarget)) wznowToast(); });

/* ---------- Akcje na wpisach ---------- */

function opisZmiany(przed, po, wpis) {
  const nazwa = NAZWA_TYPU(wpis.typ);
  const zysk = `${nazwa}: +${fmt(wpis.punkty)} pkt, +${fmt(wpis.kcal_do_paska)} kcal do celu`;
  const etap = po.zamkniete > przed.zamkniete;
  const pula = przed.tydzienPkt < K.pula_tydzien && po.tydzienPkt >= K.pula_tydzien;
  if (etap && pula) {
    return { tytul: `Etap ${po.zamkniete} zamknięty, pula tygodnia zrobiona`, opis: `Ekwiwalent ${fmtW(po.zamkniete * 0.5)} kg za tobą · tydzień: ${fmt(po.tydzienPkt)} / ${fmt(K.pula_tydzien)} pkt`, swieto: ['karta-cel', 'karta-tydzien'], etap };
  }
  if (etap) {
    return { tytul: `Etap ${po.zamkniete} zamknięty`, opis: `Ekwiwalent ${fmtW(po.zamkniete * 0.5)} kg za tobą. ${zysk}`, swieto: 'karta-cel', etap };
  }
  if (pula) {
    return { tytul: 'Pula tygodnia zrobiona', opis: `${fmt(po.tydzienPkt)} / ${fmt(K.pula_tydzien)} pkt. ${zysk}`, swieto: 'karta-tydzien' };
  }
  return { tytul: `${nazwa} · +${fmt(wpis.punkty)} pkt`, opis: `+${fmt(wpis.kcal_do_paska)} kcal do celu · etap ${po.etapNr}: ${po.procentEtapu}%`, swieto: null };
}

// Po modyfikatorze pierwsza akcja odwraca tylko ten modyfikator. "Cofnij wpis" jest zawsze ostatni
// i cichy, żeby kciuk nie trafiał w niego po każdym zapisie.
function akcjeWpisu(wpis, odwrocenie) {
  const akcje = odwrocenie ? [odwrocenie] : [];
  const proc = `+${fmt(K.mnoznik_po_pracy * 100)}%`;
  if (!wpis.po_pracy) akcje.push({ etykieta: `Po pracy ${proc}`, wykonaj: () => oznaczPoPracy(wpis.id, true) });
  if (!odwrocenie && poczatekDnia(new Date(wpis.ts)).getTime() === poczatekDnia(new Date()).getTime()) akcje.push({ etykieta: 'Wczoraj', wykonaj: () => przeniesNaWczoraj(wpis.id, -1) });
  akcje.push({ etykieta: 'Cofnij wpis', cicha: true, wykonaj: () => cofnij(wpis.id) });
  return akcje;
}

function zmienWpis(id, zmiany) {
  const przed = liczniki();
  magazyn.wykonaj({ action: 'update', id, zmiany });
  const po = liczniki();
  return { przed, po, wpis: magazyn.dane.wpisy.find(x => x.id === id) };
}

function zapiszRuch(typ) {
  const teraz = Date.now();
  if (stan.ostatniKlik && stan.ostatniKlik.typ === typ && teraz - stan.ostatniKlik.czas < 800) return;
  stan.ostatniKlik = { typ, czas: teraz };
  const przed = liczniki();
  const wpis = policzWpis(typ, { plus: typ === 'spacer' && stan.spacerPlus }, K);
  magazyn.wykonaj({ action: 'add', wpis });
  stan.spacerPlus = false;
  const po = liczniki();
  const zmiana = opisZmiany(przed, po, wpis);
  if (zmiana.etap) { pamiec.szer.etap = null; pamiec.licz.etap = null; pamiec.licz.procent = null; }
  stan.przekazanieEtapu = !!zmiana.etap;
  renderuj(true);
  stan.przekazanieEtapu = false;
  if (zmiana.swieto) swietuj(zmiana.swieto);
  pokazToast({ tytul: zmiana.tytul, opis: zmiana.opis, akcje: akcjeWpisu(wpis), swieto: !!zmiana.swieto });
}

// wlacz = true dolicza mnożnik, false go zdejmuje (odwrócenie samego "Po pracy", wpis zostaje).
function oznaczPoPracy(id, wlacz) {
  const w = magazyn.dane.wpisy.find(x => x.id === id);
  if (!w || w.cofniety || !!w.po_pracy === wlacz) return;
  const t = K.typy[w.typ];
  const proc = `+${fmt(K.mnoznik_po_pracy * 100)}%`;
  const { przed, po, wpis } = zmienWpis(id, Object.assign({ po_pracy: wlacz }, punktyWpisu(w.punkty_baza, w.bonus_logistyka, wlacz, t.sila, K)));
  if (!wlacz) {
    renderuj();
    pokazToast({ tytul: `${NAZWA_TYPU(w.typ)} bez ${proc} · +${fmt(wpis.punkty)} pkt`, opis: 'Wpis zostaje, zdjęty tylko dodatek za porę.', akcje: akcjeWpisu(wpis) });
    return;
  }
  const zmiana = opisZmiany(przed, po, wpis);
  renderuj(true);
  if (zmiana.swieto) swietuj(zmiana.swieto);
  pokazToast({
    tytul: zmiana.swieto ? zmiana.tytul : `${NAZWA_TYPU(w.typ)} po pracy · +${fmt(wpis.punkty)} pkt`, opis: zmiana.opis, swieto: !!zmiana.swieto,
    akcje: akcjeWpisu(wpis, { etykieta: `Bez ${proc}`, wykonaj: () => oznaczPoPracy(id, false) })
  });
}

// dni = -1 przenosi na wczoraj, +1 odwraca to przeniesienie.
function przeniesNaWczoraj(id, dni) {
  const w = magazyn.dane.wpisy.find(x => x.id === id);
  if (!w || w.cofniety) return;
  const { przed, po, wpis } = zmienWpis(id, { ts: dodajDni(new Date(w.ts), dni).toISOString() });
  renderuj();
  // W poniedziałek wczoraj to poprzedni tydzień: pula spada i trzeba powiedzieć dlaczego.
  const opis = po.tydzienPkt !== przed.tydzienPkt
    ? `${dni < 0 ? 'Wczoraj to poprzedni tydzień' : 'Wraca do tego tygodnia'}: ten tydzień ${fmt(po.tydzienPkt)} / ${fmt(K.pula_tydzien)} pkt.`
    : 'Punkty i kcal bez zmian, zmienia się tylko dzień.';
  pokazToast({
    tytul: dni < 0 ? `${NAZWA_TYPU(w.typ)} przeniesiony na wczoraj` : `${NAZWA_TYPU(w.typ)} z powrotem na dziś`, opis: bezSierot(opis),
    akcje: akcjeWpisu(wpis, dni < 0 ? { etykieta: 'Jednak dziś', wykonaj: () => przeniesNaWczoraj(id, 1) } : null)
  });
}

function cofnij(id) {
  const w = magazyn.dane.wpisy.find(x => x.id === id);
  if (!w || w.cofniety) return;
  stan.ostatniKlik = null;
  magazyn.wykonaj({ action: 'undo', id });
  renderuj();
  pokazToast({ tytul: `Cofnięto: ${NAZWA_TYPU(w.typ)}`, akcje: [{ etykieta: 'Przywróć', glowna: true, wykonaj: () => przywroc(id) }] });
}

function przywroc(id) {
  const w = magazyn.dane.wpisy.find(x => x.id === id);
  if (!w || !w.cofniety) return;
  magazyn.wykonaj({ action: 'restore', id });
  renderuj(true);
  pokazToast({ tytul: `Przywrócono: ${NAZWA_TYPU(w.typ)}` });
}

/* ---------- Zestaw domowy (panel od dołu) ---------- */

function otworzZestaw() {
  const z = zestawDomowy();
  const t = K.typy.dom;
  const d = document.getElementById('zestaw');
  document.getElementById('zestaw-tresc').innerHTML = `
    <h2 id="zestaw-naglowek">Dzisiejszy zestaw: 3 rundy</h2>
    <ul class="lista-zestawu">
      <li><strong>${z.pompki}</strong> ${odmiana(z.pompki, ['pompka', 'pompki', 'pompek'])}</li>
      <li><strong>${z.przysiady}</strong> ${odmiana(z.przysiady, ['przysiad', 'przysiady', 'przysiadów'])}</li>
      <li>deska <strong>${z.deska} s</strong></li>
    </ul>
    <p class="drobny">Przerwa między rundami ok. 1 min. Liczby to ok. 60% wyniku z ostatniego testu.</p>
    <button type="button" class="przycisk" data-zapisz-zestaw>Zrobione, zapisz (+${fmt(t.punkty + t.bonus)} pkt)</button>
    <button type="button" class="przycisk przycisk-drugi" data-zamknij-zestaw>Zamknij</button>`;
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}
function zamknijZestaw() {
  const d = document.getElementById('zestaw');
  if (typeof d.close === 'function' && d.open) d.close(); else d.removeAttribute('open');
}

/* ---------- Test miesięczny ---------- */

function pokazKomunikatTestu(tekst, blad) {
  const el = document.getElementById('komunikat-testu');
  if (!el) return;
  el.textContent = tekst;
  el.hidden = false;
  el.classList.toggle('blad', !!blad);
}

// Błąd stoi pod polem, którego dotyczy (pod przyciskiem zasłoniłaby go klawiatura).
function oznaczPole(form, id, tekst) {
  const pole = form.elements[id];
  const el = document.getElementById('blad-' + id);
  if (!pole || !el) return;
  el.textContent = tekst;
  if (tekst) pole.setAttribute('aria-invalid', 'true'); else pole.removeAttribute('aria-invalid');
}

function zapiszTest(form) {
  const dane = new FormData(form);
  const test = { id: nowyId(), data: new Date().toISOString(), usuniety: false };
  const bledy = [];
  let cokolwiek = false;
  for (const p of POLA_TESTU) {
    oznaczPole(form, p.id, '');
    const surowe = String(dane.get(p.id) || '').replace(',', '.').trim();
    if (surowe === '') { test[p.id] = null; continue; }
    const v = Number(surowe);
    const s = K.sciezki.find(x => x.id === p.id);
    const min = p.min != null ? p.min : 0, max = p.max != null ? p.max : (s ? s.max : 1000);
    if (isNaN(v)) bledy.push({ id: p.id, tekst: 'To nie jest liczba.' });
    else if (v < min || v > max) bledy.push({ id: p.id, tekst: `Wpisz od ${fmt(min)} do ${fmt(max)}.` });
    test[p.id] = isNaN(v) ? null : v;
    cokolwiek = true;
  }
  // Błąd pokazujemy bez rysowania ekranu od nowa, żeby nie skasować wpisanych wartości.
  if (bledy.length) {
    for (const b of bledy) oznaczPole(form, b.id, b.tekst);
    pokazKomunikatTestu(bledy.length === 1 ? 'Popraw zaznaczone pole.' : `Popraw zaznaczone pola (${bledy.length}).`, true);
    form.elements[bledy[0].id].focus();
    return;
  }
  if (!cokolwiek) { pokazKomunikatTestu('Wpisz przynajmniej jeden wynik.', true); return; }
  const przed = K.sciezki.map(s => ({ s, v: najlepszy(s) }));
  magazyn.wykonaj({ action: 'test', test });
  const nowe = [];
  for (const { s, v } of przed) {
    const po = najlepszy(s);
    for (const p of s.progi) if (po.zTestu && po.v >= p && !(v.zTestu && v.v >= p)) nowe.push(`${s.nazwa} ${fmtW(p)}`);
  }
  stan.komunikatTestu = nowe.length ? `Zapisano. Nowe progi: ${nowe.join(', ')}.` : 'Zapisano. Tym razem bez nowego progu.';
  stan.szkicTestu = {};
  renderuj();
}

function usunTest(id) {
  const t = magazyn.dane.testy.find(x => x.id === id);
  if (!t) return;
  magazyn.wykonaj({ action: 'delete_test', id });
  stan.komunikatTestu = '';
  renderuj();
  pokazToast({ tytul: `Usunięto test z ${ddmm(new Date(t.data))}`, akcje: [{ etykieta: 'Przywróć', glowna: true, wykonaj: () => { magazyn.wykonaj({ action: 'restore_test', id }); renderuj(); pokazToast({ tytul: 'Test przywrócony' }); } }] });
}

/* ---------- Akcje na posiłkach ---------- */

const jestDzis = ts => poczatekDnia(new Date(ts)).getTime() === poczatekDnia(new Date()).getTime();
const znajdzPosilek = id => magazyn.dane.jedzenie.find(x => x.id === id);

function akcjePosilku(p, pierwsza) {
  const akcje = pierwsza ? [pierwsza] : [];
  if (jestDzis(p.ts)) akcje.push({ etykieta: 'Wczoraj', wykonaj: () => przeniesPosilek(p.id, -1) });
  akcje.push({ etykieta: 'Usuń wpis', cicha: true, wykonaj: () => usunPosilek(p.id) });
  return akcje;
}

function dodajPosilek(posilek) {
  magazyn.wykonaj({ action: 'food_add', posilek });
  renderuj();
  const p = znajdzPosilek(posilek.id);
  pokazToast(maWartosc(p.kcal)
    ? { tytul: `${skrot(p.opis)} · ${kcalPosilku(p)}`, opis: `Dziś razem: ${fmt(sumaDzis())} kcal`, akcje: akcjePosilku(p) }
    : { tytul: `${skrot(p.opis)} · liczę kcal`, opis: magazyn.status === 'offline' ? 'Policzę po połączeniu z arkuszem.' : 'Model AI szacuje, to kilka sekund.', akcje: akcjePosilku(p) });
}

function zapiszPosilek(form) {
  const opis = String(form.elements.opis.value).trim().replace(/\s+/g, ' ');
  const surowe = String(form.elements.kcal.value).replace(',', '.').replace(/\s/g, '');
  oznaczPole(form, 'opis', '');
  oznaczPole(form, 'kcal', '');
  const bledy = [];
  let kcal = null;
  if (!opis) bledy.push(['opis', 'Wpisz, co było na talerzu.']);
  if (surowe !== '') {
    const v = Number(surowe);
    if (isNaN(v)) bledy.push(['kcal', 'To nie jest liczba.']);
    else if (v < 1 || v > 6000) bledy.push(['kcal', 'Od 1 do 6000.']);
    else kcal = Math.round(v);
  }
  if (bledy.length) {
    for (const [id, tekst] of bledy) oznaczPole(form, id, tekst);
    form.elements[bledy[0][0]].focus();
    return;
  }
  stan.szkicPosilku = {};
  dodajPosilek({ id: nowyId(), ts: new Date().toISOString(), opis: opis.slice(0, 200), kcal, zrodlo: kcal != null ? 'ja' : 'czeka', zalozenia: '', usuniety: false });
}

function powtorzPosilek(id) {
  const z = znajdzPosilek(id);
  if (!z) return;
  // Po pierwszym dotknięciu przycisk wskazuje już nowy wpis, więc blokada idzie po nazwie, nie po id.
  const klucz = 'posilek:' + z.opis.trim().toLowerCase();
  const teraz = Date.now();
  if (stan.ostatniKlik && stan.ostatniKlik.typ === klucz && teraz - stan.ostatniKlik.czas < 800) return;
  stan.ostatniKlik = { typ: klucz, czas: teraz };
  dodajPosilek({ id: nowyId(), ts: new Date().toISOString(), opis: z.opis, kcal: z.kcal, zrodlo: z.zrodlo === 'ai' ? 'ai' : 'ja', zalozenia: z.zrodlo === 'ai' ? z.zalozenia : '', usuniety: false });
}

// Wynik modelu: liczba z założeniami i od razu możliwość poprawki.
function poSzacunku(p) {
  odswiezJedzenie();
  if (p.usuniety) return;
  if (p.zrodlo === 'ai') {
    pokazToast({ tytul: `${skrot(p.opis)}: ok. ${fmt(p.kcal)} kcal`, opis: p.zalozenia, akcje: akcjePosilku(p, { etykieta: 'Popraw', wykonaj: () => edytujPosilek(p.id) }) });
  } else if (p.zrodlo === 'blad') {
    pokazToast({ tytul: `${skrot(p.opis)}: nie udało się policzyć`, opis: p.zalozenia,
      akcje: [{ etykieta: 'Policz ponownie', wykonaj: () => przeliczPosilek(p.id) }, { etykieta: 'Wpisz kcal', wykonaj: () => edytujPosilek(p.id) }] });
  }
}

function edytujPosilek(id) {
  stan.ekran = 'jedzenie';
  stan.edycjaPosilku = id;
  renderuj();
  const pole = document.querySelector('[data-popraw-posilek] input');
  if (pole) { pole.focus(); pole.select(); pole.closest('form').scrollIntoView({ block: 'center' }); }
}

function zapiszPoprawke(form) {
  const id = form.dataset.poprawPosilek;
  const surowe = String(form.elements.kcal.value).replace(',', '.').replace(/\s/g, '');
  const v = Number(surowe);
  const blad = surowe === '' ? 'Wpisz kcal.' : isNaN(v) ? 'To nie jest liczba.' : (v < 1 || v > 6000) ? 'Od 1 do 6000.' : '';
  if (blad) {
    document.getElementById('blad-popraw').textContent = blad;
    form.elements.kcal.setAttribute('aria-invalid', 'true');
    form.elements.kcal.focus();
    return;
  }
  magazyn.wykonaj({ action: 'food_update', id, zmiany: { kcal: Math.round(v), zrodlo: 'ja' } });
  stan.edycjaPosilku = null;
  renderuj();
  const p = znajdzPosilek(id);
  pokazToast({ tytul: `${skrot(p.opis)} · ${fmt(p.kcal)} kcal`, opis: `Poprawione. Dziś razem: ${fmt(sumaDzis())} kcal` });
}

function przeliczPosilek(id) {
  const p = znajdzPosilek(id);
  if (!p || p.usuniety) return;
  magazyn.wykonaj({ action: 'food_update', id, zmiany: { kcal: null } });
  stan.edycjaPosilku = null;
  renderuj();
  pokazToast({ tytul: `${skrot(p.opis)} · liczę kcal`, opis: magazyn.status === 'offline' ? 'Policzę po połączeniu z arkuszem.' : 'Model AI szacuje, to kilka sekund.' });
}

function usunPosilek(id) {
  const p = znajdzPosilek(id);
  if (!p || p.usuniety) return;
  magazyn.wykonaj({ action: 'food_delete', id });
  stan.edycjaPosilku = null;
  renderuj();
  pokazToast({ tytul: `Usunięto: ${skrot(p.opis)}`, akcje: [{ etykieta: 'Przywróć', glowna: true, wykonaj: () => {
    magazyn.wykonaj({ action: 'food_restore', id });
    renderuj();
    pokazToast({ tytul: `Przywrócono: ${skrot(p.opis)}` });
  } }] });
}

// dni = -1 przenosi na wczoraj, +1 odwraca to przeniesienie.
function przeniesPosilek(id, dni) {
  const p = znajdzPosilek(id);
  if (!p || p.usuniety) return;
  magazyn.wykonaj({ action: 'food_update', id, zmiany: { ts: dodajDni(new Date(p.ts), dni).toISOString() } });
  renderuj();
  pokazToast({
    tytul: dni < 0 ? `${skrot(p.opis)} na wczoraj` : `${skrot(p.opis)} z powrotem na dziś`,
    opis: dni < 0 ? 'Wejdzie do średniej od razu, bo wczoraj to pełny dzień.' : '',
    akcje: dni < 0 ? [{ etykieta: 'Jednak dziś', wykonaj: () => przeniesPosilek(id, 1) }] : []
  });
}

/* ---------- Przechodzenie między ekranami: zakładki i przesunięcie palcem ---------- */

const KOLEJNOSC_EKRANOW = ['start', 'jedzenie', 'drzewko', 'test', 'historia'];

// kierunek: 1 = następny ekran wjeżdża z prawej, -1 = poprzedni z lewej, 0 = bez animacji (dotknięcie zakładki).
function przejdzNa(ekran, kierunek = 0) {
  stan.ekran = ekran;
  stan.komunikatTestu = '';
  stan.edycjaPosilku = null;
  renderuj();
  window.scrollTo(0, 0);
  widok.classList.remove('wjazd-z-prawej', 'wjazd-z-lewej');
  if (kierunek && !ruchOgraniczony()) {
    void widok.offsetWidth;
    widok.classList.add(kierunek > 0 ? 'wjazd-z-prawej' : 'wjazd-z-lewej');
  }
}

// Przesunięcie musi być wyraźnie poziome i krótkie, żeby przewijanie w pionie nie zmieniało ekranu.
// W polach tekstowych palec przesuwa kursor, a w otwartym panelu i komunikacie gest należy do nich.
let dotyk = null;
document.addEventListener('touchstart', e => {
  dotyk = null;
  if (e.touches.length !== 1 || document.querySelector('dialog[open]')) return;
  if (e.target.closest('input, textarea, select, #toast, [data-popraw-posilek]')) return;
  dotyk = { x: e.touches[0].clientX, y: e.touches[0].clientY, czas: Date.now() };
}, { passive: true });
document.addEventListener('touchcancel', () => { dotyk = null; }, { passive: true });
document.addEventListener('touchend', e => {
  if (!dotyk) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - dotyk.x, dy = t.clientY - dotyk.y, czas = Date.now() - dotyk.czas;
  dotyk = null;
  if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy) || czas > 800) return;
  const k = dx < 0 ? 1 : -1;
  const cel = KOLEJNOSC_EKRANOW[KOLEJNOSC_EKRANOW.indexOf(stan.ekran) + k];
  if (!cel) return;
  schowajToast();
  przejdzNa(cel, k);
}, { passive: true });

/* ---------- Zdarzenia ---------- */

document.addEventListener('click', e => {
  const akcja = e.target.closest('[data-akcja]');
  if (akcja) { const a = toast.akcje[Number(akcja.dataset.akcja)]; if (a) a.wykonaj(); return; }
  // Kafelki zapisu same pokazują nowy komunikat; drugie dotknięcie (zablokowane jako dubel) nie może go chować.
  if (!e.target.closest('#toast') && !toast.el.hidden && !e.target.closest('.kafelek-zapis, .szybki')) schowajToast();

  const zak = e.target.closest('.zakladki button, [data-przejdz]');
  if (zak) { przejdzNa(zak.dataset.ekran || zak.dataset.przejdz); return; }
  const kaf = e.target.closest('.kafelek-zapis');
  if (kaf) { zapiszRuch(kaf.dataset.typ); return; }
  const opc = e.target.closest('.kafelek-opcja');
  if (opc) {
    stan.ostatniKlik = null;
    if (opc.dataset.opcja === 'zestaw') { otworzZestaw(); return; }
    if (opc.dataset.opcja === 'plus') {
      stan.spacerPlus = !stan.spacerPlus;
      renderuj();
      const nowy = document.querySelector('[data-opcja="plus"]');
      if (nowy) nowy.focus();
    }
    return;
  }
  if (e.target.closest('[data-zapisz-zestaw]')) { zamknijZestaw(); zapiszRuch('dom'); return; }
  if (e.target.closest('[data-zamknij-zestaw]') || e.target.id === 'zestaw') { zamknijZestaw(); return; }
  const cof = e.target.closest('[data-cofnij]');
  if (cof) { cofnij(cof.dataset.cofnij); return; }
  const prz = e.target.closest('[data-przywroc]');
  if (prz) { przywroc(prz.dataset.przywroc); return; }
  const ut = e.target.closest('[data-usun-test]');
  if (ut) { usunTest(ut.dataset.usunTest); return; }
  const pow = e.target.closest('[data-powtorz]');
  if (pow) { powtorzPosilek(pow.dataset.powtorz); return; }
  const zm = e.target.closest('[data-zmien-posilek]');
  if (zm) { edytujPosilek(zm.dataset.zmienPosilek); return; }
  const edycja = e.target.closest('[data-popraw-posilek]');
  if (edycja) {
    const id = edycja.dataset.poprawPosilek;
    if (e.target.closest('[data-przelicz]')) przeliczPosilek(id);
    else if (e.target.closest('[data-usun-posilek]')) usunPosilek(id);
    else if (e.target.closest('[data-anuluj-edycje]')) { stan.edycjaPosilku = null; renderuj(); }
  }
});
document.addEventListener('input', e => {
  const posilek = e.target.closest('#formularz-posilku input');
  if (posilek) {
    stan.szkicPosilku[posilek.name] = posilek.value;
    if (posilek.hasAttribute('aria-invalid')) oznaczPole(posilek.form, posilek.name, '');
    return;
  }
  const pole = e.target.closest('#formularz-testu input');
  if (!pole) return;
  stan.szkicTestu[pole.name] = pole.value;
  if (pole.hasAttribute('aria-invalid')) oznaczPole(pole.form, pole.name, '');
});
document.addEventListener('submit', e => {
  if (e.target.id === 'formularz-testu') { e.preventDefault(); zapiszTest(e.target); }
  if (e.target.id === 'formularz-posilku') { e.preventDefault(); zapiszPosilek(e.target); }
  if (e.target.matches('[data-popraw-posilek]')) { e.preventDefault(); zapiszPoprawke(e.target); }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || magazyn.demo) return;
  magazyn.wczytaj().then(() => {
    K = zbudujKonfig(magazyn.dane.ustawienia, magazyn.dane.progi);
    if (stan.ekran !== 'test') renderuj(); else odswiezStatus();
  });
});
window.addEventListener('online', () => magazyn.wyslij());

async function start() {
  if (magazyn.dane) { K = zbudujKonfig(magazyn.dane.ustawienia, magazyn.dane.progi); renderuj(); }
  await magazyn.wczytaj();
  K = zbudujKonfig(magazyn.dane.ustawienia, magazyn.dane.progi);
  renderuj();
}
start();
