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
node --test tests/customizer.test.cjs tests/apps-script.test.cjs
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
2. In **Project Settings → Script properties**, configure `ORDER_SHEET_ID`, `ORDER_SHEET_TAB`, `ORDER_DRIVE_FOLDER_ID`, `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET`, `CAPTCHA_EXPECTED_HOSTNAME`, and `DAILY_ACCEPTANCE_CAP` (the code default is 50). Set `ORDER_FORM_DISABLED=true` to pause intake. Keep the CAPTCHA secret out of this repository.
3. Deploy a web app that executes as the studio owner. Keep the folder restricted and set `CAPTCHA_EXPECTED_HOSTNAME` to the hostname returned by the deployed HTMLService CAPTCHA verification (often the `script.googleusercontent.com` host), not a value guessed from the static page. The deployment must allow the page to embed it; the code sets `XFrameOptionsMode.ALLOWALL`.
4. Replace `REPLACE_WITH_APPS_SCRIPT_DEPLOYMENT_ID` in `index.html` with the deployed `/exec` URL. Publish the GitHub Pages change and verify a request in the Sheet and, when attached, the restricted Drive folder.

The form validates quantity, text lengths, dimensions after unit conversion (including mixed units and `3 ft × 4 ft`), JPG/PNG signatures, and a 5 MB file limit. It uses a script lock and request ID plus payload fingerprint for safe retries. A request acknowledgement means only that the request was received; Saloni still confirms the design, price, delivery, and production.

Order details and an optional image are stored in Google services for order handling. Retention is configured by the studio rather than promised by this site. Customers can request correction or deletion through Instagram `@saloniresin_art_studio` or phone `8209238541`.

### Deployment rollback

Before publishing an update, note the current Apps Script deployment version and the GitHub Pages commit. If the new form has a problem, point the existing Apps Script deployment back to the previous tested version, set `ORDER_FORM_DISABLED=true` if intake must pause, and restore the previous Pages commit or deployment URL. Confirm the form renders and that no new row is accepted during a deliberate pause. Do not delete the Sheet or Drive folder during rollback.

## Search Console handoff

After the custom domain is deployed, use the existing `saloniresinart.com` property when available. Submit `https://saloniresinart.com/sitemap.xml`, then inspect the homepage and its selected canonical. Keep any issued verification record; do not add a placeholder token to this repository. Search Console indexing and ranking are external outcomes, not build guarantees.

## Content notes

The published gallery uses curated product and process photography supplied with the project. Catalogue cards show regular and festive prices for pictured/base designs. Size, materials, and personalisation can change the final quote; Saloni confirms the final quote. Contact details are the requested phone number and Instagram profile. The studio is based in Ajmer, Rajasthan, ships across India, and accepts order enquiries 24 hours a day.
