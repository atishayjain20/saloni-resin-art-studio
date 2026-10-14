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
node --check script.js
```

The tests check the required sections, exact contact links, local asset references, image metadata, and progressive carousel hooks.

## GitHub Pages

1. Push this directory to a GitHub repository.
2. In **Settings → Pages**, choose **Deploy from a branch**.
3. Select the `main` branch and the `/ (root)` folder, then save.

The site uses relative asset paths and includes `.nojekyll`, so it works under a project subpath without a build step. The `work/` source folder is intentionally ignored and is not part of the published site.

If GitHub Pages fails after building the site artifact, merge a fresh commit into `main` to start a new deployment run.

## Content notes

The published gallery uses curated product and process photography supplied with the project. Contact details are limited to the requested phone number and Instagram profile; no prices, shipping promises, reviews, or location claims are made.
