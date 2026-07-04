import json
import os
import sys

# IISc AA Exam Pattern Constraints
EXPECTED_SECTIONS = [
    {"keywords": ["quant"], "name": "Quantitative Ability", "count": 16},
    {"keywords": ["verbal", "english"], "name": "Verbal Ability", "count": 16},
    {"keywords": ["logical", "reasoning"], "name": "Logical and Numerical Reasoning", "count": 22},
    {"keywords": ["general awareness", "ga", "gk"], "name": "General Awareness", "count": 16},
    {"keywords": ["computer"], "name": "Knowledge in Computer Applications", "count": 10}
]

def find_matching_pattern(section_title):
    title_lower = section_title.lower()
    for pattern in EXPECTED_SECTIONS:
        if any(kw in title_lower for kw in pattern["keywords"]):
            return pattern
    return None

def validate_paper(filepath):
    print(f"Validating: {filepath}")
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"  [ERROR] Failed to parse JSON: {e}")
        return False

    errors = []
    warnings = []

    # Required top-level keys
    required_top = ["id", "title", "durationMinutes", "sections"]
    for k in required_top:
        if k not in data:
            errors.append(f"Missing top-level key: '{k}'")

    if errors:
        for err in errors:
            print(f"  [ERROR] {err}")
        return False

    paper_id = data.get("id")
    duration = data.get("durationMinutes")
    sections = data.get("sections", [])
    metadata = data.get("metadata", {})
    tags = [str(t).lower() for t in data.get("tags", [])]
    filename = os.path.basename(filepath).lower()
    is_practice = "practice" in filename or "sample" in filename or "practice" in tags or "sample" in tags
    exam_name = str(metadata.get("exam", "")).lower()
    is_iisc_aa = ("administrative" in exam_name or "assistant" in exam_name or "iisc" in exam_name or "aa" in exam_name) and not is_practice

    if not isinstance(sections, list):
        print(f"  [ERROR] 'sections' must be a list")
        return False

    if len(sections) == 0:
        print(f"  [ERROR] 'sections' list is empty")
        return False

    section_ids = set()
    question_ids = set()
    total_questions = 0
    section_counts = {}

    for s_idx, sec in enumerate(sections):
        if not isinstance(sec, dict):
            errors.append(f"Section at index {s_idx} is not an object")
            continue
        
        sec_id = sec.get("id")
        sec_title = sec.get("title")
        questions = sec.get("questions", [])

        if not sec_id:
            errors.append(f"Section at index {s_idx} is missing 'id'")
        elif sec_id in section_ids:
            errors.append(f"Duplicate section ID: '{sec_id}'")
        else:
            section_ids.add(sec_id)

        if not sec_title:
            errors.append(f"Section '{sec_id or s_idx}' is missing 'title'")
            sec_title = f"Section {s_idx + 1}"

        if not isinstance(questions, list):
            errors.append(f"Questions in section '{sec_title}' must be a list")
            continue

        section_counts[sec_title] = len(questions)

        for q_idx, q in enumerate(questions):
            total_questions += 1
            if not isinstance(q, dict):
                errors.append(f"Question at index {q_idx} in section '{sec_title}' is not an object")
                continue

            q_id = q.get("id")
            q_type = q.get("type")
            q_text = q.get("text")
            q_ans = q.get("answer")

            if not q_id:
                errors.append(f"Question at index {q_idx} in section '{sec_title}' is missing 'id'")
            elif q_id in question_ids:
                errors.append(f"Duplicate question ID: '{q_id}'")
            else:
                question_ids.add(q_id)

            if not q_type:
                errors.append(f"Question '{q_id or q_idx}' is missing 'type'")
            elif q_type not in ["single", "multiple", "numerical", "fill", "paragraph", "figure"]:
                errors.append(f"Question '{q_id}' has invalid type: '{q_type}'")

            if q_text is None:
                errors.append(f"Question '{q_id}' is missing 'text'")

            if "answer" not in q:
                errors.append(f"Question '{q_id}' has no 'answer' key")

            # Validate options and answer types
            options = q.get("options", [])
            is_skipped = (q_ans is None) and (q.get("scoring", {}).get("correct") == 0)

            if q_type in ["single", "multiple", "paragraph", "figure"] and not is_skipped:
                if not isinstance(options, list) or len(options) == 0:
                    errors.append(f"Question '{q_id}' of type '{q_type}' requires a non-empty 'options' list")
                else:
                    opt_ids = set()
                    for o in options:
                        if not isinstance(o, dict) or "id" not in o or "text" not in o:
                            errors.append(f"Invalid option format in question '{q_id}'")
                        else:
                            opt_ids.add(str(o["id"]))
                    
                    if q_type in ["single", "paragraph", "figure"]:
                        if q_ans is not None and str(q_ans) not in opt_ids:
                            errors.append(f"Question '{q_id}' answer '{q_ans}' is not one of the option IDs: {opt_ids}")
                    elif q_type == "multiple":
                        if not isinstance(q_ans, list):
                            errors.append(f"Question '{q_id}' (multiple) answer must be a list, got {type(q_ans)}")
                        else:
                            for a in q_ans:
                                if str(a) not in opt_ids:
                                    errors.append(f"Question '{q_id}' answer element '{a}' is not in option IDs: {opt_ids}")
            elif q_type == "numerical" and not is_skipped:
                try:
                    if q_ans is not None:
                        float(q_ans)
                except ValueError:
                    errors.append(f"Question '{q_id}' (numerical) answer '{q_ans}' cannot be parsed as a number")
            elif q_type == "fill" and not is_skipped:
                if q_ans is not None and not isinstance(q_ans, str):
                    errors.append(f"Question '{q_id}' (fill) answer must be a string, got {type(q_ans)}")

    # IISc AA Pattern layout check
    if is_iisc_aa:
        print("  [INFO] Detected IISc AA Exam Paper. Validating against blueprint...")
        matched_patterns = set()
        
        # Verify question counts per matched pattern
        for sec_title, q_count in section_counts.items():
            pattern = find_matching_pattern(sec_title)
            if pattern:
                matched_patterns.add(pattern["name"])
                expected = pattern["count"]
                if q_count != expected:
                    errors.append(f"IISc AA Layout Mismatch: Section '{sec_title}' (mapped to '{pattern['name']}') has {q_count} questions. Expected exactly {expected}.")
            else:
                warnings.append(f"Section '{sec_title}' did not map to any expected IISc AA exam section.")

        # Check for missing sections
        for pattern in EXPECTED_SECTIONS:
            if pattern["name"] not in matched_patterns:
                errors.append(f"IISc AA Layout Mismatch: Missing expected section '{pattern['name']}'")

        if duration != 90:
            warnings.append(f"IISc AA duration is usually 90 minutes. This paper has {duration} minutes.")

    # Output Results
    if errors:
        print(f"  [FAILED] Schema or structural validation errors found ({len(errors)} errors):")
        for err in errors:
            print(f"    - {err}")
        if warnings:
            print(f"  [WARNINGS] ({len(warnings)} warnings):")
            for warn in warnings:
                print(f"    - {warn}")
        return False
    else:
        status_str = f"  [SUCCESS] Validated {total_questions} questions across {len(sections)} sections."
        if warnings:
            status_str += f" ({len(warnings)} warnings)"
        print(status_str)
        if warnings:
            for warn in warnings:
                print(f"    - {warn}")
        print("    Section breakdown:")
        for title, count in section_counts.items():
            print(f"      * {title}: {count} questions")
        return True

if __name__ == "__main__":
    papers_dir = "papers"
    manifest_path = os.path.join(papers_dir, "manifest.json")
    
    if not os.path.exists(manifest_path):
        print(f"Manifest file '{manifest_path}' not found!")
        sys.exit(1)

    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
    except Exception as e:
        print(f"Failed to parse manifest: {e}")
        sys.exit(1)

    all_ok = True
    for filename in manifest:
        filepath = os.path.join(papers_dir, filename)
        if not os.path.exists(filepath):
            print(f"[ERROR] Paper file listed in manifest does not exist: {filepath}")
            all_ok = False
            continue
        if not validate_paper(filepath):
            all_ok = False
        print("-" * 50)

    if all_ok:
        print("\nAll files in manifest are valid and comply with expectations!")
        sys.exit(0)
    else:
        print("\nSome files have validation or layout errors!")
        sys.exit(1)
