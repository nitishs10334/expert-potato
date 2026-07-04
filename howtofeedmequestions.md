# How To Feed Questions To This Renderer

Create examination papers as JSON files and place them inside the `papers/` folder. Refresh the browser after adding files.

The JSON file is the complete description of the paper. The renderer should not need code changes when you add new papers.

## Minimal Paper Format

```json
{
  "schemaVersion": "1.0",
  "id": "paper-001",
  "title": "Practice Paper 001",
  "subtitle": "Optional subtitle",
  "durationMinutes": 90,
  "language": "English",
  "tags": ["practice"],
  "metadata": {
    "exam": "Any exam name",
    "year": 2026
  },
  "instructions": [
    "Read all questions carefully.",
    "Progress is saved locally."
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
      "questions": [
        {
          "id": "q1",
          "displayNumber": "1",
          "type": "single",
          "metadata": {
            "subject": "Mathematics",
            "topic": "Percentages",
            "difficulty": "easy",
            "questionType": "Single Correct MCQ"
          },
          "text": "What is 25% of 200?",
          "options": [
            {"id": "A", "text": "25"},
            {"id": "B", "text": "50"},
            {"id": "C", "text": "75"},
            {"id": "D", "text": "100"}
          ],
          "answer": "B",
          "explanation": "25% of 200 is 50."
        }
      ]
    }
  ]
}
```

## Required Fields

Paper:
- `id`: unique paper id.
- `title`: paper title.
- `durationMinutes`: total duration.
- `sections`: array of sections.

Section:
- `id`: unique section id.
- `title`: section title.
- `questions`: array of questions.

Question:
- `id`: unique question id.
- `type`: question type.
- `text`: question text.
- `answer`: correct answer key.

## Supported Question Types

### Single Correct MCQ

```json
{
  "id": "q1",
  "displayNumber": "1",
  "type": "single",
  "text": "Question text?",
  "options": [
    {"id": "A", "text": "Option A"},
    {"id": "B", "text": "Option B"}
  ],
  "answer": "A",
  "explanation": "Why A is correct."
}
```

### Multiple Correct MCQ

```json
{
  "id": "q2",
  "displayNumber": "2",
  "type": "multiple",
  "text": "Select all correct options.",
  "options": [
    {"id": "A", "text": "Option A"},
    {"id": "B", "text": "Option B"},
    {"id": "C", "text": "Option C"}
  ],
  "answer": ["A", "C"],
  "explanation": "A and C are correct."
}
```

### Numerical Answer

```json
{
  "id": "q3",
  "displayNumber": "3",
  "type": "numerical",
  "text": "Enter the value of 12.5 + 7.5.",
  "answer": 20,
  "tolerance": 0,
  "explanation": "12.5 + 7.5 = 20."
}
```

Use `tolerance` when small decimal variation is acceptable.

### Fill In The Blank

```json
{
  "id": "q4",
  "displayNumber": "4",
  "type": "fill",
  "text": "The capital of France is ____.",
  "answer": "Paris",
  "explanation": "Paris is the capital of France."
}
```

### Paragraph Question

```json
{
  "id": "q5",
  "displayNumber": "5",
  "type": "paragraph",
  "passage": "Passage text goes here.",
  "text": "Question based on the passage?",
  "options": [
    {"id": "A", "text": "Option A"},
    {"id": "B", "text": "Option B"}
  ],
  "answer": "A",
  "explanation": "Explanation."
}
```

### Image Question

Any question type may include `imageUrl`.

```json
{
  "id": "q6",
  "displayNumber": "6",
  "type": "single",
  "imageUrl": "images/question-6.png",
  "text": "What does the image show?",
  "options": [
    {"id": "A", "text": "Option A"},
    {"id": "B", "text": "Option B"}
  ],
  "answer": "B"
}
```

Store image files in a path reachable from the paper JSON, for example `papers/images/question-6.png`.

### Figure Placeholder Question

```json
{
  "id": "q7",
  "displayNumber": "7",
  "type": "figure",
  "figure": {
    "label": "Figure 1",
    "description": "Diagram placeholder description."
  },
  "text": "Question about the figure?",
  "options": [
    {"id": "A", "text": "Option A"},
    {"id": "B", "text": "Option B"}
  ],
  "answer": "A"
}
```

## Metadata For Analytics

Put analytics labels inside each question’s `metadata`.

```json
"metadata": {
  "subject": "Reasoning",
  "topic": "Coding-Decoding",
  "difficulty": "medium",
  "questionType": "Single Correct MCQ"
}
```

Then choose which metadata fields to analyze:

```json
"analytics": {
  "groupBy": ["section", "subject", "topic", "difficulty"]
}
```

`section` is built in. All other group names must exist inside `question.metadata`.

## Per-Question Marks

Use paper-level marking for the whole paper:

```json
"marking": {
  "correct": 1,
  "incorrect": -0.25,
  "unattempted": 0
}
```

Override marks for one question with `scoring`:

```json
"scoring": {
  "correct": 2,
  "incorrect": -0.5,
  "unattempted": 0
}
```

## Adding Papers

Save the file as:

```text
papers/my-paper.json
```

If using `python3 -m http.server`, refresh the browser and the paper should appear automatically.

If your server does not show directory listings, add the filename to:

```text
papers/manifest.json
```

Example:

```json
[
  "my-paper.json"
]
```

## Important Rules

- Use unique `id` values for every paper, section, and question.
- Keep `answer` format matched to `type`.
- Use `displayNumber` for the number the student should see.
- Put exam-specific labels only in `metadata`, never in code.
- Do not include `paper.schema.json` or `manifest.json` as papers.
- The full schema is in `papers/paper.schema.json`.
