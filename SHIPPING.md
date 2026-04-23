# Shipping Meridian v0.1 — what only you can do

Everything in this file requires a human. I've handled the code, docs, and copy. These are the gates between here and "live on the Chrome Web Store."

Work top-to-bottom.

---

## 1. Create the support email

Chrome Web Store requires a working support email on the listing. Two cheap options:

- **ProtonMail** (free, no phone needed): create `meridian.extension@proton.me`. All the docs + STORE_LISTING.md already reference this exact address.
- **Gmail alias**: `bznitar+meridian@gmail.com` works but looks less serious.

If you pick a different address, search-and-replace `meridian.extension@proton.me` across:
- `docs/privacy.html`
- `docs/terms.html`
- `docs/index.html`
- `STORE_LISTING.md`

✅ Done when: you can actually receive email at that address.

---

## 2. Host the Privacy Policy + landing page via GitHub Pages

Chrome requires the Privacy Policy to be hosted at a public URL. GitHub Pages is free.

1. Push the latest code (Phase 4 commit).
2. On github.com → `Dev14Ayoub/Meridian` → Settings → Pages.
3. Source: `Deploy from a branch`. Branch: `master`. Folder: `/docs`. Save.
4. Wait ~1 min. Your URLs will be:
   - Landing: `https://dev14ayoub.github.io/Meridian/`
   - Privacy: `https://dev14ayoub.github.io/Meridian/privacy.html`
   - Terms: `https://dev14ayoub.github.io/Meridian/terms.html`
5. Open each in an incognito window and confirm they render.

✅ Done when: all three URLs load the styled pages.

---

## 3. Replace the Chrome Web Store placeholder link

The landing page has `https://chrome.google.com/webstore/detail/meridian` as a placeholder. After the store listing is live, you'll get a real URL like `.../detail/<extension-id>`. Replace it in `docs/index.html` in both `btn primary` anchors.

✅ Done when: the "Add to Chrome" button actually goes to the store.

---

## 4. Create icon PNGs

Chrome needs three sizes. Currently `icons/icon16.png`, `icon48.png`, `icon128.png` referenced in manifest — check they exist and look good.

If you don't have the source file:
- Quick path: use [realfavicongenerator.net](https://realfavicongenerator.net) with a purple circle + white dot SVG matching the nav logo in `docs/index.html`.
- Better path: take the SVG used in the nav (`<circle r="9" stroke>` + `<circle r="3" fill>`) and export as 128×128 → downscale to 48 and 16 in any image editor.
- Store tile: also needs a **128×128** promo icon. Can be the same as icon128.

✅ Done when: the three icons look sharp on the extension card and in chrome://extensions.

---

## 5. Take screenshots (5 × 1280×800)

Chrome Web Store listing needs 1–5 screenshots at 1280×800 or 640×400. You want all 5 slots filled.

For each: open the side panel at 1280×800 viewport and capture.

1. **Brain tab mid-conversation** — ask a question, get a response, screenshot mid-scroll.
2. **Research tab** — run "choosing a laptop" and capture the plan with overview + queries + subtopics.
3. **Shield tab** — scan a pricing/sale page showing tactics detected.
4. **History tab** — show a recap with the "Websites visited" list.
5. **Voice companion** — open the overlay, screenshot with the orb active.

**Tip:** set Chrome zoom to 100% and window size exactly to 1280×800 (there are DevTools device-mode presets). Use a clean browser profile with no other extensions visible.

✅ Done when: 5 PNGs sized 1280×800 saved in `promo/screenshots/`.

---

## 6. Build promo tiles

Chrome listing has 2 optional banner slots — filling them makes the listing look real.

- **Small promo tile:** 440×280. Use the headline "Your persistent AI layer across the web" on the gradient background.
- **Marquee:** 1400×560. Same but wider.

Figma or Canva is fastest. Match the `#09090f` bg, `#7c3aed` accent, white text. Copy in STORE_LISTING.md.

✅ Done when: both PNGs saved in `promo/`.

---

## 7. Test the packaged build

Before uploading:

1. Work through every step in `TESTING.md` (both Phase 1 and Phase 2). Fix any regressions.
2. Zip the extension: exclude `.git/`, `docs/`, `*.md`, `promo/`, `node_modules/`.
   - From the project root: `zip -r meridian-v0.1.0.zip . -x "*.git*" "docs/*" "*.md" "promo/*" "node_modules/*"`
3. Load the unpacked version one more time from a fresh `chrome://extensions` → verify no console errors.

✅ Done when: TESTING.md runs clean and you have a `meridian-v0.1.0.zip`.

---

## 8. Pay the $5 Chrome Web Store developer fee

One-time, for life, per Google account. Register at <https://chrome.google.com/webstore/devconsole>. Use the Google account you want tied to the listing permanently.

✅ Done when: dashboard shows "Developer account active."

---

## 9. Submit the listing

In the dev console:

1. **Package:** upload `meridian-v0.1.0.zip`.
2. **Store listing:** paste everything from `STORE_LISTING.md` into the matching fields.
3. **Privacy practices:** tick the exact boxes listed in `STORE_LISTING.md` under "Data handling disclosure."
4. **Permission justifications:** paste each row from the table into the per-permission fields.
5. **Privacy policy URL:** `https://dev14ayoub.github.io/Meridian/privacy.html`
6. **Support email:** your new address.
7. **Screenshots + icons + promo tiles:** upload.
8. **Distribution:** Public.
9. **Pricing:** Free.
10. Click **Submit for review**.

Review takes 1–10 business days for new publishers. Expect at least one rejection — the reviewer will cite the exact policy. Fix, resubmit.

✅ Done when: listing is "Published" in the dashboard.

---

## 10. Announce (optional but worth it)

Once live:

- Post to Hacker News ("Show HN: Meridian — a local-first AI browser co-pilot").
- Post to r/chrome_extensions, r/SideProject, r/anthropic.
- Tweet at @AnthropicAI with a 30s demo gif.
- Add the store link to the GitHub repo README.

Keep the pitch honest: solo student, local-first, BYOK. That's the differentiator from the 50 other Chrome AI extensions.

---

## Post-launch monitoring

- Check the dev console weekly for crash reports.
- Watch GitHub Issues.
- Respond to support emails within 48h — the listing visibly drops in ranking if you don't.

Good luck. You built the thing; the last mile is paperwork.
