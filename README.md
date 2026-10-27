# Resume Builder

THIS PROJECT IS 90% VIBE CODED

A frontend for rendercv resume generation, so I can track performance of different versions of my resume, which 'fragments' do poorly, etc.
if I'm going to be applying to a billion jobs I might as well get fun data out of it.

- **Backend:** ASP.NET Core 10 minimal API, EF Core + SQLite, YamlDotNet
- **Frontend:** React 19 + TypeScript (Vite), TanStack Query, dnd-kit
- **Rendering:** the `rendercv` CLI (Typst under the hood)


## Running it

You need the .NET 10 SDK, Node 22+, and `rendercv` 2.x on your `PATH`.
On Nix, `nix-shell` (or `nix develop`) provides all three.

```sh
nix-shell          # optional, provides dotnet + node + rendercv
./start.sh         # builds the UI and serves everything at http://localhost:5180
./dev.sh           # hot reload: API on :5180, Vite on http://localhost:5173
```

The first start creates the database. Then go to **Profile → Import** and paste an existing
rendercv YAML file, or start adding fragments in **Fragments**.


## Features

**Fragment library**
- All nine rendercv entry types: experience, education, project/normal, publication,
  one-line (`Label: details`), text paragraph, bullet, numbered, reverse-numbered.
- Type-aware editor with a live "as rendered" preview, date validation, and highlight
  editing with reordering and paste-a-bulleted-list.
- Tags, private notes, pinning (pinned fragments seed every new resume), archiving,
  duplicating a fragment as a variant, usage counts, search and filters.
- Import an existing rendercv YAML. Every entry becomes a fragment, and optionally a resume
  with the same layout is created.

**Resume builder**
- Three panes: library, layout, live preview. The preview re-renders through rendercv
  within about a second of every change and is cached by content hash.
- **Page budget.** Set a target page count. The app measures how full each rendered page is
  and shows "room for about N more lines" or "over by N lines". Library cards show each
  fragment's estimated height and whether it still fits.
- Drag to reorder sections and entries, rename sections, and move entries between sections.
- Per-resume highlight selection: include only the bullets that matter for this job.
- **Tailor for this resume only.** Override a fragment's text without touching the library.
- Headline override per resume, notes, clone, YAML download, sort entries newest first.
- Autosave (and Ctrl+S).
- Design: all nine themes, page size, font, body size, margins, line spacing, alignment,
  accent colour, footer and "last updated" toggles, profile photo, 22 locales, rendercv bold
  keywords (one click to add the job's keywords), plus raw design YAML for anything else.
- Clear errors. rendercv validation output is shown verbatim, and mixed entry types in one
  section are flagged before rendering.

**Jobs**
- Company, role, URL, location, salary, contact, deadline, notes, and the full posting.
- Status pipeline (saved, applied, interviewing, offer, accepted, rejected, withdrawn,
  ghosted) with a timeline of every change. Table and board views.
- Offline keyword extraction from the posting. It ranks your fragments by match, shows a
  coverage score in the builder, and suggests unused fragments that mention missing terms.

**Versions viewer**
- Every generated PDF grouped by the job it was used for, with thumbnails, search and a
  status filter.
- View the PDF inline, page images, a plain-text rendering for pasting into application
  forms, and the frozen rendercv YAML. Download PDF, YAML or Markdown.
- **Mark submitted** records exactly which PDF was sent, and moves the job to Applied.
- Compare any two versions side by side, or as a YAML line diff.
- Branch a new resume from any version's exact layout.

**Data**
- Full backup zip with a consistent database snapshot, every PDF and your photo.
- Export and import the fragment library and jobs as JSON.
- Light and dark themes.


## How it works

A resume stores a layout: an ordered list of sections, each holding references to library
fragments plus per-resume highlight choices and overrides. `CvYamlBuilder` combines the
layout with your profile and the current fragments into a rendercv YAML document, and
`RenderCvService` runs `rendercv render` in a scratch folder.

For previews the footer is turned off. It sits in the bottom margin, so pagination is
unchanged, and `PngInspector` can find the last line of ink on each page image to compute
how full it is. Generating a version renders the PDF, PNGs, Markdown and Typst into
`data/versions/<id>/` and freezes the YAML and layout, so later library edits never change
what you sent.


## Project layout

```
backend/    ASP.NET Core API (Endpoints/, Services/, Data/, Models/)
frontend/   React app (pages/, components/, lib/)
tests/      xUnit tests
```
