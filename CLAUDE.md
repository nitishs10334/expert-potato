# Project Boundaries & Rules for Guess Paper Generation

This document outlines the scope, rules, and boundaries for generating the 5 guess papers for the IISc Administrative Assistant (AA) exam.

---

## 1. Directory Access Permissions

You are authorized to read and write only in the specified directories.

*   **READ-ONLY (Context Files)**:
    *   `2023/` - Contains the 2023 syllabus, exam blueprint, and raw exam paper.
    *   `2026/` - Contains the 2026 syllabus.
    *   `papers/paper.schema.json` - Contains the schema definition for all mock test papers.
*   **READ & WRITE (Output Files)**:
    *   `papers/` - You should **ONLY** create new guess paper JSON files here (e.g. `papers/iisc-aa-guess-01.json`).
    *   `papers/manifest.json` - You must add the new guess paper filenames to this array.
*   **DO NOT TOUCH (Unnecessary Folders)**:
    *   `assets/` - Contains website logic and styling (`app.js`, `styles.css`). Do not modify these.
    *   `index.html` - Main portal entry page. Do not modify.
    *   `verify_json.py` - Validation script. Do not modify.
    *   `Start_Portal.bat` & `INSTRUCTIONS.txt` - Windows launcher files. Do not modify.

---

## 2. Exam Blueprint & Layout Rules

Each generated guess paper must strictly match the IISc AA recruitment exam layout.

*   **Total Questions**: Exactly 80 questions.
*   **Duration**: 90 minutes.
*   **Marking Scheme**: `+1` for correct answers, `-0.33333` for incorrect answers, `0` for unattempted.
*   **Section Question Counts**:
    1.  `Quantitative Ability`: Exactly 16 questions (IDs: `q1` to `q16`)
    2.  `Verbal Ability`: Exactly 16 questions (IDs: `q17` to `q32`; must include exactly one 3-question reading comprehension passage)
    3.  `Logical and Numerical Reasoning`: Exactly 22 questions (IDs: `q33` to `q54`)
    4.  `General Awareness`: Exactly 16 questions (IDs: `q55` to `q70`)
    5.  `Knowledge in Computer Applications`: Exactly 10 questions (IDs: `q71` to `q80`)

---

## 3. Question Formats & Types

*   `single`: MCQ with options list. `answer` is a string matching an option id (e.g., `"B"`).
*   `multiple`: MCQ with options list. `answer` is an array of strings (e.g., `["A", "C"]`).
*   `numerical`: Fill-in number. `answer` is a raw number (e.g., `25.5`). No options list.
*   `fill`: Fill-in text. `answer` is a raw string (e.g., `"transitory"`). No options list.
*   `paragraph`: A question type containing a `passage` text string.
*   **Figure Placeholders (Leaving Space)**:
    For logical reasoning questions requiring visual diagrams (e.g., dice, mirror images, folding), leave space by formatting them as unscored placeholders:
    *   `type`: `"figure"`
    *   `options`: `[]`
    *   `answer`: `null`
    *   `figure`: `{ "label": "Figure Label", "description": "Short description of what the visual question is about" }`
    *   `scoring`: `{ "correct": 0, "incorrect": 0, "unattempted": 0, "partial": false }`

---

## 4. Token-Efficiency Formatting

*   Format all output JSON using **2-space indentation** to reduce token size.
*   Do not duplicate section names, question types, or estimated times inside each question's `metadata` block. Only include `topic` and `difficulty` in question metadata.
*   Keep question text, option texts, and explanation text concise. Limit explanations to a single, brief sentence.
