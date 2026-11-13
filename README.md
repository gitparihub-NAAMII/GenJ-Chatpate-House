# GenJ ChatPate Shop 🍋☕🥟

Order taking, table billing and daily Excel reports for a small tea / chatpate shop.
Works **offline**, installs on **Android**, and can sync **live across several phones**.
Available in **English and नेपाली**, with **light and dark** themes.

## Get the app

| How | Link |
|---|---|
| Android APK (download & install) | **Releases → latest → `GenJ-ChatPate-Shop.apk`** <br> https://github.com/gitparihub-NAAMII/GenJ-Chatpate-House/releases/latest |
| Web app (open in Chrome → "Install app" / "Add to Home screen") | https://gitparihub-naamii.github.io/GenJ-Chatpate-House/ |

> Installing the APK: open the downloaded file on the phone and allow **"Install unknown apps"** for your browser / Files app when Android asks.

## Menu (default prices — change any time in **Settings → Menu & prices**)

| Item | Price | Options |
|---|---|---|
| Milk Tea | Rs. 20 | With sugar / Less sugar / No sugar |
| Lemon Tea | Rs. 10 | Add-ons: Marich, Black salt, Lemon · With / Less / No sugar |
| Doughnut | Rs. 10 per piece | |
| Momo | Rs. 120 | |
| Chowmein | Rs. 100 | |
| Chatpate | Rs. 50 | |
| Pani Puri | Rs. 50 | |

New items, Nepali names, emojis, categories and add-ons can all be added or edited in Settings.

## How to use

1. **Tables** — every table is drawn as a circle with its chairs around it. Free tables are plain, occupied tables have an amber border, tables where everything is served have a blue border. Chairs turn orange and show `×n` when someone in that chair has ordered.
2. Tap a table → type the **focal person** (the person responsible for the whole table's bill) → tap a **chair** (or *Whole table*) → tap menu items. Lemon/milk tea open a small window for add-ons, sugar, quantity and a note.
3. **Revise** an item with ✎ (change quantity, sugar, add-ons, note or move it to another chair), remove one with − or ✕, or **Cancel whole order**. Every cancellation (with an optional reason) is kept for the daily report.
4. **Orders** tab — live list for the kitchen. Tap the status to move it *New → Cooking → Served*.
5. **Generate bill** → optional discount → choose **Cash** or **Online** (eSewa, Khalti, Fonepay QR, Mobile Banking, IME Pay, Other) → **Paid — clear table**. Bills can be printed (web) or shared (Android app).
6. **Reports** — sales for any day, cash vs online split, item-wise sales, every bill and every cancelled item. **Download Excel** for the day.

### Automatic daily Excel
With *Settings → Auto-download daily Excel* on, the day's sheet `GenJ-ChatPate-YYYY-MM-DD.xlsx` is saved automatically at the closing time you set (default 21:00). If the app was closed at that time, missed days are exported the next time it opens. On Android the file is saved in `Documents/GenJ-ChatPate`.

The workbook has 5 sheets: **Summary** (total, cash, online, per wallet, discounts, cancellations), **Bills**, **Order lines**, **Item sales**, **Cancelled**.

## Offline and multiple phones

- Everything is stored on the phone, so the app keeps working with no internet.
- To let several waiters / the chef see the same tables live, connect a free **Firebase** project:
  1. Go to https://console.firebase.google.com → *Add project*.
  2. *Build → Firestore Database → Create database* (start in production mode, pick a nearby region).
  3. In *Firestore → Rules*, paste the rules below and *Publish*.
  4. *Project settings → Your apps → Web (`</>`)* → register an app and copy the `firebaseConfig` block.
  5. On **each** phone: *Settings → Online sync* → paste the config, use the **same shop code**, tap **Connect**.

  Changes made offline are uploaded automatically when the phone is back online. The dot in the top bar shows the state: green = live sync, amber = connecting, red = offline.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // anyone with your Firebase config + shop code can use the shop data
    match /shops/{shop}/{document=**} {
      allow read, write: if true;
    }
  }
}
```

> Keep your shop code private. For stronger security you can later add Firebase Authentication and change the rule to `if request.auth != null`.

## Backup
*Settings → Backup* exports everything (menu, open tables, all bills) to a JSON file and can import it again on another phone.

## Project layout

```
index.html            app page
css/style.css         styles (light + dark)
js/i18n.js            English / Nepali text
js/store.js           data on the phone (localStorage)
js/sync.js            optional Firebase live sync
js/excel.js           Excel report + file saving
js/app.js             screens: tables, orders, reports, settings
sw.js, manifest.json  offline + installable web app
vendor/               SheetJS (Excel) library, bundled for offline use
.github/workflows/    builds the Android APK and publishes the web app
```

No build step: open `index.html` through any static web server to run it locally.
