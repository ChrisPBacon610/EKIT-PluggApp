# Tentaplugg

Revision sites for university courses: a compendium, drill questions with a
mock-exam mode, flashcards and figures for each course. The front page lists
the courses; each opens in its own study view.

- **IDSV Tentaplugg** (`idsv.html`) — the original IDSV app, unchanged: 448
  questions, 244 flashcards, mock exams built from past papers and a Python
  primer.
- **Courses made with Tentaplugg Studio** (`course.html`) — one file per course
  in the `courses` folder, opened in a shared study view.

It is a plain static site. There is no build step, no server, no database and
no accounts.

## Adding a course

1. Build the course in **Tentaplugg Studio** (the artifact in Claude), open it
   and press **Export for website**. You get a file like `my-course.json`.
2. In this repository open the **`courses`** folder → **Add file** →
   **Upload files**, drop the file in and press **Commit changes**.
3. Wait a few minutes. The course appears on the front page by itself.

To update a course, export it again and upload the file with the same name:
GitHub replaces it.

The front page finds new course files through GitHub's public listing of the
`courses` folder. On a host other than GitHub Pages, also add the file to
`courses/courses.json`, following the entries already there.

Anyone can also study a course without it being on the site: **Open a course
file** on the front page keeps it on that device only.

## Progress

- Progress stays in each person's own browser. Nobody sees anyone else's.
- IDSV: Drill → Options → Sync devices → *Save my progress to a file*, then load
  that file on the other device.
- Studio courses: **Save progress** and **Load progress** in the top bar do the
  same. Files are merged, newest mark per question winning.

## Offline and installing

On the first visit the browser stores the site, so afterwards it opens instantly
and works with no signal. Course files are checked for a newer version whenever
there is a connection. On a phone, *Add to Home Screen* installs it with its own
icon.

## A note on sharing it publicly

The material is condensed from course slides, course books and question sheets.
That is fine to pass around a cohort that already has access to it; publishing
it as a public, indexed website is a different thing. The site ships with
`robots.txt` and `noindex` tags so search engines leave it alone, but a GitHub
Pages address on a free account is still reachable by anyone who has the link.

## Files

| | |
|---|---|
| `index.html` | the front page: the course list |
| `idsv.html` | the IDSV app (markup, styles and logic) |
| `questions.js`, `context.js`, `flashcards.js`, `compendium.js`, `python.js`, `fig/` | IDSV's content |
| `course.html`, `app/` | the study view for Studio courses, and the front page's scripts |
| `app/katex.min.js` | draws formulas in Studio courses ([KaTeX](https://katex.org), MIT licence), kept here so they work offline |
| `courses/` | one `.json` file per Studio course, plus `courses.json` listing them |
| `sw.js` | the offline cache for the whole site |
