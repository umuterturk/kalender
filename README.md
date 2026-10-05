# Kalender

**Fair doctor rotas for hospitals in Türkiye — without the fight.**

Kalender is a local-first nöbet planner. You set the people, rest rule, and the days that must stay put. Then you ask it to **Planla**. It fills the month with a workable, explainable schedule and keeps a rolling fairness ledger so weekends, weekdays, and holidays do not pile onto the same few names.

Live app: [umuterturk.github.io/kalender](https://umuterturk.github.io/kalender/)

## Why it exists

Hospital rotas fail in the same places every month: rest after a duty, long holiday blocks, last-minute “Hayır”, and the person who already did last bayram. Kalender treats those as first-class rules, not spreadsheet footnotes.

- **Planla** builds an automatic month. Days you **Set** stay.
- **İstiyor / İstemiyor / İzin** are visible on the calendar as compact marks.
- **Resmi tatiller** for Türkiye 2026 are loaded when you choose the country.
- **Yayınla** freezes the plan. Later substitutions do not rewrite fairness history.
- Everything stays **in this browser** (IndexedDB). There is no account and no server.

## Türkiye 2026 holidays

Setup asks for a country. **Türkiye is the only choice** today. On first setup Kalender marks official 2026 public holidays, including bayram and arefe days. You can still flip any day with **Resmi Tatil Gir**.

| Date | Holiday |
| --- | --- |
| 1 Jan | Yılbaşı |
| 19–22 Mar | Ramazan Bayramı (arefe + 3 days) |
| 23 Apr | Ulusal Egemenlik ve Çocuk Bayramı |
| 1 May | Emek ve Dayanışma Günü |
| 19 May | Atatürk’ü Anma, Gençlik ve Spor Bayramı |
| 26–30 May | Kurban Bayramı (arefe + 4 days) |
| 15 Jul | Demokrasi ve Millî Birlik Günü |
| 30 Aug | Zafer Bayramı |
| 28–29 Oct | Cumhuriyet Bayramı (arefe + 1 day) |

Dates follow the official 2026 calendar and [Diyanet religious days](https://vakithesaplama.diyanet.gov.tr/dinigunler.php?yil=2026).

## How a month works

1. **Kurulum** — name the list, keep Türkiye, set working days and rest policy.
2. Add people on **Kişiler** (or during setup).
3. Open the month. Mark **Set**, **İstemiyor**, or **İzin** on a day.
4. **Planla** fills the rest. Run it again if you want another feasible variant.
5. **Yayınla** after a quick review. Advisory warnings do not block publish.
6. After the month, **Gerçekleşen** records who actually worked.

Fairness is a rolling ledger (NN / NT / TN / TT), not a January reset. New joiners do not inherit fake historical debt.

## Run locally

```bash
npm install
npm run dev
```

Then open the printed local URL. Data is stored only in that browser.

```bash
npm test        # domain engine tests
npm run build   # production bundle
```

## GitHub Pages

This repo deploys from `main` with GitHub Actions to  
`https://umuterturk.github.io/kalender/`.

The Vite `base` is `/kalender/` in CI. Local `npm run dev` still uses `/`.

## Stack

React 18, Vite, TypeScript, IndexedDB (`idb`), React Router. No backend.

The scheduling core lives in `src/domain/` — generate, repair, leave, fairness, and validation — with acceptance tests next to it.

## Privacy

The roster stays in this browser. People, duties, and plans are not uploaded. The live site sends page views to Google Analytics; person ids are omitted from those paths. Clearing site data for this origin clears the plan.

---

Made for Turkish hospital rotas. English and Turkish are first-class in the UI.
