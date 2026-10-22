# Saloni Resin Art Studio

A buildless, responsive one-page portfolio for Saloni's resin art, personalized gifts, and occasion hampers.

## Preview locally

From this directory, run:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` in a browser. Stop the server with `Ctrl-C`.

## Verify

```sh
python3 -m unittest discover -s tests -v
node --test tests/customizer.test.cjs tests/apps-script.test.cjs tests/order-flow.test.cjs tests/form-flow.test.cjs tests/partner-referral.test.cjs
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

The published page embeds the HTMLService order form in `apps-script/Form.html`, the Partner Circle page embeds `apps-script/PartnerForm.html`, and the Corporate Gifting page embeds `apps-script/CorporateForm.html`. These pages send a normal `POST` to the configured Apps Script `/exec` URL with `action=seed`, a bounded `mode`, and a JSON `seed`; they do not use Tally, email, payments, accounts, or cross-origin `fetch`. The Apps Script `doGet` and `doPost` handlers only render a bounded order, partner, or corporate template. `submitOrder`, `submitPartnerApplication`, and `submitCorporateEnquiry` are the public write paths, and corporate enquiries write only to the private `Corporate Enquiries` tab.

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

For rollback, pause the corporate page/intake with `CORPORATE_FORM_DISABLED=true` and keep a backend that can run the corporate 90-day retention cleanup while any corporate rows remain. Do **not** restore or deploy a backend that lacks corporate retention, and do not delete or overwrite the tab with an older Sheet copy. Keep the retention-capable backend until every corporate row has expired or been deliberately deleted, then re-run the setup/readiness check before re-enabling intake.

## Partner Circle

`partners/index.html` is the public Partner Circle page. It uses the same embedded Apps Script deployment as order requests, but sends `mode=partner` and renders `apps-script/PartnerForm.html`. The partner form uses a separate reCAPTCHA action (`partner_application`) and separate `PARTNER_FORM_DISABLED`, `PARTNER_DAILY_ACCEPTANCE_CAP`, and application idempotency path. Never collect UPI, bank, identity, password, or payment credentials in the public form.

### Sheet setup and staff workflow

After deploying the backward-compatible Apps Script version, run `setupPartnerProgram()` once as the deployment owner. It accepts the existing 26-column `Orders` tab and appends exactly these 11 columns without rewriting existing values: `Referral code`, `Partner ID`, `Partner name snapshot`, `Final product subtotal`, `Payment status`, `Delivery status`, `Commission rate snapshot`, `Commission amount`, `Commission status`, `Payout batch ID`, and `Payout date`. It creates `Partner Applications`, `Partners`, and `Partner Commissions` with their allowlisted headers using the same configured tab names used by retention. Setup sets `PARTNER_PROGRAM_CONFIGURED=true` only after migration and full-row protections succeed; do not set that property by hand. Rerun only after checking the private-sheet backup and header result.

Approve applications manually with the private editor helper `approvePartner_()`. The helper assigns an immutable uppercase referral code, stores the request-time commission rate (default `0.05`), and writes the unique link. Pause or close a partner with `pausePartner_()`. Use `correctOrderAttribution_()` only for an audited staff correction with a reason. These helpers are not public `google.script.run` endpoints.

For the monthly ledger pass, enter the final product subtotal, payment status, and delivery status in `Orders`, then run the private `syncOrderCommission_(requestId)` helper. Review the resulting `Partner Commissions` row; when eligible, record `Approved` or `Paid` with its payout batch/date in `Orders` and run the sync again. Totals come only from `Partner Commissions`, not from deleted customer rows. If a Pending record remains after the customer row is deleted, complete it later in the protected ledger with final non-customer business facts and an owner note; never copy customer contact, address, design, upload, or staff-note text into the ledger.

The browser stores only the referral code in `sessionStorage` under `saloniReferralCode`; it uses no cookie, local storage, contact cache, or analytics tracker. A customer may edit the code. The server resolves one active matching row at submission time, records the partner id, display-name snapshot, and rate snapshot, and ignores client-supplied commission or payout values. Unknown, malformed, paused, and closed codes permit a direct order without partner credit; a partner-sheet failure is retryable and does not silently discard attribution.

Eligible commission is 5% of the final product subtotal, excluding shipping, only after staff records `Paid` and `Delivered`. Cancelled, refunded, duplicate, test, self-referred, and void orders earn nothing. Payout review is monthly and manual. Before an attributed order reaches 90-day deletion, the retention trigger verifies one `commission-<request-id>` row in `Partner Commissions`; it stores only allowlisted business fields and retains the source order when ledger persistence is uncertain. Approved, rejected, withdrawn, and closed-partner retention rules are status-specific and do not disable cleanup when intake is paused.

### Partner release and rollback boundary

Use an isolated Sheet, Drive folder, and CAPTCHA deployment for proof. Verify one application, one approved active code, one referred order, one direct order, one eligible paid-and-delivered order, one refunded/void order, and one retention pass before any production migration. Record the Apps Script version, page commit, tab headers, properties, and trigger. Deploy the compatible backend first, migrate the private Sheet, prove isolated flows, then publish Pages. If referred data exists, keep the new retention-safe backend even when restoring the old Pages; do not redeploy the old 26-column retention blindly or restore a stale Sheet copy over new obligations. Live migration, production acceptance, and payout remain separate approval gates.

### Deployment rollback

Before publishing an update, note the current Apps Script deployment version and the GitHub Pages commit. If the new form has a problem, keep `ORDER_FORM_DISABLED=true`, pause partner intake/referrals/applications, and restore only the previous Pages commit or deployment URL while retaining the new retention-safe Apps Script backend. Do not point the backend at the old 26-column implementation once any referred order, application, commission obligation, or payout history exists: that backend can discard fields needed for retention and reconciliation. An old backend rollback is safe only before any referred data exists and after a verified private-sheet backup. Confirm the form renders and that no new row is accepted during the pause. Keep the retention trigger active; do not delete the Sheet or Drive folder or restore a stale Sheet backup over newer obligations during rollback. Recheck the parent-origin CAPTCHA configuration and anonymous embedded proof before re-enabling intake.

## Search Console handoff

After the custom domain is deployed, use the existing `saloniresinart.com` property when available. Submit `https://saloniresinart.com/sitemap.xml`, then inspect the homepage and its selected canonical. Keep any issued verification record; do not add a placeholder token to this repository. Search Console indexing and ranking are external outcomes, not build guarantees.

## Content notes

The published gallery uses curated product and process photography supplied with the project. Catalogue cards show regular and festive prices for pictured/base designs. Size, materials, and personalisation can change the final quote; Saloni confirms the final quote. Contact details are the requested phone number and Instagram profile. The studio is based in Ajmer, Rajasthan, ships across India, and accepts order enquiries 24 hours a day.
