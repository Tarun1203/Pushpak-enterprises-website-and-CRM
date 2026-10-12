# T014-index-service-locator: Find a service center or store

| Field | Value |
|---|---|
| Route | `/index.html` |
| Source | `assets/locator.js` (open/load/rank/render/map/geolocation), `index.html` (`#locator-overlay` markup lines ~411-439) |
| Flow | Fill and submit form "Find a service center or store" (`#loc-form`), filter, use location, show map, enquiry hand-off |
| Requires auth | no |
| Required role | anonymous |
| Destructive | no (read-only: `publicLocations` where `active == true`) |
| Estimated steps | 40 |

## Preconditions
- App running at `http://localhost:8080`
- anonymous (no sign-in)
- This task does not write to Firestore. For deterministic results, still run it against stubbed or emulator data. Live `publicLocations` content changes, and the "Send us an enquiry" hand-off leads to a form that writes (it is NOT submitted here; T012 covers it).
- **Data mode:** `installFirebaseStub(page, { data: { publicLocations: SEED } })` (preferred), or the emulator seeded with `SEED` and the page patched to `connectFirestoreEmulator`. Abort if any request goes to `firestore.googleapis.com`.
- `SEED` (`publicLocations`, all `active: true` unless noted):
  - `{ id: "qa-sc-raichur", type: "servicecenter", name: "QA-AUTO Raichur Service Center", address: "QA-AUTO Station Road", city: "Raichur", district: "Raichur", state: "Karnataka", pincode: "584101", phone: "9000000010", whatsapp: "9000000010", hours: "9am-6pm", brands: ["MakWell","Flyvision"], lat: 16.2076, lng: 77.3463, active: true }`
  - `{ id: "qa-st-raichur", type: "store", name: "QA-AUTO Raichur Store", address: "QA-AUTO Gandhi Chowk", city: "Raichur", state: "Karnataka", pincode: "584102", phone: "9000000011", lat: 16.2100, lng: 77.3550, active: true }`
  - `{ id: "qa-sc-hubli", type: "servicecenter", name: "QA-AUTO Hubli Service Center", address: "QA-AUTO Unkal", city: "Hubli", state: "Karnataka", pincode: "580031", phone: "9000000012", lat: 15.3647, lng: 75.1240, active: true }`
  - `{ id: "qa-st-nomap", type: "store", name: "QA-AUTO Koppal Store", city: "Koppal", state: "Karnataka", pincode: "583231", active: true }` (no coordinates)
  - `{ id: "qa-off", type: "store", name: "QA-AUTO Closed Store", city: "Raichur", pincode: "584101", active: false }` (must never appear)
- Geolocation: grant permission and set the position to Raichur `{ latitude: 16.2076, longitude: 77.3463 }` (Playwright `context.grantPermissions(['geolocation'])` + `setGeolocation`). TC-04 denies it instead.

## Test data
- `qPincode = "584101"`
- `qCity = "Raichur"`
- `qNoMatch = "QA-AUTO Nowhere"`
- `qPartialPin = "584"`
- `qOverflow = 61 × "a"` (maxlength 60)
- `qEmpty = ""`

## Steps

### TC-01: Happy path — Search by pincode
1. Navigate to `/index.html`. Dismiss the cookie banner with **Reject optional** if it is shown.
2. In `#help`, click the **Find service center** card ("Service centers and stores near you, on a map, with directions.").
3. Assert: `#locator-overlay` is shown with the heading "Find a service center or store" and the sub-text "Search by pincode or city, or use your location to see the nearest first.". The **Pincode or city** input has the placeholder "e.g. 584101 or Raichur".
4. Assert: `#loc-status` briefly reads "Loading locations…", then "4 locations — all locations.". `#loc-list` has 4 items sorted by name; "QA-AUTO Closed Store" is absent.
5. Fill **Pincode or city** = `584101`. Click **Search**.
6. Assert: the status reads "4 locations — nearest to that pincode first (approximate)." and the first item is "QA-AUTO Raichur Service Center".
7. Assert: that item shows the type badge "Service center", the address "QA-AUTO Station Road, Raichur, 584101", "Open: 9am-6pm" and "Brands: MakWell, Flyvision". The distance line starts with "about " and ends with " away".
8. Assert: its actions are **Call** (`href="tel:9000000010"`), **WhatsApp** (`href="https://wa.me/919000000010"`, new tab), **Directions** (`href` starting `https://www.google.com/maps/dir/?api=1&destination=16.2076%2C77.3463`, new tab) and **Show on map**.
9. Assert: the "QA-AUTO Koppal Store" item has NO **Show on map** button, and its **Directions** uses the name/city/pincode text destination.

### TC-02: Search by city / no match
1. Search `Raichur`. Assert: the status reads "2 locations — best match first." and only the 2 Raichur entries are listed.
2. Search `QA-AUTO Nowhere`. Assert: the status reads `4 locations — all locations. Nothing matches "QA-AUTO Nowhere" yet, so all locations are shown.`
3. Search `584`. Assert: it is treated as a pincode prefix, and the Raichur entries (pincodes 5841xx) rank first.
4. Search with the field empty. Assert: the status reads "4 locations — all locations.".
5. Max-length: type 61 × "a". Assert: the input value length is 60.

### TC-03: Filters
| Button | Action taken | Expected result |
|---|---|---|
| **Service centers** | click | `aria-pressed="true"` on it and `"false"` on the others; list shows 2 items, all badged "Service center" |
| **Stores** | click | list shows 2 items badged "Store" |
| **All** | click | list shows 4 items |
| **Stores** + search `Raichur` | combined | 1 item, "QA-AUTO Raichur Store" |

### TC-04: Use my location
1. With geolocation granted at Raichur, click **Use my location**. Assert: the button shows "Finding you…", then "Use my location". The status reads "4 locations — nearest to you first.". The first item is "QA-AUTO Raichur Service Center", with a distance under 1 km shown in metres (e.g. "0 m away", without "about").
2. Assert: "QA-AUTO Hubli Service Center" shows a distance in whole km (≥ 10 km, e.g. "2xx km away").
3. New context with geolocation denied: click **Use my location**. Assert: the status reads "We could not get your location (permission was not given). Type your pincode or city instead.".

### TC-05: Map
1. Click **Show map**. Assert: the button shows "Loading map…", then hides. `#loc-map` is visible and `#loc-legend` is visible with "Service center", "Store", "You". Leaflet loads from `assets/vendor/leaflet/`.
2. Assert: 3 circle markers are drawn (the Koppal store has no coordinates).
3. Click **Show on map** on "QA-AUTO Raichur Store". Assert: a popup opens containing "QA-AUTO Raichur Store", "Store", "QA-AUTO Gandhi Chowk", a tel link `9000000011` and a "Directions" link.
4. After TC-04 location is set, assert a green "You are here" marker exists.
5. Map load failure (block `**/assets/vendor/leaflet/leaflet.js`). Click **Show map**. Assert: the status reads "The map could not load. The list above still shows every location." and the button is re-enabled as "Show map".
6. Privacy note text is present: "The map is provided by OpenStreetMap and loads only when you tap "Show map". Your location is used only on this page and is not saved.". Before clicking **Show map**, assert there are no requests to `tile.openstreetmap.org`.

### TC-06: Modal coverage — `locator-overlay`
1. Open from the card. Assert: `role="dialog"`, `aria-modal="true"`, labelled "Find a service center or store", and the × has aria-label "Close".
2. Click **×** (`#locator-close`). Assert: closed.
3. Reopen. Press **Escape**. Assert: closed. Reopen. Click the backdrop. Assert: closed.
4. Navigate to `/index.html#find-service-center`. Assert: the locator opens automatically.
5. Click **Send us an enquiry** (footer text "Can't find one near you?"). Assert: the locator closes and the enquiry modal opens with title "Find a service center". Close it without submitting; T012 covers submission.

### TC-07: Negative & edge cases
- Empty collection (seed `publicLocations: []`). Assert: the status reads "Our location list is being updated. Please send us an enquiry and we will tell you the nearest center.", the list is empty and the map wrap is hidden.
- Load failure (stub `getDocs` throws). Assert: the status reads "We could not load the list right now. Please try again, or send us an enquiry.".
- All entries without coordinates. Assert: `#loc-map-wrap` is hidden.
- XSS: seed `name = "QA-AUTO <img src=x onerror=window.__xss=1>"`. The list and popup show the literal text, and `window.__xss` is undefined.
- WhatsApp with country code: seed `whatsapp: "919000000010"`. The link is `https://wa.me/919000000010` (no double 91).

## Assertions
- [ ] Only `active == true` locations are listed.
- [ ] Status line format "`N` locations — <how>." for all-locations / best match / pincode-approximate / nearest-to-you.
- [ ] Filters toggle `aria-pressed` correctly.
- [ ] Directions/Call/WhatsApp hrefs are correct; external links open in a new tab with `rel="noopener"`.
- [ ] No OpenStreetMap tile requests before **Show map** is clicked.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (blocked leaflet in TC-05.5).

## Screenshots required
- Page initial load
- Locator opened (all locations)
- Pincode search result; Stores filter; Use my location result
- Map shown with a popup open
- Each error state (no match note, location denied, map failed, empty list)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
