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
node --test tests/customizer.test.cjs tests/apps-script.test.cjs tests/order-flow.test.cjs tests/form-flow.test.cjs tests/partner-referral.test.cjs tests/reviews.test.cjs
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

The published page embeds the HTMLService order form in `apps-script/Form.html`, the Partner Circle page embeds `apps-script/PartnerForm.html`, the Corporate Gifting page embeds `apps-script/CorporateForm.html`, and the Reviews page embeds `apps-script/ReviewForm.html`. These pages send a normal `POST` to the configured Apps Script `/exec` URL with `action=seed`, a bounded `mode`, and a JSON `seed`; they do not use Tally, email, payments, accounts, or cross-origin `fetch`. The Apps Script `doGet` and `doPost` handlers only render a bounded order, partner, corporate, or review template, with one exception: `doGet?action=reviews` is the only public read endpoint and returns the allowlisted fields of `Published` customer reviews (see Customer reviews). `submitOrder`, `submitPartnerApplication`, `submitCorporateEnquiry`, and `submitReview` are the public write paths, and corporate enquiries write only to the private `Corporate Enquiries` tab.

### Production setup (studio owner)

1. Create or open the private Sheet and a restricted Drive folder. Put the Apps Script files in a standalone Apps Script project.
2. In **Project Settings → Script properties**, configure `ORDER_SHEET_ID`, `ORDER_SHEET_TAB`, `ORDER_DRIVE_FOLDER_ID`, `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET`, `CAPTCHA_MIN_SCORE` (a finite value from 0 to 1), `DAILY_ACCEPTANCE_CAP` (the code default is 50), `PARTNER_SHEET_ID` (normally the same private spreadsheet), optional `PARTNER_APPLICATIONS_SHEET_TAB`, `PARTNERS_SHEET_TAB`, and `PARTNER_COMMISSIONS_SHEET_TAB`, `PARTNER_DAILY_ACCEPTANCE_CAP`, and `PARTNER_FORM_DISABLED`. Corporate Gifting reuses `ORDER_SHEET_ID` and the fixed `Corporate Enquiries` tab; run `setupCorporateGifting()` once as the deployment owner to create, protect, and verify its exact 17-column schema. Set `CORPORATE_FORM_DISABLED=true` to pause only corporate intake, and use `CORPORATE_DAILY_ACCEPTANCE_CAP` to override the default of 20. The public reCAPTCHA v3 site key must be registered for `saloniresinart.com` with Google's domain validation enabled. Set `ORDER_FORM_DISABLED=true`, `PARTNER_FORM_DISABLED=true`, or `CORPORATE_FORM_DISABLED=true` to pause an intake path, and keep the CAPTCHA secret out of this repository.
3. Deploy a web app that executes as the studio owner. The static site at `https://saloniresinart.com` loads reCAPTCHA v3 in the parent page and passes one token through a nonce-bound `MessageChannel`; the iframe cannot create a token itself. The server requires the exact `saloniresinart.com` hostname, the fixed `order_request`, `partner_application`, or `corporate_enquiry` action selected by the page mode, and the configured score threshold. A form opened directly at the Apps Script URL cannot bypass this website-origin check. Keep the folder restricted; the deployment must allow the page to embed it because the code sets `XFrameOptionsMode.ALLOWALL`.
4. In the Apps Script editor, enable the **Drive API** advanced service so retention can permanently remove files. Run `installRetentionTrigger()` once as the deployment owner after authorization; it installs one daily trigger. Keep the configured deployed `/exec` URL in `index.html`, publish the GitHub Pages change, and keep production intake paused during deployment. First prove anonymous embedded writes with isolated test Sheet and Drive resources. Then enable production briefly for an authorized acceptance check; confirm the expected Sheet row and, when attached, the restricted Drive file, or immediately pause intake again if it fails.

For backend, Pages, or CAPTCHA configuration changes, set `ORDER_FORM_DISABLED=true` first and keep production paused through the change. Deploy backend compatibility first, then Pages, then use isolated test resources to prove the anonymous embedded flow (render, CAPTCHA, Sheet, and restricted Drive behavior). Enable production only briefly for the authorized acceptance check, confirm the expected row and file, and immediately pause intake again if it fails. Keep the 90-day retention trigger active during a pause, deployment, or rollback.

The form validates quantity, text lengths, independent feet-and-inch dimensions up to 60 inches (including `3 ft × 4 ft` and mixed legacy seeds), JPG/PNG signatures, and a 5 MB file limit. It uses a script lock and request ID plus payload fingerprint for safe retries. A request acknowledgement means only that the request was received; Saloni still confirms the design, price, delivery, and production.

Requests and uploaded images are scheduled for deletion after 90 days. Customers can request correction or deletion through Instagram `@saloniresin_art_studio` or phone `8209238541`.

### Corporate Gifting setup, migration, and rollback

`setupCorporateGifting()` is owner-only and idempotent. It creates the fixed `Corporate Enquiries` tab, validates the exact allowlisted columns, protects the full tab, and sets `CORPORATE_PROGRAM_CONFIGURED=true` only after those checks pass. Public submissions never create a tab. Keep the corporate tab in the private spreadsheet and leave `CORPORATE_FORM_DISABLED=true` until an isolated embedded submission and read-back are proven.

Corporate enquiry rows contain only the stated business fields, consent, status, staff notes, and a payload fingerprint. The existing daily retention trigger removes rows after 90 days, including while corporate intake is paused. Do not migrate order or Partner Circle rows into this tab. There are no uploads, payment records, employee lists, or Partner Circle commission fields in this flow.

The Corporate Gifting page stays at `data-intake-ready="false"` while the published page is ahead of the unchanged production Apps Script. Deploy the compatible Apps Script, run `setupCorporateGifting()`, prove isolated embedded rendering/CAPTCHA/Sheet read-back, and only then flip the page flag to `true` in the same release. Until then, the page does not load an iframe or submit a seed and directs current large-order enquiries to Saloni's phone and Instagram.

For rollback, pause the corporate page/intake with `CORPORATE_FORM_DISABLED=true` and keep a backend that can run the corporate 90-day retention cleanup while any corporate rows remain. Do **not** restore or deploy a backend that lacks corporate retention, and do not delete or overwrite the tab with an older Sheet copy. Keep the retention-capable backend until every corporate row has expired or been deliberately deleted, then re-run the setup/readiness check before re-enabling intake.

## Customer reviews

The Reviews page (`reviews/index.html`) lists customer reviews and, when the backend says intake is open, embeds `apps-script/ReviewForm.html`. A review is about the studio in general (`productId = "studio"`) or one catalogue product. Reviews go live with no pre-approval. Each review may carry up to 3 photos: the form shrinks every photo to a JPEG of at most 1 MB (originals up to 15 MB are accepted for shrinking), the server checks the JPEG signature, size, and that no Exif or XMP data remains, and files go to their own Drive folder.

The product list is `reviews/products.json`. The server reads it from `https://saloniresinart.com/reviews/products.json` (cached 6 hours), so a new catalogue card needs a new entry in that file; `tests/test_site.py` prints the expected JSON when the file drifts from the cards in `index.html`.

### Owner setup

1. In Drive, create a new folder such as "Saloni review photos" and keep its sharing **Restricted**. Never reuse the order folder. Copy the folder ID.
2. In **Project Settings → Script properties**, add `REVIEW_PHOTOS_FOLDER_ID=<folder id>` and `REVIEWS_DISABLED=true`. Optionally add `REVIEW_DAILY_ACCEPTANCE_CAP` (the code default is 20). Reviews reuse `ORDER_SHEET_ID` and the `CAPTCHA_*` properties; the reCAPTCHA action is `review_submission`.
3. Paste the new `Code.gs`, add `ReviewForm.html`, save, and note the current deployment version number for rollback.
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

`partners/index.html` is the public Partner Circle page. It uses the same embedded Apps Script deployment as order requests, but sends `mode=partner` and renders `apps-script/PartnerForm.html`. The partner form uses a separate reCAPTCHA action (`partner_application`) and separate `PARTNER_FORM_DISABLED`, `PARTNER_DAILY_ACCEPTANCE_CAP`, and application idempotency path. Never collect UPI, bank, identity, password, or payment credentials in the public form.

### Sheet setup and staff workflow

After deploying the backward-compatible Apps Script version, run `setupPartnerProgram()` once as the deployment owner. It accepts the existing 26-column `Orders` tab and appends exactly these 11 columns without rewriting existing values: `Referral code`, `Partner ID`, `Partner name snapshot`, `Final product subtotal`, `Payment status`, `Delivery status`, `Commission rate snapshot`, `Commission amount`, `Commission status`, `Payout batch ID`, and `Payout date`. It creates `Partner Applications`, `Partners`, and `Partner Commissions` with their allowlisted headers using the same configured tab names used by retention. Setup sets `PARTNER_PROGRAM_CONFIGURED=true` only after migration and full-row protections succeed; do not set that property by hand. Rerun only after checking the private-sheet backup and header result.

Approve applications manually with the private editor helper `approvePartner_()`. The helper assigns an immutable uppercase referral code, stores the request-time commission rate (default `0.05`), and writes the unique link. Pause or close a partner with `pausePartner_()`. Use `correctOrderAttribution_()` only for an audited staff correction with a reason. These helpers are not public `google.script.run` endpoints.

For the monthly ledger pass, enter the final product subtotal, payment status, and delivery status in `Orders`, then run the private `syncOrderCommission_(requestId)` helper. Review the resulting `Partner Commissions` row; when eligible, record `Approved` or `Paid` with its payout batch/date in `Orders` and run the sync again. Totals come only from `Partner Commissions`, not from deleted customer rows. If a Pending record remains after the customer row is deleted, complete it later in the protected ledger with final non-customer business facts and an owner note; never copy customer contact, address, design, upload, or staff-note text into the ledger.

The browser stores the referral code in `sessionStorage` under `saloniReferralCode`. It may also store the selected catalogue item IDs and quantities, plus an optional customer name, phone, fulfilment choice, and delivery address, in `localStorage` for up to 30 days. The contact details are saved only in this browser for up to 30 days after a successful request. No email, date, referral, product/customizer detail, image, CAPTCHA, request ID, result, payment data, cookie, or analytics tracker is stored there. A customer may edit the referral code. The server resolves one active matching row at submission time, records the partner id, display-name snapshot, and rate snapshot, and ignores client-supplied commission or payout values. Unknown, malformed, paused, and closed codes permit a direct order without partner credit; a partner-sheet failure is retryable and does not silently discard attribution.

Eligible commission is 5% of the final product subtotal, excluding shipping, only after staff records `Paid` and `Delivered`. Cancelled, refunded, duplicate, test, self-referred, and void orders earn nothing. Payout review is monthly and manual. Before an attributed order reaches 90-day deletion, the retention trigger verifies one `commission-<request-id>` row in `Partner Commissions`; it stores only allowlisted business fields and retains the source order when ledger persistence is uncertain. Approved, rejected, withdrawn, and closed-partner retention rules are status-specific and do not disable cleanup when intake is paused.

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
