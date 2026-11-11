# Saloni Resin Art Studio

A buildless, responsive one-page portfolio for Saloni's resin art and personalized resin gifts.

## Preview locally

From this directory, run:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` in a browser. Stop the server with `Ctrl-C`.

## Verify

```sh
python3 -m unittest discover -s tests -v
node --test tests/customizer.test.cjs tests/apps-script.test.cjs tests/order-flow.test.cjs tests/form-flow.test.cjs tests/partner-referral.test.cjs tests/corporate-gifting.test.cjs tests/public-forms.test.cjs tests/reviews.test.cjs
node --check script.js
node --check customizer.js
git diff --check
```

The tests check the required sections, exact contact links, local asset references, image metadata, progressive carousel hooks, SEO metadata, discovery files, and the Google Sheet-only order-request contract. Live Sheet, Drive, and CAPTCHA checks require a later deployment.

## GitHub Pages

1. Push this directory to a GitHub repository.
2. In **Settings → Pages**, choose **Deploy from a branch**.
3. Select the `main` branch and the `/ (root)` folder, then save.

The site uses relative asset paths and includes `.nojekyll`, so it works without a build step. The `work/` source folder is intentionally ignored and is not part of the published site.

The public canonical URL is `https://saloniresinart.com/`. Keep the custom-domain `CNAME`, `robots.txt`, `sitemap.xml`, and `assets/favicon.svg` in the published root.

If GitHub Pages fails after building the site artifact, merge a fresh commit into `main` to start a new deployment run.

## Google Sheet-only order requests

The order request form is built into the home page itself (`index.html` markup, `order-form.js`, and the `#order-form` rules in `styles.css`), so opening it is instant and nothing is sent to Google until the shopper presses Send. Send, and the optional referral-code check, are `fetch` POSTs to the Apps Script `/exec` URL with a `text/plain` JSON body (`?action=order` and `?action=referral`, no preflight, no cookies) that `doPost` answers with JSON. `apps-script/Form.html` and `action=seed` stay only so pages cached before this change keep working. The Partner Circle and Corporate Gifting forms are built into their pages the same way (`partners/index.html`, `corporate-gifting/index.html`, `public-forms.js`, and the `#partner-form` / `#corporate-form` rules in `styles.css`): they show at once, and Submit `fetch`es one JSON body to `?action=partner` or `?action=corporate` straight away, with no reCAPTCHA. `apps-script/PartnerForm.html`, `apps-script/CorporateForm.html` and `action=seed` stay only so cached pages keep working. The Reviews page is built in the same way (`?action=review`). No page embeds an Apps Script form or posts a `seed` any more: `apps-script/Form.html`, `PartnerForm.html`, `CorporateForm.html`, `ReviewForm.html` and `action=seed` stay only so pages cached before these changes keep working, and can be removed once those caches are gone. None of the forms use Tally, email, payments, or accounts. The only cross-origin `fetch` calls are the review feed read and the quick-rating post. The Apps Script `doGet` and `doPost` handlers only render a bounded order, partner, corporate, or review template, with one exception: `doGet?action=reviews` is the only public read endpoint and returns the allowlisted fields of `Published` customer reviews (see Customer reviews). `submitOrder`, `submitPartnerApplication`, `submitCorporateEnquiry`, `submitReview`, and the quick-rating `doPost` with `action=rate` (see Quick ratings) are the public write paths, and corporate enquiries write only to the private `Corporate Enquiries` tab.

### Production setup (studio owner)

1. Create or open the private Sheet and a restricted Drive folder. Put the Apps Script files in a standalone Apps Script project.
2. In **Project Settings → Script properties**, configure `ORDER_SHEET_ID`, `ORDER_SHEET_TAB`, `ORDER_DRIVE_FOLDER_ID`, `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET`, `CAPTCHA_MIN_SCORE` (a finite value from 0 to 1), `DAILY_ACCEPTANCE_CAP` (the code default is 50), `PARTNER_SHEET_ID` (normally the same private spreadsheet), optional `PARTNER_APPLICATIONS_SHEET_TAB`, `PARTNERS_SHEET_TAB`, and `PARTNER_COMMISSIONS_SHEET_TAB`, `PARTNER_DAILY_ACCEPTANCE_CAP`, and `PARTNER_FORM_DISABLED`. Corporate Gifting reuses `ORDER_SHEET_ID` and the fixed `Corporate Enquiries` tab; run `setupCorporateGifting()` once as the deployment owner to create, protect, and verify its exact 17-column schema. Set `CORPORATE_FORM_DISABLED=true` to pause only corporate intake, and use `CORPORATE_DAILY_ACCEPTANCE_CAP` to override the default of 20. reCAPTCHA v3 now protects only the star ratings on the home page (the `CAPTCHA_*` properties are used only for them); the order, Partner Circle, Corporate and Review forms do not use it. The public reCAPTCHA v3 site key must be registered for `saloniresinart.com` with Google's domain validation enabled. Set `ORDER_FORM_DISABLED=true`, `PARTNER_FORM_DISABLED=true`, or `CORPORATE_FORM_DISABLED=true` to pause an intake path, and keep the CAPTCHA secret out of this repository.
3. Deploy a web app that executes as the studio owner. The Partner Circle, Corporate and Reviews pages send no reCAPTCHA token, to make Submit instant: `submitPartnerApplication`, `submitCorporateEnquiry` and `submitReview` do not ask for or verify one, and a `captchaToken` sent by an old cached page is ignored. Only the star-rating post (`action=rate`) still verifies a token: the server requires the exact `saloniresinart.com` hostname (a token made on localhost or a preview host is refused), the fixed `product_rating` action, and the configured score threshold. `doPost?action=partner`, `?action=corporate` and `?action=review` copy only the fields `submitPartnerApplication` / `submitCorporateEnquiry` / `submitReview` read and call them unchanged (for a review that includes the photo count, type and base64 size checks, made before any photo is decoded), so validation, daily caps (`PARTNER_DAILY_ACCEPTANCE_CAP`, `CORPORATE_DAILY_ACCEPTANCE_CAP`, `REVIEW_DAILY_ACCEPTANCE_CAP`, 20 each by default), kill switches (`PARTNER_FORM_DISABLED`, `CORPORATE_FORM_DISABLED`, `REVIEWS_DISABLED`), lock and replay checks are the same, and they are what protects these forms: pause one with its kill switch if it is abused; a bad body answers `{ok:false,error:"invalid"}` and a failed save `{ok:false,error:"unconfirmed"}`. Order requests no longer use reCAPTCHA, to make sending faster: `submitOrder` does not ask for or verify a token. `doPost?action=order` only rebuilds the form object from the JSON body (known fields only, and the base64 image is size-checked before it is decoded) and then calls the unchanged `submitOrder`; a bad body answers `{ok:false,error:"invalid"}` and a failed save `{ok:false,error:"unconfirmed"}`, which the page shows as "unable to confirm… your entries are still here". The daily cap (`DAILY_ACCEPTANCE_CAP`), the request-ID replay check, and the `ORDER_FORM_DISABLED` kill switch still protect the order form, so set `ORDER_FORM_DISABLED=true` if it is abused. A form opened directly at the Apps Script URL cannot bypass this website-origin check. Keep the folder restricted; the deployment must allow the page to embed it because the code sets `XFrameOptionsMode.ALLOWALL`.
4. In the Apps Script editor, enable the **Drive API** advanced service so retention can permanently remove files. Run `installRetentionTrigger()` once as the deployment owner after authorization; it installs one daily trigger. Keep the configured deployed `/exec` URL in `index.html`, publish the GitHub Pages change, and keep production intake paused during deployment. First prove anonymous embedded writes with isolated test Sheet and Drive resources. Then enable production briefly for an authorized acceptance check; confirm the expected Sheet row and, when attached, the restricted Drive file, or immediately pause intake again if it fails.

For backend, Pages, or CAPTCHA configuration changes, set `ORDER_FORM_DISABLED=true` first and keep production paused through the change. Deploy backend compatibility first, then Pages, then use isolated test resources to prove the anonymous embedded flow (render, CAPTCHA, Sheet, and restricted Drive behavior). Enable production only briefly for the authorized acceptance check, confirm the expected row and file, and immediately pause intake again if it fails. Keep the 90-day retention trigger active during a pause, deployment, or rollback.

The form validates quantity, text lengths, independent feet-and-inch dimensions up to 60 inches (including `3 ft × 4 ft` and mixed legacy seeds), JPG/PNG signatures, and a 5 MB file limit. It uses a script lock and request ID plus payload fingerprint for safe retries. A request acknowledgement means only that the request was received; Saloni still confirms the design, price, delivery, and production.

Requests and uploaded images are scheduled for deletion after 90 days. Customers can request correction or deletion through Instagram `@saloniresin_art_studio` or phone `8209238541`.

### Order alerts

When a new order is saved, Saloni gets a WhatsApp message (free CallMeBot API) and a backup email. Alerts run after the order is saved and the script lock is released; if WhatsApp or email fails, the order and the customer's confirmation are not affected. Replays, validation failures, and paused or full intake send nothing.

1. Get a CallMeBot key: send "I allow callmebot to send me messages" to the CallMeBot WhatsApp number from the instructions at callmebot.com, and CallMeBot replies with an API key.
2. In **Project Settings → Script properties**, set `WHATSAPP_CALLMEBOT_KEY` to that key. Optional: `WHATSAPP_CALLMEBOT_PHONE` (default `918209238541`, country code first, no `+`) and `ORDER_ALERT_EMAIL` (default: the script owner's email). With no key, WhatsApp is skipped and email still goes out.
3. In the Apps Script editor choose `testOrderAlerts` in the Run menu → Run → approve the permission prompt; a TEST WhatsApp and email should arrive. It only works when the owner runs it from the editor.

#### Faster orders: alerts sent by a 1-minute trigger

By default the alert is sent while the shopper waits. To answer the shopper straight away, the alert can be queued and sent by a time-driven trigger within about 1 minute:

1. After deploying, open the Apps Script editor, choose `setupOrderAlertQueue` in the Run menu and run it once as the owner. Approve the permission prompt (triggers, send email, external requests). It installs one trigger (every minute, no duplicates) and then sets the script property `ORDER_ALERT_QUEUE_READY=true`. Until then, deploying the code changes nothing.
2. Each new order is saved first; its alert is stored as a script property named `ORDER_ALERT_Q_<request id>`. The trigger `sendQueuedOrderAlerts_` sends the oldest first and deletes each one after the email was accepted. Replays queue nothing.
3. Switch back: set `ORDER_ALERT_QUEUE_READY` to anything other than `true` (or delete it). New orders then send alerts immediately again. Leave the trigger in place so alerts already queued still go out.
4. Safe fallbacks: if the property cannot be written, or 31 or more alerts are already waiting (the trigger is probably broken), that order sends its alert immediately.
5. Trade-off: a failed email is retried every minute, up to 5 tries, then logged ("Gave up on order alert ...") and dropped; the order is always in the Orders sheet. A mail quota error keeps the alerts and retries next minute without counting a try. If the script stops after the email is sent but before the property is deleted, that one email may repeat. WhatsApp is best effort and sent once.
6. Privacy: while an alert waits, the customer's name, phone, email, address and design notes sit in an owner-only script property. It is deleted as soon as the alert is sent (or given up), so it is normally there for about a minute. The reference image is never copied, only its Drive file id.

The WhatsApp text passes through a third party, so it has only the product, quantity, the customer's first name, "Pickup in Ajmer" or the city, a short request code, and the Orders sheet link. It never has the phone, email, address, or design notes; the email has the full details.

### Corporate Gifting setup, migration, and rollback

`setupCorporateGifting()` is owner-only and idempotent. It creates the fixed `Corporate Enquiries` tab, validates the exact allowlisted columns, protects the full tab, and sets `CORPORATE_PROGRAM_CONFIGURED=true` only after those checks pass. Public submissions never create a tab. Keep the corporate tab in the private spreadsheet and leave `CORPORATE_FORM_DISABLED=true` until an isolated embedded submission and read-back are proven.

Corporate enquiry rows contain only the stated business fields, consent, status, staff notes, and a payload fingerprint. The existing daily retention trigger removes rows after 90 days, including while corporate intake is paused. Do not migrate order or Partner Circle rows into this tab. There are no uploads, payment records, employee lists, or Partner Circle commission fields in this flow.

The Corporate Gifting form is always shown (the old `data-intake-ready` flag is gone). If `setupCorporateGifting()` has not been run, or `CORPORATE_FORM_DISABLED` is set, the server refuses and the page says it could not send or that enquiries are paused, so run the setup and prove one isolated enquiry before publishing.

For rollback, pause the corporate page/intake with `CORPORATE_FORM_DISABLED=true` and keep a backend that can run the corporate 90-day retention cleanup while any corporate rows remain. Do **not** restore or deploy a backend that lacks corporate retention, and do not delete or overwrite the tab with an older Sheet copy. Keep the retention-capable backend until every corporate row has expired or been deliberately deleted, then re-run the setup/readiness check before re-enabling intake.

## Customer reviews

The Reviews page (`reviews/index.html`) is the write-a-review page: the form is built into the page (`reviews/index.html` markup, `public-forms.js`, and the `#review-form` rules in `styles.css`), so it opens at once and only Submit talks to Google (see "In-page review form release note"). Published reviews are listed on the home page. A review is about the studio in general (`productId = "studio"`) or one catalogue product. Reviews go live with no pre-approval. Each review may carry up to 3 photos: the form shrinks every photo to a JPEG of at most 1 MB (originals up to 15 MB are accepted for shrinking), the server checks the JPEG signature, size, and that no Exif or XMP data remains, and files go to their own Drive folder.

The product list is `reviews/products.json`. The server reads it from `https://saloniresinart.com/reviews/products.json` (cached 6 hours), so a new catalogue card needs a new entry in that file; `tests/test_site.py` prints the expected JSON when the file drifts from the cards in `index.html`.

### Quick ratings

Each product popup on the home page has a "Rate this piece" row of stars. A tap posts `action=rate` (product ID, 1–5 rating, rating ID and a reCAPTCHA token with action `product_rating`) to the same `/exec` URL. The server checks the product against `reviews/products.json`, verifies the captcha, and appends a `Published` row to the `Reviews` tab with no name, comment or photos and the staff note "Quick rating from a product popup". Quick ratings count toward that product's star average (`ratings` in `doGet?action=reviews`) but never appear as review cards or in the Reviews page summary. They have their own daily caps, `RATING_DAILY_ACCEPTANCE_CAP` (default 100 in total) and `RATING_PRODUCT_DAILY_CAP` (default 10 per product), stop with `REVIEWS_DISABLED=true`, and can be hidden like any review by setting Status to `Hidden`. A browser can rate each product once; "Tell us more" opens the Reviews page for a written review. This protection is best-effort (reCAPTCHA score plus caps), so if an average looks wrong, filter the Staff notes column for "Quick rating" and set suspicious rows to `Hidden`. In the reCAPTCHA admin console, keep the key's domain list to saloniresinart.com only.

### Owner setup

1. In Drive, create a new folder such as "Saloni review photos" and keep its sharing **Restricted**. Never reuse the order folder. Copy the folder ID.
2. In **Project Settings → Script properties**, add `REVIEW_PHOTOS_FOLDER_ID=<folder id>` and `REVIEWS_DISABLED=true`. Optionally add `REVIEW_DAILY_ACCEPTANCE_CAP` (the code default is 20). Reviews reuse `ORDER_SHEET_ID`; they do not use reCAPTCHA (`REVIEWS_DISABLED` and the daily cap protect them).
3. Paste the new `Code.gs` (it adds `doPost` `action=review`; keep `ReviewForm.html` for cached pages), save, and note the current deployment version number for rollback.
4. Run `setupReviews()` once as the deployment owner and allow the permissions. Check that the `Reviews` tab has the 13 columns and a Status dropdown (`Published`, `Hidden`, `Removed`). Setup also installs one edit trigger and only then sets `REVIEWS_CONFIGURED=true`.
5. Deploy: **Manage deployments → edit the existing deployment → New version**, execute as you, access Anyone. The `/exec` URL does not change.
6. Open `<exec URL>?action=reviews`. It should show `"ok":true,"intake":"paused"`. After the Pages change is merged, `https://saloniresinart.com/reviews/` shows "No reviews yet" and the paused message.
7. Short acceptance window: set `REVIEW_DAILY_ACCEPTANCE_CAP=1` and `REVIEWS_DISABLED=false`, then post one test review on a phone (name Test, studio, 5 stars, a photo with location data). Check that it shows on the phone and on a desktop (including iPhone Safari), that the Sheet row is `Published` and holds no phone or email, and that the Drive file is in the review folder and has no location data when downloaded.
8. Set the test row Status to `Hidden`. Reload the page: it is gone, and the photo link no longer opens in a private window.
9. Pass: remove the cap property (or set 20) and keep `REVIEWS_DISABLED=false`. Fail: set `REVIEWS_DISABLED=true` and send the result to the developer.

Optional: in the Sheet, **Tools → Notification settings → Any changes** sends an email for each new review.

### Day to day

- Hide a review: set Status to `Hidden`. The page drops it at once (the edit clears the cache) and its photos become private.
- Removal request: set Status to `Removed`. The photo files are permanently deleted and the Photo file IDs cell is emptied. The row stays for your records.
- Spam flood: set `REVIEWS_DISABLED=true` (the page then shows reviews but no form), then set the spam rows to `Hidden`.
- The 90-day order retention never touches the `Reviews` tab or the review photo folder. Reviews stay until you remove them.
- Photos of a `Published` review are public by link (`anyone with the link`); the folder itself stays private.
- Never delete a review row (use `Hidden` or `Removed`), and never move review photos out of the review folder or change `REVIEW_PHOTOS_FOLDER_ID`: the edit trigger only acts on files inside that folder, so a moved photo would stay public by link.

### Rollback

Fast: `REVIEWS_DISABLED=true`, and set unwanted rows to `Hidden`. Code: redeploy the previous Apps Script version (the old `doGet` ignores `action=reviews`, so the page shows its calm message) and revert the Pages change. No data is lost. Caveat: photos stay public by link until a row is `Hidden` or `Removed` under a backend that includes the edit trigger.

## Partner Circle

`partners/index.html` is the public Partner Circle page. It uses the same Apps Script deployment as order requests and posts the built-in form to `?action=partner`. The partner form uses no reCAPTCHA and has its own `PARTNER_FORM_DISABLED`, `PARTNER_DAILY_ACCEPTANCE_CAP`, and application idempotency path. Never collect UPI, bank, identity, password, or payment credentials in the public form.

### Sheet setup and staff workflow

After deploying the backward-compatible Apps Script version, run `setupPartnerProgram()` once as the deployment owner. It accepts the existing 26-column `Orders` tab and appends exactly these 11 columns without rewriting existing values: `Referral code`, `Partner ID`, `Partner name snapshot`, `Final product subtotal`, `Payment status`, `Delivery status`, `Commission rate snapshot`, `Commission amount`, `Commission status`, `Payout batch ID`, and `Payout date`. It creates `Partner Applications`, `Partners`, and `Partner Commissions` with their allowlisted headers using the same configured tab names used by retention. Setup sets `PARTNER_PROGRAM_CONFIGURED=true` only after migration and full-row protections succeed; do not set that property by hand. Rerun only after checking the private-sheet backup and header result.

A new application is approved automatically in the same request: `submitPartnerApplication` creates the Partners row (code = up to 8 letters or digits from the business name plus a 4-character random suffix, rate `0.1`, Status `Active`) and returns the link to the applicant, so there is no manual approval step. The form shows the link at once; if auto-approval fails, the application stays `Pending` and the applicant is told the link will follow. A `Pending` row in `Partner Applications` means auto-approval failed; approve it manually with `approvePartner_()`. A repeat submission of the same application returns the same code and link, and also retries a `Pending` one. `approvePartner_()` is the same logic and stays available as a private editor helper for manual approval (for example a `Pending` application, or a chosen code and rate). The helper assigns an immutable uppercase referral code, stores the request-time commission rate (default `0.1`), and writes the unique link. Pause or close a partner with `pausePartner_()`. Use `correctOrderAttribution_()` only for an audited staff correction with a reason. These helpers are not public `google.script.run` endpoints.

For the monthly ledger pass, enter the final product subtotal, payment status, and delivery status in `Orders`, then run the private `syncOrderCommission_(requestId)` helper. Review the resulting `Partner Commissions` row; when eligible, record `Approved` or `Paid` with its payout batch/date in `Orders` and run the sync again. Totals come only from `Partner Commissions`, not from deleted customer rows. If a Pending record remains after the customer row is deleted, complete it later in the protected ledger with final non-customer business facts and an owner note; never copy customer contact, address, design, upload, or staff-note text into the ledger.

The browser stores the referral code in `sessionStorage` under `saloniReferralCode`. It may also store the selected catalogue item IDs and quantities, plus an optional customer name, phone, fulfilment choice, and delivery address, in `localStorage` for up to 30 days. The contact details are saved only in this browser for up to 30 days after a successful request. No email, date, referral, product/customizer detail, image, CAPTCHA, request ID, result, payment data, cookie, or analytics tracker is stored there. A customer may edit the referral code. The server resolves one active matching row at submission time, records the partner id, display-name snapshot, and rate snapshot, and ignores client-supplied commission or payout values. Unknown, malformed, paused, and closed codes permit a direct order without partner credit; a partner-sheet failure is retryable and does not silently discard attribution.

Eligible commission is 10% of the final product subtotal, excluding shipping, only after staff records `Paid` and `Delivered`. Cancelled, refunded, duplicate, test, self-referred, and void orders earn nothing. Payout review is monthly and manual. Before an attributed order reaches 90-day deletion, the retention trigger verifies one `commission-<request-id>` row in `Partner Commissions`; it stores only allowlisted business fields and retains the source order when ledger persistence is uncertain. Approved, rejected, withdrawn, and closed-partner retention rules are status-specific and do not disable cleanup when intake is paused.

### Partner release and rollback boundary

Use an isolated Sheet, Drive folder, and CAPTCHA deployment for proof. Verify one application, one approved active code, one referred order, one direct order, one eligible paid-and-delivered order, one refunded/void order, and one retention pass before any production migration. Record the Apps Script version, page commit, tab headers, properties, and trigger. Deploy the compatible backend first, migrate the private Sheet, prove isolated flows, then publish Pages. If referred data exists, keep the new retention-safe backend even when restoring the old Pages; do not redeploy the old 26-column retention blindly or restore a stale Sheet copy over new obligations. Live migration, production acceptance, and payout remain separate approval gates.

### Deployment rollback

Before publishing an update, note the current Apps Script deployment version and the GitHub Pages commit. If the new form has a problem, keep `ORDER_FORM_DISABLED=true`, pause partner intake/referrals/applications, and restore only the previous Pages commit or deployment URL while retaining the new retention-safe Apps Script backend. Do not point the backend at the old 26-column implementation once any referred order, application, commission obligation, or payout history exists: that backend can discard fields needed for retention and reconciliation. An old backend rollback is safe only before any referred data exists and after a verified private-sheet backup. Confirm the form renders and that no new row is accepted during the pause. Keep the retention trigger active; do not delete the Sheet or Drive folder or restore a stale Sheet backup over newer obligations during rollback. Recheck the parent-origin CAPTCHA configuration and anonymous embedded proof before re-enabling intake.

## Search Console handoff

After the custom domain is deployed, use the existing `saloniresinart.com` property when available. Submit `https://saloniresinart.com/sitemap.xml`, then inspect the homepage and its selected canonical. Keep any issued verification record; do not add a placeholder token to this repository. Search Console indexing and ranking are external outcomes, not build guarantees.

## Content notes

The published gallery uses curated product and process photography supplied with the project. Catalogue cards show regular and festive prices for pictured/base designs. Size, materials, and personalisation can change the final quote; Saloni confirms the final quote. Contact details are the requested phone number and Instagram profile. The studio is based in Ajmer, Rajasthan, ships across India, and accepts order enquiries 24 hours a day.

### AI concept images in the product gallery

After the real photo, a product preview can show AI concept images made with Gemini from that photo (`assets/ai-images/<photo>--<name>.webp`, where `<name>` is a colour such as `royal-blue`, or `styled` for a styled scene). Colour images are labelled with the colour name and ask the buyer to mention it in the order notes. Keep the downloaded JPEGs in git-ignored `work/ai-images/<section>/<photo>--ai-<name>.jpg`. In a scratch virtual environment that has `pillow` (not a site dependency), run `tools/ai_images.py sheet <section>` for contact sheets, list the approved files (one `<section>/<file>.jpg` per line) in a keep file, then run `tools/ai_images.py build <keep file>`. `build` replaces `assets/ai-images/` with exactly those images (webp, long side up to 1100 px, up to 150 KB) and rewrites the `data-ai-images` attributes in `index.html`.

### Product share links

Every catalogue product has its own share link, `https://saloniresinart.com/p/<slug>/`, for example `/p/jewel-glow-tealight/`. WhatsApp, Facebook and X build link previews from crawlers that run no JavaScript, so each link is a small static page (`p/<slug>/index.html`) with that product's own photo, name, price and size in its Open Graph tags. A visitor who opens it is sent straight to `/?product=<slug>#<section>`, where `script.js` opens that product's popup (an unknown slug just shows the normal home page). The popup has a **Share** button: it uses the phone's share sheet when there is one, otherwise it offers Share on WhatsApp and Copy link.

The pages, the `data-product-slug` on each card's photo link in `index.html`, and the product entries in `sitemap.xml` are generated. After you add, rename or remove a catalogue card (or change its photo, price, size or description line), run these two steps and commit the result:

```
/tmp/share-venv/bin/python tools/share_images.py   # preview JPEGs in assets/share/<slug>.jpg
python3 tools/product_pages.py                     # pages, data-product-slug and sitemap.xml
```

The preview image of every product is a JPEG (WhatsApp shows these most reliably): RGB on white, progressive, quality 80 or a little lower to stay under 250 KB, the photo's own shape (never cropped), shortest side at least 600 px and longest at most 1200 px. `share_images.py` needs Pillow, which is not a site dependency, so use a scratch virtual environment (`python3 -m venv /tmp/share-venv && /tmp/share-venv/bin/pip install pillow`); it only reads the photos in `assets/` and deletes share images of products that no longer exist. `product_pages.py` needs only Python 3, no extra packages, and reads each JPEG's width and height for the `og:image:width`/`height` tags. The slug comes from the product name (`Jewel Glow Tealight` becomes `jewel-glow-tealight`); if two names give the same slug, the later card gets a 4-letter suffix. Renaming a product changes its slug, so links already shared for the old name stop working; avoid renaming a product that has been shared. `python3 -m unittest discover -s tests` fails with "run python3 tools/product_pages.py" when the pages are out of step with `index.html`, so a stale page or share image cannot be published by accident (the test also fails for a share image with no product). `reviews/products.json` is separate and still follows the card photo file name.

## In-page order form release note

Release order: deploy the Apps Script version that adds `doPost` `action=order` and `action=referral` first (the old pages keep working through `action=seed`), then publish Pages. Acceptance: on a phone, add a product to the cart and press Order now (the form must appear at once with no request to `script.google.com`), send one request to isolated test Sheet and Drive resources, and confirm the row, the restricted Drive file for an image, and the alert. Rollback: restore the previous Pages commit; the new Apps Script actions are harmless to old pages. Cache version `20261161` is shared by every page, so all pages pick up `order-form.js`, `script.js` and `styles.css` together.

## In-page Partner Circle and Corporate forms release note

Release order: deploy the Apps Script version that adds `doPost` `action=partner` and `action=corporate` first (cached old pages keep working through `action=seed`), then merge and publish Pages. Acceptance on a phone: open `/partners/` and `/corporate-gifting/`, confirm the form is on screen with no request to `script.google.com`, `google.com` or `gstatic.com` until Submit; submit one clearly marked test application and one test enquiry, confirm the Sheet rows, the referral link for the partner, and that the 30-second and failure messages keep the entries. Rollback: restore the previous Pages commit; the new actions are harmless to old pages. Cache version `20261161` is shared by every page, so all pages pick up `public-forms.js`, `order-form.js`, `script.js` and `styles.css` together.

## In-page review form release note

Release order: deploy the Apps Script version that adds `doPost` `action=review` first (cached old pages keep working through `action=seed` and `ReviewForm.html`), then merge and publish Pages. Acceptance on a phone: open `/reviews/` (the form must be on screen at once with no request to `script.google.com`, `google.com` or `gstatic.com` until Submit), post one clearly marked test review with and without a photo, and confirm the `Reviews` row, the restricted Drive photo, and that the review shows on the home page; hide the test row afterwards (Status `Hidden`). Also check `/reviews/?product=<id>&rating=4` preselects the piece and stars, and that a first name saved from an earlier order is filled in. New reviews paused with `REVIEWS_DISABLED=true` now show "New reviews are paused right now" when someone presses Submit, instead of when the page opens. Rollback: restore the previous Pages commit; the new action is harmless to old pages. Cache version `20261164` (bumped when reCAPTCHA was removed from the Partner Circle, Corporate and Review forms) is shared by every page, so all pages pick up `public-forms.js`, `order-form.js`, `script.js` and `styles.css` together.

## My orders: Cancel order release note

Each order in **My orders** has a **Cancel order** button. It only **asks** Saloni to cancel; nothing is cancelled, refunded or deleted automatically. Flow: Cancel order, then a small confirm ("Ask Saloni to cancel this order?"), then the page posts `{requestId}` as text/plain JSON to the same `/exec` URL as the order form (`?action=cancel`). On success the order shows "Cancellation requested — Saloni will confirm" and the browser remembers it (`cancelRequestedAt` in the stored entry, so the button does not come back). On any failure (network error, non-JSON answer, `ok:false`) the button stays and the shopper sees "Could not send the request. Please try again or call/WhatsApp Saloni." The "Remove these from this device" button and the line "Orders are saved only in this browser for 30 days." were removed; the 30-day expiry itself is unchanged.

What the server does (`requestOrderCancellation_` in `apps-script/Code.gs`): under the same script lock as order intake it finds the `Orders` row by Request ID, sets `Status` to `Cancellation requested`, appends a dated line to `Staff notes` ("Customer asked to cancel on 11 Nov 2026, 05:40 PM IST via My orders"), and, after the lock is released, emails `ORDER_ALERT_EMAIL` (default: the script owner) with the subject "Cancellation request: <product> – <first name>". No other column is changed. `Status` is only changed when it is still `New request` or blank: if Saloni already set another status (Confirmed, In progress, Dispatched, Cancelled, ...) it is kept, and the request is still logged in `Staff notes` and emailed with the current status in the subject. A repeat request answers `{ok:true, already:true}` and sends no second email; an unknown ID answers `{ok:false, error:"not_found"}`; a bad ID, `{error:"invalid"}`. The reply never contains customer data. The request ID is a random UUID known only to the shopper's browser, and that is the whole credential, so nobody else can ask to cancel an order they have not seen. Staff then decide: contact the shopper and change `Status` yourself when the order is really cancelled (or back to a normal status if the shopper changes their mind).

Kill switch: set the script property `ORDER_CANCEL_DISABLED=true` to pause cancellation requests (the reply is `{ok:false, error:"paused"}` and the page shows the failure message with the phone and WhatsApp hint). It is separate from `ORDER_FORM_DISABLED`: cancellation requests keep working while new orders are paused.

Release order: **deploy the new Apps Script version first** (Deploy, Manage deployments, edit the existing deployment, New version, so the `/exec` URL stays the same), then merge and publish Pages. Pages published first would show a Cancel order button that always fails. Acceptance: place one clearly marked test order, open My orders, press Cancel order, confirm, then check the `Orders` row (Status and Staff notes) and the email; press it again after reloading and confirm there is no second email. Rollback: restore the previous Pages commit (the old page simply has no button); the extra Apps Script action is harmless to old pages. Cache version `20261165` is shared by every page, so all pages pick up `my-orders.js` and `styles.css` together.

## My orders: live order status release note

**My orders** now shows where each order is, read from the `Status` column of the `Orders` sheet that Saloni already updates by hand. When the dialog opens, the page asks the same `/exec` URL (`?action=status`, text/plain JSON `{requestIds:[...]}`, at most 50 IDs) once for all remembered orders, and at most once a minute. The server (`statusFromPost_` in `apps-script/Code.gs`) reads the sheet once, takes no lock, writes nothing, and answers `{ok:true, statuses:{<requestId>: <code>}}` only for IDs it finds. It never returns the Status words, `Staff notes` or any customer data, only one of eight fixed codes. The browser stores the code and the check time (`status`, `statusCheckedAt`) on each remembered order, so the last known status still shows before the answer arrives, after a reload, and when the check fails (no error is shown).

Status words Saloni can type in the `Status` column (not case-sensitive; spaces at the ends are ignored), and what the shopper sees:

| Type in the sheet | Code | Shopper sees |
|---|---|---|
| (blank), `New request` | `received` | Request sent — Saloni will contact you to confirm |
| `Confirmed`, `Accepted` | `confirmed` | Confirmed by Saloni |
| `In progress`, `Making`, `In making`, `Preparing` | `in_progress` | Being made |
| `Ready`, `Ready for pickup` | `ready` | Ready to ship (pickup orders: Ready for pickup in Ajmer) |
| `Dispatched`, `Shipped`, `Out for delivery` | `dispatched` | Dispatched |
| `Delivered`, `Completed`, `Picked up` | `delivered` | Delivered (pickup orders: Picked up) |
| `Cancellation requested` (set by the Cancel order button) | `cancel_requested` | Cancellation requested — Saloni will confirm |
| `Cancellation declined` (text with both `cancel` and `declined`) | `cancel_declined` | Confirmed — your cancellation request was declined. Contact Saloni if you have questions. |
| any text containing `cancel` (`Cancelled`, `Canceled`, ...) | `cancelled` | Cancelled |
| anything else (including `Test` and Saloni's own notes) | `in_progress` | Being made |

So Saloni's own wording stays private: a status she words differently reads as "Being made". The **Cancel order** button is shown only while the order reads "Request sent" or "Confirmed by Saloni" and no cancellation was requested; for every other status it is hidden. After a successful cancel request the order reads "Cancellation requested" while the sheet still says `New request`, `Confirmed` or `Cancellation requested`. **To decline a cancellation request, type `Cancellation declined` in `Status`** (this is checked before the word `cancel`, so it never reads as Cancelled; a plain `Declined`, `Order declined` or `Rejected` means the order was turned down and reads as Cancelled); the shopper then sees the declined message and the Cancel order button stays hidden. After that Saloni can move the order on as usual (`In progress`, `Ready`, `Dispatched`, ...): every status other than those three shows as it is, so for a shopper who asked to cancel, `In progress` or `Cancelled` also replaces "Cancellation requested". The sheet is the source of truth: a shopper who is offline sees the last status this browser saw.

Kill switch: set the script property `ORDER_STATUS_DISABLED=true` to pause status checks (the reply is `{ok:false, error:"paused"}`; pages quietly keep each order's last known status). It is separate from `ORDER_CANCEL_DISABLED` and `ORDER_FORM_DISABLED`.

Release order: **deploy the new Apps Script version first** (Deploy, Manage deployments, edit the existing deployment, New version, so the `/exec` URL stays the same), then merge and publish Pages. Pages published first would still work: the check fails quietly and orders keep showing "Request sent". Acceptance: place one clearly marked test order, open My orders (it reads "Request sent"), type `Confirmed` in its `Status` cell, reopen My orders after a minute and check it reads "Confirmed by Saloni"; try `Shipped` (Cancel order disappears). Rollback: restore the previous Pages commit (old pages simply never ask); the extra Apps Script action is harmless to old pages. Cache version `20261167` is shared by every page.
