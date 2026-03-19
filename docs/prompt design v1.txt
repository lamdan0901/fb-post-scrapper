# 🧠 Gemini Prompt Design

We’ll structure it into 3 layers:

1. **System Instruction (strict rules)**
2. **Dynamic Context (your settings)**
3. **Post Input**

---

# 1. 🔒 SYSTEM INSTRUCTION (Core Prompt)

This is the **fixed part** — never changes.

```text
You are an AI job classification system.

Your task is to analyze a Facebook post and determine whether it is a relevant job opportunity based on strict rules.

You MUST follow these rules:

1. Output ONLY valid JSON. No explanation, no markdown, no extra text.
2. Always include ALL required fields.
3. If unsure, make the best possible inference from the content.
4. Understand both English and Vietnamese (including mixed language posts).
5. Normalize informal expressions:
   - "2 năm", "2 yrs", "2y" → 2 years
   - "fresher", "junior", "middle", "mid", "2+ years" → infer level
6. Detect job type:
   - Standard job (full-time)
   - Freelance / part-time / project-based

---

### Classification Rules

STEP 1: Detect if this is a job post
- If NOT a job post → is_match = false

STEP 2: Detect if freelance/project-based
- If YES:
  - is_match = true
  - is_freelance = true
  - Skip strict filtering

STEP 3: If standard job → apply filters:

A. Role classification (choose ONE):
- Frontend
- Backend
- Fullstack
- Mobile
- Other

B. Level classification:
- Fresher
- Junior
- Middle
- Senior
- Unknown

C. Years of Experience (YOE):
- Extract number if mentioned
- If not mentioned → null

---

### Matching Logic

A post is considered a MATCH if:
- Role is in allowed roles
AND
- Level is allowed
AND
- YOE ≤ max_yoe (if provided)

If level/YOE is missing but role matches → still MATCH

---

### Scoring (0–100)

Estimate relevance score based on:
- Clear role match (+40)
- Clear level match (+20)
- YOE clarity (+10)
- Keyword relevance (+20)
- Clarity of job description (+10)

---

### Output Format

{
  "is_match": boolean,
  "is_freelance": boolean,
  "role": "Frontend | Backend | Fullstack | Mobile | Other",
  "level": "Fresher | Junior | Middle | Senior | Unknown",
  "yoe": number | null,
  "score": number,
  "reason": "short explanation"
}
```

---

# 2. ⚙️ DYNAMIC CONTEXT (Injected from DB)

This part is **generated per request**.

Example:

```text
### Filtering Criteria

Allowed Roles:
Frontend, Fullstack, Mobile

Allowed Levels:
Fresher, Junior, Middle

Maximum Years of Experience:
5

Notes:
- Reject Senior, Lead, Manager roles
- If YOE > 5 → reject
- If role is Backend only → reject
```

---

# 3. 📥 USER INPUT (Post Content)

```text
### Facebook Post

{POST_CONTENT}
```

---

# ✅ FINAL COMBINED PROMPT

Here’s how it looks when assembled:

```text
[ SYSTEM INSTRUCTION ]

### Filtering Criteria
Allowed Roles:
Frontend, Fullstack, Mobile

Allowed Levels:
Fresher, Junior, Middle

Maximum Years of Experience:
5

### Facebook Post
{POST_CONTENT}
```

---

# ⚠️ CRITICAL IMPLEMENTATION DETAILS

## 1. Force JSON Mode

Even with good prompt, Gemini can still mess up.

👉 You MUST:

* Validate JSON
* Retry if invalid (max 2 times)

---

## 2. Temperature Setting

```ts
temperature: 0.2
```

* Lower = more consistent
* Avoid 0 (too rigid sometimes)

---

## 3. Token Optimization (Cost Control)

Before sending to Gemini:

👉 Trim post content:

* Max ~1500–2000 chars
* Remove:

  * excessive whitespace
  * repeated emojis

---

## 4. Preprocessing (IMPORTANT)

Normalize input:

Examples:

* "ReactJS" → "React"
* "Next.js" → "Nextjs"
* lowercase everything (optional)

---

# 🧪 Example

### Input

```text
Công ty ABC cần tuyển React Developer
Yêu cầu: 1-3 năm kinh nghiệm
Làm việc tại Hà Nội
```

---

### Output

```json
{
  "is_match": true,
  "is_freelance": false,
  "role": "Frontend",
  "level": "Junior",
  "yoe": 2,
  "score": 88,
  "reason": "React frontend role with 1-3 years experience"
}
```
