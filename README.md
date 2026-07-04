# Offline Examination JSON Renderer

This project is a local renderer for examination JSON. It is not tied to Administrative Assistant, SSC, Quant, English, or any other examination domain. The paper JSON is the public API. The portal loads that API, renders what it describes, records attempts locally, evaluates answers from the supplied answer key, and shows analytics from supplied metadata.

## Run

```bash
python3 -m http.server 8080
```

Open:

```text
http://localhost:8080
```

The app runs without internet. Attempts, imported papers, and settings are stored in browser `localStorage`.

## Paper Discovery

Preferred workflow:

1. Save generated paper JSON files in `papers/`.
2. Refresh the browser.

When served by `python3 -m http.server`, the app reads the `papers/` directory listing and loads every `.json` file except reserved API files:

- `manifest.json`
- `paper.schema.json`

Fallback workflow:

If your static server does not expose directory listings, add paper filenames to `papers/manifest.json`:

```json
[
  "paper-001.json",
  "paper-002.json"
]
```

You can also use `Import JSON` in the UI. Imported papers are persisted in browser storage.

## JSON Is The API

Schema file:

```text
papers/paper.schema.json
```

Minimum paper:

```json
{
  "schemaVersion": "1.0",
  "id": "paper-001",
  "title": "Generated Practice Paper 001",
  "subtitle": "Any optional display subtitle",
  "version": "2026.07.04",
  "durationMinutes": 90,
  "language": "English",
  "tags": ["generated", "practice"],
  "metadata": {
    "exam": "Any Exam Name",
    "year": 2026,
    "source": "AI generated"
  },
  "instructions": [
    "Read each question carefully.",
    "Progress is saved locally on this device."
  ],
  "marking": {
    "correct": 1,
    "incorrect": -0.25,
    "unattempted": 0,
    "partial": false
  },
  "analytics": {
    "groupBy": ["section", "subject", "topic", "difficulty", "questionType"]
  },
  "sections": [
    {
      "id": "section-a",
      "title": "Section A",
      "durationMinutes": 45,
      "metadata": {
        "subject": "Any Subject"
      },
      "questions": [
        {
          "id": "q1",
          "displayNumber": "1",
          "type": "single",
          "metadata": {
            "subject": "Any Subject",
            "topic": "Any Topic",
            "difficulty": "medium",
            "questionType": "Single Correct MCQ"
          },
          "text": "Question text.",
          "options": [
            {"id": "A", "text": "Option A"},
            {"id": "B", "text": "Option B"}
          ],
          "answer": "A",
          "explanation": "Explanation shown after submission."
        }
      ]
    }
  ]
}
```

## Supported Question Types

`single`
- Renders radio options.
- `answer` is one option id.

`multiple`
- Renders checkbox options.
- `answer` is an array of option ids.

`numerical`
- Renders text input.
- `answer` is numeric.
- Optional `tolerance` is absolute numeric tolerance.

`fill`
- Renders text input.
- `answer` is matched as normalized text.

`paragraph`
- Renders `passage` above the question.
- Currently scored like an option/text question depending on supplied fields.

`figure`
- Renders a figure placeholder from `figure.label` and `figure.description`.
- Can also use `imageUrl` for actual images.

Any question type may include `imageUrl`.

## Data-Driven Analytics

Analytics dimensions are controlled by:

```json
"analytics": {
  "groupBy": ["section", "topic", "difficulty"]
}
```

`section` groups by section title. Every other value is read from `question.metadata`.

Example:

```json
{
  "analytics": {
    "groupBy": ["section", "chapter", "cognitiveLevel"]
  }
}
```

Each question should then contain:

```json
"metadata": {
  "chapter": "Linear Equations",
  "cognitiveLevel": "application"
}
```

If `analytics.groupBy` is omitted, the renderer groups by `section` and every metadata key it finds on questions.

## Scoring

Paper-level scoring:

```json
"marking": {
  "correct": 1,
  "incorrect": -0.25,
  "unattempted": 0,
  "partial": false
}
```

Question-level override:

```json
"scoring": {
  "correct": 2,
  "incorrect": -0.5,
  "unattempted": 0
}
```

Partial marking is declared in the API but not implemented yet.

## Current Renderer Contract

The portal should not need code changes for new papers if those papers use the public schema and supported question types. Add JSON files to `papers/`, refresh, and take the exam.
