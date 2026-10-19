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
node --test tests/customizer.test.cjs tests/apps-script.test.cjs tests/order-flow.test.cjs tests/form-flow.test.cjs
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

The published page embeds the HTMLService form in `apps-script/Form.html`. The page sends a normal `POST` to the configured Apps Script `/exec` URL with `action=seed` and a JSON `seed`; it does not use Tally, email, payments, accounts, or cross-origin `fetch`. The Apps Script `doGet` and `doPost` handlers only render the form. Only `submitOrder` can write to the private Sheet and restricted Drive folder.

### Production setup (studio owner)

1. Create or open the private Sheet and a restricted Drive folder. Put the Apps Script files in a standalone Apps Script project.
2. In **Project Settings → Script properties**, configure `ORDER_SHEET_ID`, `ORDER_SHEET_TAB`, `ORDER_DRIVE_FOLDER_ID`, `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET`, `CAPTCHA_MIN_SCORE` (a finite value from 0 to 1), and `DAILY_ACCEPTANCE_CAP` (the code default is 50). The public reCAPTCHA v3 site key must be registered for `saloniresinart.com` with Google's domain validation enabled. Set `ORDER_FORM_DISABLED=true` to pause intake, and keep the CAPTCHA secret out of this repository.
3. Deploy a web app that executes as the studio owner. The static site at `https://saloniresinart.com` loads reCAPTCHA v3 in the parent page and passes one token through a nonce-bound `MessageChannel`; the iframe cannot create a token itself. The server requires the exact `saloniresinart.com` hostname, `order_request` action, and configured score threshold. A form opened directly at the Apps Script URL cannot bypass this website-origin check. Keep the folder restricted; the deployment must allow the page to embed it because the code sets `XFrameOptionsMode.ALLOWALL`.
4. In the Apps Script editor, enable the **Drive API** advanced service so retention can permanently remove files. Run `installRetentionTrigger()` once as the deployment owner after authorization; it installs one daily trigger. Keep the configured deployed `/exec` URL in `index.html`, publish the GitHub Pages change, and keep production intake paused during deployment. First prove anonymous embedded writes with isolated test Sheet and Drive resources. Then enable production briefly for an authorized acceptance check; confirm the expected Sheet row and, when attached, the restricted Drive file, or immediately pause intake again if it fails.

For backend, Pages, or CAPTCHA configuration changes, set `ORDER_FORM_DISABLED=true` first and keep production paused through the change. Deploy backend compatibility first, then Pages, then use isolated test resources to prove the anonymous embedded flow (render, CAPTCHA, Sheet, and restricted Drive behavior). Enable production only briefly for the authorized acceptance check, confirm the expected row and file, and immediately pause intake again if it fails. Keep the 90-day retention trigger active during a pause, deployment, or rollback.

The form validates quantity, text lengths, independent feet-and-inch dimensions up to 60 inches (including `3 ft × 4 ft` and mixed legacy seeds), JPG/PNG signatures, and a 5 MB file limit. It uses a script lock and request ID plus payload fingerprint for safe retries. A request acknowledgement means only that the request was received; Saloni still confirms the design, price, delivery, and production.

Requests and uploaded images are scheduled for deletion after 90 days. Customers can request correction or deletion through Instagram `@saloniresin_art_studio` or phone `8209238541`.

### Deployment rollback

Before publishing an update, note the current Apps Script deployment version and the GitHub Pages commit. If the new form has a problem, keep `ORDER_FORM_DISABLED=true`, point the existing Apps Script deployment back to the previous tested version, and restore the previous Pages commit or deployment URL. Confirm the form renders and that no new row is accepted during the pause. Keep the retention trigger active; do not delete the Sheet or Drive folder during rollback. Recheck the parent-origin CAPTCHA configuration and anonymous embedded proof before re-enabling intake.

## Search Console handoff

After the custom domain is deployed, use the existing `saloniresinart.com` property when available. Submit `https://saloniresinart.com/sitemap.xml`, then inspect the homepage and its selected canonical. Keep any issued verification record; do not add a placeholder token to this repository. Search Console indexing and ranking are external outcomes, not build guarantees.

## Content notes

The published gallery uses curated product and process photography supplied with the project. Catalogue cards show regular and festive prices for pictured/base designs. Size, materials, and personalisation can change the final quote; Saloni confirms the final quote. Contact details are the requested phone number and Instagram profile. The studio is based in Ajmer, Rajasthan, ships across India, and accepts order enquiries 24 hours a day.
