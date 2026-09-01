  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  // Snapshot of the most recent analysis, used by the "Download PDF Report" button.
  let lastAnalysisData = null;

  // ---- Analysis mode selection state ----
  // Holds the extracted resume text/filename between "upload" and the user
  // picking an analysis type, so the file doesn't need to be re-uploaded.
  let pendingResumeText = null;
  let pendingResumeFilename = null;
  let analysisMode = null; // "ats" | "normal" | null
  let historySavedForCurrentUpload = false;

  // ---------------------------------------------------------------
  // Skill dictionary — includes languages requested: Python, Java, JS
  // ---------------------------------------------------------------
  const SKILL_KEYWORDS = [
    // Programming languages (highlighted as "lang" tags)
    { name: "python", type: "lang" },
    { name: "java", type: "lang" },
    { name: "javascript", type: "lang" },
    { name: "typescript", type: "lang" },
    { name: "c++", type: "lang" },
    { name: "c#", type: "lang" },
    { name: "php", type: "lang" },
    { name: "ruby", type: "lang" },
    { name: "go", type: "lang" },
    { name: "swift", type: "lang" },
    { name: "kotlin", type: "lang" },
    { name: "sql", type: "lang" },
    { name: "html", type: "lang" },
    { name: "css", type: "lang" },
    // Frameworks / libraries
    { name: "react", type: "tool" },
    { name: "angular", type: "tool" },
    { name: "vue", type: "tool" },
    { name: "django", type: "tool" },
    { name: "flask", type: "tool" },
    { name: "spring", type: "tool" },
    { name: "node.js", type: "tool" },
    { name: "express", type: "tool" },
    { name: "bootstrap", type: "tool" },
    { name: "tailwind", type: "tool" },
    { name: "next.js", type: "tool" },
    // Data / AI
    { name: "machine learning", type: "tool" },
    { name: "deep learning", type: "tool" },
    { name: "nlp", type: "tool" },
    { name: "tensorflow", type: "tool" },
    { name: "pytorch", type: "tool" },
    { name: "pandas", type: "tool" },
    { name: "numpy", type: "tool" },
    { name: "data analysis", type: "tool" },
    { name: "data science", type: "tool" },
    // Databases
    { name: "mysql", type: "tool" },
    { name: "postgresql", type: "tool" },
    { name: "mongodb", type: "tool" },
    { name: "firebase", type: "tool" },
    // Cloud / DevOps
    { name: "aws", type: "tool" },
    { name: "azure", type: "tool" },
    { name: "gcp", type: "tool" },
    { name: "docker", type: "tool" },
    { name: "kubernetes", type: "tool" },
    { name: "git", type: "tool" },
    { name: "github", type: "tool" },
    { name: "linux", type: "tool" },
    // Soft / general
    { name: "project management", type: "soft" },
    { name: "communication", type: "soft" },
    { name: "leadership", type: "soft" },
    { name: "teamwork", type: "soft" },
    { name: "problem solving", type: "soft" },
    { name: "agile", type: "soft" },
    { name: "scrum", type: "soft" },
    { name: "excel", type: "soft" },
  ];

  // Extra headers used for section-presence checks (Sections Found / Missing)
  // and to help extractSection() find correct boundaries between sections.
  const SUMMARY_HEADERS = ["summary", "professional summary", "career summary", "profile", "about", "about me", "objective", "career objective"];
  const SKILLS_HEADERS = ["skills", "technical skills", "key skills", "core competencies", "skills & tools"];
  const CERT_HEADERS = ["certifications", "certification", "certifications & achievements", "licenses & certifications", "achievements", "accomplishments"];
  const LEADERSHIP_HEADERS = ["leadership", "activities", "leadership & activities", "leadership/activities", "extracurricular activities", "extra curricular activities", "volunteer experience", "volunteering"];
  const AWARDS_HEADERS = ["awards", "honors", "awards & honors", "honors & awards"];

  const SECTION_HEADERS = {
    experience: ["experience", "work experience", "employment history", "professional experience", "career history"],
    education: ["education", "academic background", "qualifications", "educational qualification", "educational qualifications", "academic qualification", "academic qualifications", "academic details", "education & qualifications"],
    projects: ["projects", "personal projects", "academic projects", "key projects"],
    certifications: CERT_HEADERS,
  };

  const ALL_HEADERS = Object.values(SECTION_HEADERS).flat()
    .concat(SUMMARY_HEADERS, SKILLS_HEADERS, LEADERSHIP_HEADERS, AWARDS_HEADERS);

  // Other common resume section titles that are NOT names, used only to keep
  // extractName() from mistaking a heading like "Certifications & Badges" or
  // "Technical Skills" for the candidate's name.
  const NON_NAME_HEADERS = [
    ...ALL_HEADERS,
    "summary", "objective", "career objective", "profile", "about", "about me",
    "contact", "contact info", "contact information", "personal details",
    "skills", "technical skills", "key skills", "core competencies",
    "certifications", "certification", "certifications & badges", "badges",
    "achievements", "awards", "accomplishments", "languages", "interests",
    "hobbies", "references", "publications", "declaration", "activities",
    "volunteer experience", "extracurricular activities", "curriculum vitae", "resume", "cv",
  ];

  const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const PHONE_RE = /(\+?\d{1,3}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/;
  const LINKEDIN_RE = /(https?:\/\/)?(www\.)?linkedin\.com\/[a-zA-Z0-9_/-]+/;
  const GITHUB_RE = /(https?:\/\/)?(www\.)?github\.com\/[a-zA-Z0-9_/-]+/;

  // Bullet-line prefix characters used to find bullet points across
  // resume templates (hyphen, asterisk, and the common bullet glyphs).
  const BULLET_PREFIX_RE = /^[\s]*[-*•·▪●○‣o]\s+/;

  // Weak / passive openers that read like a job description rather than
  // an achievement. Checked against the start of each bullet line.
  const WEAK_VERB_PHRASES = [
    "responsible for", "in charge of", "duties included", "duties include",
    "worked on", "worked with", "helped with", "helped to", "assisted with",
    "assisted in", "participated in", "involved in", "tasked with",
    "was responsible", "handled", "dealt with", "took part in",
  ];

  // Small stopword list used only to filter noise out of job-description
  // keyword extraction (not a full NLP stopword list, just common filler).
  const JD_STOPWORDS = new Set([
    "the","and","for","with","that","this","from","are","you","your","will",
    "have","has","our","we","a","an","to","of","in","on","or","as","is","be",
    "at","by","it","who","their","they","them","he","she","his","her","its",
    "into","about","across","within","using","use","work","working","team",
    "role","job","years","year","experience","strong","ability","skills",
    "including","etc","looking","candidate","candidates","required","preferred",
    "must","should","can","also","all","any","new","other","such","more",
    "most","company","us","one","two","per","plus","up","out","if","so",
  ]);

  // Common job-title words used only to keep extractName() from mistaking a
  // professional headline (e.g. "Senior Software Engineer") for the name.
  const JOB_TITLE_WORDS = [
    "engineer", "developer", "manager", "analyst", "specialist", "consultant",
    "designer", "director", "intern", "internship", "coordinator", "executive",
    "officer", "administrator", "architect", "scientist", "technician",
    "associate", "assistant", "supervisor", "strategist", "marketer",
    "recruiter", "accountant", "programmer", "freelancer", "founder",
    "representative", "lead", "head", "president",
  ];

  // Checks a single line/segment of resume text and returns it if it looks
  // like a plausible candidate name, or null otherwise. Used both for
  // whole lines and for individual pieces of a combined contact-info line
  // (e.g. "John Doe | john@doe.com | (555) 123-4567").
  function looksLikeCandidateName(segment){
    const seg = (segment || "").trim();
    if (!seg || seg.length > 45) return null;
    if (EMAIL_RE.test(seg) || PHONE_RE.test(seg)) return null;
    if (LINKEDIN_RE.test(seg) || GITHUB_RE.test(seg)) return null;
    if (/\d/.test(seg)) return null;
    if (/@|https?:\/\/|www\./i.test(seg)) return null;
    if (/[&:;/]/.test(seg)) return null; // headings like "Skills:" or "Certifications & Badges"

    const words = seg.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 4) return null;

    // Every word must be shaped like part of a proper name — letters only,
    // optionally with an apostrophe, hyphen, or trailing initial period.
    if (!words.every(w => /^[A-Za-z][A-Za-z'.-]*$/.test(w))) return null;

    const lower = seg.toLowerCase().replace(/[.,]+$/, "").trim();
    if (NON_NAME_HEADERS.some(h => lower === h || lower.startsWith(h + " "))) return null;
    if (JOB_TITLE_WORDS.some(w => lower.split(/\s+/).includes(w))) return null;

    return seg;
  }

  function formatName(seg){
    return seg === seg.toUpperCase()
      ? seg.replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase())
      : seg;
  }

  function extractName(text){
    const rawLines = text.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 20);

    for (const rawLine of rawLines){
      const cleanedLine = rawLine.replace(/[•·▪●○]+/g, " ").replace(/\s+/g, " ").trim();
      const hasContactInfo = EMAIL_RE.test(cleanedLine) || PHONE_RE.test(cleanedLine) ||
        LINKEDIN_RE.test(cleanedLine) || GITHUB_RE.test(cleanedLine);

      if (!hasContactInfo){
        const candidate = looksLikeCandidateName(cleanedLine);
        if (candidate) return formatName(candidate);
      } else {
        // The name is sometimes combined with contact details on one line
        // (e.g. "John Doe | john@doe.com | 555-123-4567" or with a phone
        // number/email/LinkedIn link right next to it). Rather than
        // discarding the whole line — which could miss the only line the
        // name appears on — split on common separators and test each piece
        // on its own so the email/phone/link portion doesn't disqualify
        // the name portion sitting next to it.
        const segments = rawLine.split(/[|•·▪●○]+/).map(s => s.trim()).filter(Boolean);
        for (const seg of segments){
          const candidate = looksLikeCandidateName(seg);
          if (candidate) return formatName(candidate);
        }
      }
    }
    return "Not found";
  }

  function extractSkills(text){
    const lower = text.toLowerCase();
    const found = [];
    for (const skill of SKILL_KEYWORDS){
      const escaped = skill.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("\\b" + escaped + "\\b", "i");
      if (re.test(lower)) found.push(skill);
    }
    return found;
  }

  function extractSection(lines, key){
    const targetHeaders = SECTION_HEADERS[key];
    const isHeaderLine = (clean, headers) =>
      headers.some(h => clean === h || clean.startsWith(h + " ") || clean.startsWith(h + ":") || clean.startsWith(h + "-"));

    let startIdx = -1;
    for (let i = 0; i < lines.length; i++){
      const clean = lines[i].trim().toLowerCase().replace(/[:\-–—]+$/, "").trim();
      if (isHeaderLine(clean, targetHeaders)){ startIdx = i + 1; break; }
    }
    if (startIdx === -1) return "";
    const collected = [];
    for (let i = startIdx; i < lines.length; i++){
      const clean = lines[i].trim().toLowerCase().replace(/[:\-–—]+$/, "").trim();
      if (isHeaderLine(clean, ALL_HEADERS)) break;
      collected.push(lines[i]);
    }
    return collected.join("\n").trim();
  }

  function estimateExperienceYears(text){
    const matches = [...text.toLowerCase().matchAll(/(\d+)\+?\s*(?:years|yrs)/g)];
    const years = matches.map(m => parseInt(m[1], 10)).filter(y => y < 50);
    return years.length ? Math.max(...years) : null;
  }

  // Pulls out lines that look like bullet points (resume achievement lines),
  // whether they start with a bullet glyph or just read like a short
  // sentence inside the Experience/Projects sections.
  function getBulletLines(text){
    return text.split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0 && BULLET_PREFIX_RE.test(l))
      .map(l => l.replace(BULLET_PREFIX_RE, "").trim());
  }

  // Flags bullets that open with weak/passive phrasing instead of a strong
  // action verb (e.g. "Responsible for managing..." vs "Managed...").
  function findWeakVerbBullets(bullets){
    const found = [];
    bullets.forEach(line => {
      const lower = line.toLowerCase();
      for (const phrase of WEAK_VERB_PHRASES){
        if (lower.startsWith(phrase) || lower.includes(" " + phrase)){
          found.push({ phrase, line });
          break;
        }
      }
    });
    return found;
  }

  // Counts how many bullets contain a quantified result (a number, percent,
  // or currency amount) vs how many don't.
  function analyzeQuantifiedAchievements(bullets){
    const QUANT_RE = /\d|%|\$|₹|€|£/;
    const quantified = bullets.filter(b => QUANT_RE.test(b)).length;
    return { quantified, total: bullets.length };
  }

  // Flags bullets that are near-duplicates of each other (same core wording
  // reused across roles), using simple word-overlap similarity.
  function findDuplicateBullets(bullets){
    const norm = b => new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean));
    const seen = [];
    const duplicates = [];
    for (const bullet of bullets){
      if (bullet.split(/\s+/).length < 4) continue; // skip very short lines
      const words = norm(bullet);
      for (const prior of seen){
        const overlap = [...words].filter(w => prior.words.has(w)).length;
        const similarity = overlap / Math.max(words.size, prior.words.size);
        if (similarity >= 0.75){
          duplicates.push(bullet);
          break;
        }
      }
      seen.push({ text: bullet, words });
    }
    return duplicates;
  }

  // Extracts candidate keywords from a pasted job description: known skill
  // keywords get priority, then the most frequent non-stopword terms fill
  // in the rest, up to a reasonable cap for display.
  function extractJDKeywords(jdText, maxKeywords){
    const lower = jdText.toLowerCase();
    const keywords = [];

    SKILL_KEYWORDS.forEach(skill => {
      const escaped = skill.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("\\b" + escaped + "\\b", "i");
      if (re.test(lower)) keywords.push(skill.name);
    });

    const wordCounts = {};
    (lower.match(/[a-z][a-z+.#-]{2,}/g) || []).forEach(w => {
      if (JD_STOPWORDS.has(w) || keywords.includes(w)) return;
      wordCounts[w] = (wordCounts[w] || 0) + 1;
    });
    const frequent = Object.entries(wordCounts)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([w]) => w);

    for (const w of frequent){
      if (keywords.length >= maxKeywords) break;
      keywords.push(w);
    }
    return keywords.slice(0, maxKeywords);
  }

  // Compares resume text against job-description keywords and returns
  // which ones the resume already has vs which are missing.
  function matchAgainstJD(resumeText, jdText){
    const keywords = extractJDKeywords(jdText, 20);
    const resumeLower = resumeText.toLowerCase();
    const matched = [], missing = [];
    keywords.forEach(kw => {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("\\b" + escaped + "\\b", "i");
      (re.test(resumeLower) ? matched : missing).push(kw);
    });
    const ratio = keywords.length ? matched.length / keywords.length : null;
    return { matched, missing, ratio };
  }

  // Checks whether any line in the resume matches one of the given section
  // headers (used for the Sections Found / Missing Sections check).
  function hasSectionHeader(lines, headers){
    return lines.some(l => {
      const clean = l.trim().toLowerCase().replace(/[:\-–—]+$/, "").trim();
      return headers.some(h => clean === h || clean.startsWith(h + " ") || clean.startsWith(h + ":") || clean.startsWith(h + "-"));
    });
  }

  // Common "expected" keywords for tech/AI-leaning roles, used for the
  // "Missing Common Keywords" panel and folded into Keyword Coverage.
  const COMMON_TARGET_KEYWORDS = [
    "TensorFlow", "PyTorch", "Deep Learning", "Machine Learning", "Model Deployment",
    "AWS", "GCP", "Azure", "SQL", "Docker", "Kubernetes", "API Development",
    "NLP", "CI/CD", "Agile", "REST API", "Data Structures", "Algorithms",
  ];

  function findMissingCommonKeywords(text){
    const lower = text.toLowerCase();
    return COMMON_TARGET_KEYWORDS.filter(kw => {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("\\b" + escaped + "\\b", "i");
      return !re.test(lower);
    });
  }

  // Overused resume clichés / vague buzzwords, flagged for the reader to
  // replace with something more specific.
  const BUZZWORDS = [
    { re: /\bai\b/i, label: "AI" },
    { re: /\bresponsive\b/i, label: "responsive" },
    { re: /\bcurrently learning\b/i, label: "currently learning" },
    { re: /\bteam player\b/i, label: "team player" },
    { re: /\bhard[- ]working\b/i, label: "hard-working" },
    { re: /\bdetail[- ]oriented\b/i, label: "detail-oriented" },
    { re: /\bresults[- ]driven\b/i, label: "results-driven" },
    { re: /\bgo[- ]getter\b/i, label: "go-getter" },
    { re: /\bself[- ]starter\b/i, label: "self-starter" },
    { re: /\bfast[- ]paced\b/i, label: "fast-paced" },
    { re: /\bsynergy\b/i, label: "synergy" },
    { re: /\bpassionate\b/i, label: "passionate" },
    { re: /\bdynamic\b/i, label: "dynamic" },
    { re: /\bproactive\b/i, label: "proactive" },
    { re: /\bthink outside the box\b/i, label: "think outside the box" },
    { re: /\bexcellent communication\b/i, label: "excellent communication" },
  ];

  function findBuzzwords(text){
    return BUZZWORDS.filter(b => b.re.test(text)).map(b => b.label);
  }

  // Counts total occurrences (not just presence) of every SKILL_KEYWORDS
  // entry, split into the four Keywords Analysis columns.
  function analyzeKeywordCategories(text){
    const lower = text.toLowerCase();
    const cols = { lang: [], tool: [], soft: [] };
    SKILL_KEYWORDS.forEach(skill => {
      const escaped = skill.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("\\b" + escaped + "\\b", "gi");
      const count = (lower.match(re) || []).length;
      if (count > 0) cols[skill.type].push({ name: skill.name, count });
    });
    Object.keys(cols).forEach(k => cols[k].sort((a, b) => b.count - a.count));
    return cols;
  }

  // Extracts likely "domain terms" — acronyms and repeated Title Case
  // phrases — that aren't already part of the fixed skill dictionary.
  function extractDomainTerms(text, skipLines){
    const skillNamesLower = new Set(SKILL_KEYWORDS.map(s => s.name.toLowerCase()));
    const scanText = text.split("\n").slice(skipLines || 0).join("\n");

    const counts = {};
    (scanText.match(/\b[A-Z]{2,6}\b/g) || []).forEach(a => {
      if (skillNamesLower.has(a.toLowerCase())) return;
      counts[a] = (counts[a] || 0) + 1;
    });

    const phraseRe = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,3})\b/g;
    let m;
    while ((m = phraseRe.exec(scanText))){
      const phrase = m[1];
      if (skillNamesLower.has(phrase.toLowerCase())) continue;
      counts[phrase] = (counts[phrase] || 0) + 1;
    }

    const seen = new Map();
    Object.entries(counts).forEach(([name, count]) => {
      const key = name.toLowerCase();
      if (!seen.has(key) || seen.get(key).count < count) seen.set(key, { name, count });
    });
    return [...seen.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }

  function countSyllables(word){
    word = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!word) return 0;
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  function computeReadability(text){
    const sentences = text.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.split(/\s+/).filter(Boolean).length > 2);
    const words = text.split(/\s+/).filter(Boolean);
    const sentenceCount = Math.max(sentences.length, 1);
    const wordCount = Math.max(words.length, 1);
    const avgSentenceLength = Math.round((wordCount / sentenceCount) * 10) / 10;
    const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);
    const gradeLevel = Math.max(0, Math.round((0.39 * (wordCount / sentenceCount) + 11.8 * (syllableCount / wordCount) - 15.59) * 10) / 10);
    return { avgSentenceLength, gradeLevel };
  }

  // Classifies a metric value against a target [min,max] range into
  // On Track / Could Improve / Needs Work, with a symmetric tolerance band.
  function classifyMetric(value, min, max){
    const range = max - min;
    const margin = range || 1;
    if (value >= min && value <= max) return { label: "On Track", cls: "ok" };
    if ((value >= min - margin && value < min) || (value > max && value <= max + margin)) return { label: "Could Improve", cls: "warn" };
    return { label: "Needs Work", cls: "bad" };
  }

  function renderMetricBox(container, label, value, displayValue, min, max, scaleMax, caption){
    const badge = classifyMetric(value, min, max);
    const bandLeft = Math.max(0, Math.min(100, (min / scaleMax) * 100));
    const bandWidth = Math.max(0, Math.min(100 - bandLeft, ((max - min) / scaleMax) * 100));
    const markerPos = Math.max(1, Math.min(99, (value / scaleMax) * 100));
    const box = document.createElement("div");
    box.className = "metric-box";
    box.innerHTML = `
      <div class="metric-box-label">${label}</div>
      <div class="metric-box-value">${displayValue}</div>
      <div class="metric-track">
        <div class="metric-band" style="left:${bandLeft}%; width:${bandWidth}%;"></div>
        <div class="metric-marker" style="left:${markerPos}%;"></div>
      </div>
      <div class="metric-badge ${badge.cls}">${badge.label}</div>
      <div class="metric-caption">${caption}</div>
    `;
    container.appendChild(box);
  }

  function renderScoreItem(container, label, pct){
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    const item = document.createElement("div");
    item.innerHTML = `
      <div class="score-item-head"><span class="score-label">${label}</span><span class="score-pct">${pct}%</span></div>
      <div class="score-bar-track"><div class="score-bar-fill" style="width:${pct}%;"></div></div>
    `;
    container.appendChild(item);
  }

  function renderSectionPill(container, label, found){
    const pill = document.createElement("span");
    pill.className = "section-pill " + (found ? "found" : "missing");
    pill.innerHTML = (found ? "✓" : "!") + " " + label;
    container.appendChild(pill);
  }

  function renderKwColumn(container, items){
    container.innerHTML = "";
    if (!items.length){
      container.innerHTML = "<div class='kw-empty'>None detected.</div>";
      return;
    }
    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "kw-row";
      row.innerHTML = `<span class="kw-name">${item.name}</span><span class="kw-count">${item.count}</span>`;
      container.appendChild(row);
    });
  }

  function analyzeText(text, filename){
    const lines = text.split("\n");
    const name = extractName(text);
    const emailMatch = text.match(EMAIL_RE);
    const phoneMatch = text.match(PHONE_RE);
    const linkedinMatch = text.match(LINKEDIN_RE);
    const githubMatch = text.match(GITHUB_RE);
    const skills = extractSkills(text);
    const experience = extractSection(lines, "experience");
    const education = extractSection(lines, "education");
    const projects = extractSection(lines, "projects");
    const certifications = extractSection(lines, "certifications");
    const years = estimateExperienceYears(text);
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

    document.getElementById("fileTag").textContent = "Source file: " + filename;
    document.getElementById("fName").textContent = name;
    document.getElementById("fEmail").textContent = emailMatch ? emailMatch[0] : "Not found";
    document.getElementById("fPhone").textContent = (phoneMatch && phoneMatch[0].replace(/\D/g,"").length >= 7) ? phoneMatch[0] : "Not found";

    const linkedinEl = document.getElementById("fLinkedin");
    if (linkedinMatch){ linkedinEl.innerHTML = `<a href="https://${linkedinMatch[0].replace(/^https?:\/\//,'')}" target="_blank">${linkedinMatch[0]}</a>`; }
    else { linkedinEl.textContent = "Not found"; }

    const githubEl = document.getElementById("fGithub");
    if (githubMatch){ githubEl.innerHTML = `<a href="https://${githubMatch[0].replace(/^https?:\/\//,'')}" target="_blank">${githubMatch[0]}</a>`; }
    else { githubEl.textContent = "Not found"; }

    document.getElementById("sSkills").textContent = skills.length;
    document.getElementById("sExp").textContent = years ? years + "+" : "—";
    document.getElementById("sWords").textContent = wordCount;

    const tagWrap = document.getElementById("skillTags");
    tagWrap.innerHTML = "";
    if (skills.length){
      skills.forEach(s => {
        const span = document.createElement("span");
        span.className = "tag " + s.type; // lang | tool | soft — each has its own color
        span.textContent = s.name;
        tagWrap.appendChild(span);
      });
    } else {
      tagWrap.innerHTML = "<span style='font-family:var(--mono);font-size:13px;color:#888;'>No matching skills found.</span>";
    }

    // ---- Resume Content Overview: a clean, human-readable summary of ----
    // ---- everything we were able to detect in the uploaded resume.   ----
    const coPersonalEl = document.getElementById("coPersonal");
    const personalRows = [
      ["Name", name !== "Not found" ? name : null],
      ["Email", emailMatch ? emailMatch[0] : null],
      ["Phone", (phoneMatch && phoneMatch[0].replace(/\D/g,"").length >= 7) ? phoneMatch[0] : null],
      ["LinkedIn", linkedinMatch ? linkedinMatch[0] : null],
      ["GitHub", githubMatch ? githubMatch[0] : null],
    ];
    coPersonalEl.innerHTML = personalRows.map(([label, value]) =>
      `<div class="co-personal-row"><span class="co-k">${label}</span><span class="co-v">${value ? value : '<span class="co-empty">Not found</span>'}</span></div>`
    ).join("");

    const coSkillsEl = document.getElementById("coSkills");
    if (skills.length){
      coSkillsEl.innerHTML = `<div class="tags">${skills.map(s => `<span class="tag ${s.type}">${s.name}</span>`).join("")}</div>`;
    } else {
      coSkillsEl.innerHTML = "<span class='co-empty'>No matching skills detected.</span>";
    }

    function renderCoSection(elId, content, emptyMsg){
      const el = document.getElementById(elId);
      if (content && content.trim()){
        el.textContent = content;
      } else {
        el.innerHTML = `<span class="co-empty">${emptyMsg}</span>`;
      }
    }
    renderCoSection("coExperience", experience, "No experience section clearly detected.");
    renderCoSection("coEducation", education, "No education section clearly detected.");
    renderCoSection("coCertifications", certifications, "No certificates detected in this resume.");
    renderCoSection("coProjects", projects, "No projects section clearly detected.");

    // ---- Missing information check ----
    const missing = [];
    if (name === "Not found") missing.push("Name");
    if (!emailMatch) missing.push("Email address");
    if (!(phoneMatch && phoneMatch[0].replace(/\D/g,"").length >= 7)) missing.push("Phone number");
    if (!linkedinMatch) missing.push("LinkedIn profile");
    if (!githubMatch) missing.push("GitHub profile");
    if (skills.length === 0) missing.push("Skills section");
    if (!experience) missing.push("Experience section");
    if (!education) missing.push("Education section");
    if (!projects) missing.push("Projects section");
    if (years === null) missing.push("Years of experience (not explicitly stated)");

    const missingWrap = document.getElementById("missingTags");
    missingWrap.innerHTML = "";
    if (missing.length){
      missing.forEach(m => {
        const span = document.createElement("span");
        span.className = "tag missing";
        span.textContent = m;
        missingWrap.appendChild(span);
      });
    } else {
      const span = document.createElement("span");
      span.className = "tag all-good";
      span.textContent = "Nothing missing — resume looks complete!";
      missingWrap.appendChild(span);
    }

    // ---- Writing quality: bullets, weak verbs, quantified achievements, duplicates ----
    const bullets = getBulletLines(text);
    const weakBullets = findWeakVerbBullets(bullets);
    const quant = analyzeQuantifiedAchievements(bullets);
    const duplicateBullets = findDuplicateBullets(bullets);

    const quantifiedStatEl = document.getElementById("quantifiedStat");
    quantifiedStatEl.textContent = quant.total ? `${quant.quantified} / ${quant.total} bullets` : "No bullet points detected";

    const weakVerbWrap = document.getElementById("weakVerbWrap");
    const weakVerbTagsEl = document.getElementById("weakVerbTags");
    weakVerbTagsEl.innerHTML = "";
    const uniqueWeakPhrases = [...new Set(weakBullets.map(w => w.phrase))];
    if (uniqueWeakPhrases.length){
      weakVerbWrap.style.display = "block";
      uniqueWeakPhrases.forEach(phrase => {
        const span = document.createElement("span");
        span.className = "tag weak";
        span.textContent = `"${phrase}"`;
        weakVerbTagsEl.appendChild(span);
      });
    } else {
      weakVerbWrap.style.display = "none";
    }

    const duplicateWrap = document.getElementById("duplicateWrap");
    const duplicateTagsEl = document.getElementById("duplicateTags");
    duplicateTagsEl.innerHTML = "";
    if (duplicateBullets.length){
      duplicateWrap.style.display = "block";
      duplicateBullets.slice(0, 6).forEach(line => {
        const span = document.createElement("span");
        span.className = "tag weak";
        span.textContent = line.length > 60 ? line.slice(0, 57) + "…" : line;
        duplicateTagsEl.appendChild(span);
      });
    } else {
      duplicateWrap.style.display = "none";
    }

    // ---- Job description match (only runs if the user pasted a JD) ----
    const jdText = (document.getElementById("jdInput").value || "").trim();
    const jdCard = document.getElementById("jdCard");
    let jdResult = null;
    if (jdText.length > 20){
      jdResult = matchAgainstJD(text, jdText);
      jdCard.style.display = "block";
      const pct = jdResult.ratio === null ? null : Math.round(jdResult.ratio * 100);
      document.getElementById("jdMatchPct").textContent = pct === null ? "Not enough keywords found in JD" : pct + "%";

      const matchedEl = document.getElementById("jdMatchedTags");
      matchedEl.innerHTML = "";
      if (jdResult.matched.length){
        jdResult.matched.forEach(kw => {
          const span = document.createElement("span");
          span.className = "tag match";
          span.textContent = kw;
          matchedEl.appendChild(span);
        });
      } else {
        matchedEl.innerHTML = "<span style='font-family:var(--mono);font-size:13px;color:#888;'>No overlap found.</span>";
      }

      const missingWrapEl = document.getElementById("jdMissingWrap");
      const missingEl = document.getElementById("jdMissingTags");
      missingEl.innerHTML = "";
      if (jdResult.missing.length){
        missingWrapEl.style.display = "block";
        jdResult.missing.forEach(kw => {
          const span = document.createElement("span");
          span.className = "tag missing";
          span.textContent = kw;
          missingEl.appendChild(span);
        });
      } else {
        missingWrapEl.style.display = "none";
      }
    } else {
      jdCard.style.display = "none";
    }

    // ==================================================================
    // NEW REPORT SECTIONS: section presence, keyword categories, domain
    // terms, missing common keywords, buzzwords, readability metrics.
    // ==================================================================
    const hasSummary = hasSectionHeader(lines, SUMMARY_HEADERS);
    const hasSkillsHeader = hasSectionHeader(lines, SKILLS_HEADERS) || skills.length > 0;
    const hasCertifications = hasSectionHeader(lines, CERT_HEADERS);
    const hasLeadership = hasSectionHeader(lines, LEADERSHIP_HEADERS);
    const hasAwards = hasSectionHeader(lines, AWARDS_HEADERS);
    const hasContact = Boolean(emailMatch) || Boolean(phoneMatch && phoneMatch[0].replace(/\D/g, "").length >= 7);
    const hasFullTimeExperience = Boolean(experience) && (/full[- ]time/i.test(experience) || !/\bintern(ship)?\b/i.test(experience));

    const coreSections = [
      { label: "Contact Information", found: hasContact },
      { label: "Academics", found: Boolean(education) },
      { label: "Skills", found: hasSkillsHeader },
      { label: "Experience/Training", found: Boolean(experience) },
      { label: "Projects", found: Boolean(projects) },
      { label: "Certifications & Achievements", found: hasCertifications },
    ];
    const optionalSections = [
      { label: "Professional Summary", found: hasSummary },
      { label: "Full-time Work Experience", found: hasFullTimeExperience },
      { label: "Leadership/Activities", found: hasLeadership },
      { label: "Awards", found: hasAwards },
    ];
    const allSections = coreSections.concat(optionalSections);

    const sectionsFoundListEl = document.getElementById("sectionsFoundList");
    const sectionsMissingListEl = document.getElementById("sectionsMissingList");
    sectionsFoundListEl.innerHTML = "";
    sectionsMissingListEl.innerHTML = "";
    allSections.forEach(s => renderSectionPill(s.found ? sectionsFoundListEl : sectionsMissingListEl, s.label, s.found));
    if (!sectionsFoundListEl.children.length) sectionsFoundListEl.innerHTML = "<span class='kw-empty'>None detected.</span>";
    if (!sectionsMissingListEl.children.length) sectionsMissingListEl.innerHTML = "<span class='kw-empty'>Nothing missing — great job!</span>";

    // Keyword categories
    const kwCategories = analyzeKeywordCategories(text);
    const domainTerms = extractDomainTerms(text, 3);
    renderKwColumn(document.getElementById("kwHard"), kwCategories.lang);
    renderKwColumn(document.getElementById("kwSoft"), kwCategories.soft);
    renderKwColumn(document.getElementById("kwTools"), kwCategories.tool);
    renderKwColumn(document.getElementById("kwDomain"), domainTerms);

    // Missing common keywords
    const missingCommonKw = findMissingCommonKeywords(text);
    const missingCommonEl = document.getElementById("missingCommonKeywords");
    missingCommonEl.innerHTML = "";
    if (missingCommonKw.length){
      missingCommonKw.forEach(kw => {
        const span = document.createElement("span");
        span.className = "tag missing";
        span.textContent = "! " + kw;
        missingCommonEl.appendChild(span);
      });
    } else {
      missingCommonEl.innerHTML = "<span class='kw-empty'>None — your resume covers all the common keywords we check for.</span>";
    }

    // Overused buzzwords
    const buzzwordsFound = findBuzzwords(text);
    const buzzwordEl = document.getElementById("buzzwordTags");
    buzzwordEl.innerHTML = "";
    if (buzzwordsFound.length){
      buzzwordsFound.forEach(b => {
        const span = document.createElement("span");
        span.className = "tag missing";
        span.textContent = "! " + b;
        buzzwordEl.appendChild(span);
      });
    } else {
      buzzwordEl.innerHTML = "<span class='kw-empty'>No overused buzzwords detected.</span>";
    }

    // Readability & content quality metrics
    const readability = computeReadability(text);
    const totalSkillOccurrences = [...kwCategories.lang, ...kwCategories.soft, ...kwCategories.tool].reduce((s, k) => s + k.count, 0);
    const skillDensity = Math.round((totalSkillOccurrences / wordCount) * 1000) / 10;
    const quantPct = quant.total ? Math.round((quant.quantified / quant.total) * 100) : 0;

    const metricGrid = document.getElementById("readabilityMetricGrid");
    metricGrid.innerHTML = "";
    renderMetricBox(metricGrid, "Avg Sentence Length", readability.avgSentenceLength, readability.avgSentenceLength, 12, 20, 30, "Target range: 12–20 words");
    renderMetricBox(metricGrid, "Reading Grade Level", readability.gradeLevel, readability.gradeLevel, 8, 12, 20, "Target range: Grade 8–12 (clear business writing)");
    renderMetricBox(metricGrid, "Skill Density", skillDensity, skillDensity + "%", 25, 40, 50, "Target range: 25–40% of words are skills");
    renderMetricBox(metricGrid, "Quantification", quantPct, quantPct + "%", 50, 75, 100, `Target range: 50–75% bullets with numbers (${quant.quantified}/${quant.total})`);

    // Timeline consistency: flag graduation/education years that are in the future
    const currentYear = new Date().getFullYear();
    const eduYears = [...(education || "").matchAll(/\b(20\d{2})\b/g)].map(m => parseInt(m[1], 10));
    const futureGradFlag = eduYears.some(y => y > currentYear);
    const noDatesFound = eduYears.length === 0 && !/\b(19|20)\d{2}\b/.test(experience || "");

    // ---- Score Breakdown (6 metrics, 0-100) ----
    const sectionCoveragePct = (allSections.filter(s => s.found).length / allSections.length) * 100;
    const keywordCoveragePct = jdResult && jdResult.ratio !== null
      ? jdResult.ratio * 100
      : ((COMMON_TARGET_KEYWORDS.length - missingCommonKw.length) / COMMON_TARGET_KEYWORDS.length) * 100;
    let contentStrengthPct = quant.total ? (quant.quantified / quant.total) * 100 : 40;
    contentStrengthPct -= Math.min(uniqueWeakPhrases.length, 8) * 4;
    contentStrengthPct -= Math.min(duplicateBullets.length, 5) * 4;
    contentStrengthPct = Math.max(0, Math.min(100, contentStrengthPct));
    let timelineConsistencyPct = noDatesFound ? 65 : 100;
    if (futureGradFlag) timelineConsistencyPct -= 20;
    timelineConsistencyPct = Math.max(0, Math.min(100, timelineConsistencyPct));
    const gradeDelta = readability.gradeLevel < 8 ? 8 - readability.gradeLevel : (readability.gradeLevel > 12 ? readability.gradeLevel - 12 : 0);
    const readabilityPct = Math.max(0, 100 - gradeDelta * 12);
    let relevanceAlignmentPct;
    if (jdResult && jdResult.ratio !== null){
      relevanceAlignmentPct = jdResult.ratio * 100;
    } else {
      const densityDelta = skillDensity < 25 ? 25 - skillDensity : (skillDensity > 40 ? skillDensity - 40 : 0);
      relevanceAlignmentPct = Math.max(0, 100 - densityDelta * 3);
    }
    // Formatting is computed here (rather than down by the score) so the
    // Executive Summary / ATS Improvement Recommendations below can weigh
    // it exactly the same way the ATS score does.
    let formattingPct = 55; // baseline: no clear ATS-friendly formatting signal
    if (wordCount >= 400 && wordCount <= 900) formattingPct = 100;
    else if (wordCount >= 250 && wordCount <= 1100) formattingPct = 75;
    else if (wordCount > 0) formattingPct = 40;
    if (quant.total === 0) formattingPct -= 20; // no bullet points at all reads poorly to an ATS parser
    formattingPct = Math.max(0, Math.min(100, formattingPct));

    // Critical fields carry a fixed penalty in the ATS score regardless of
    // how the weighted categories look — used both by the score and by the
    // recommendations below so the two always agree.
    const criticalMissingFields = ["Name", "Email address", "Phone number", "Experience section", "Education section", "Skills section"];

    const scoreBreakdownGrid = document.getElementById("scoreBreakdownGrid");
    scoreBreakdownGrid.innerHTML = "";
    renderScoreItem(scoreBreakdownGrid, "Section Coverage", sectionCoveragePct);
    renderScoreItem(scoreBreakdownGrid, "Keyword Coverage", keywordCoveragePct);
    renderScoreItem(scoreBreakdownGrid, "Content Strength", contentStrengthPct);
    renderScoreItem(scoreBreakdownGrid, "Timeline Consistency", timelineConsistencyPct);
    renderScoreItem(scoreBreakdownGrid, "Readability", readabilityPct);
    renderScoreItem(scoreBreakdownGrid, "Relevance Alignment", relevanceAlignmentPct);

    // ---- Executive Summary: Top Issues to Fix / Quick Fixes ----
    // Built from the exact same signals that drive the ATS score above —
    // critical missing fields (fixed penalty) plus the 7 weighted score
    // categories — sorted by how much each one is actually costing the
    // score, so what's shown here always matches why the score is what it
    // is, instead of being a separate, looser checklist.
    const issues = [];
    const fixes = [];

    criticalMissingFields.forEach(field => {
      if (missing.includes(field)){
        issues.push(`Missing: ${field}`);
        fixes.push(`Add a clear ${field.replace(/ section$/i, "").toLowerCase()} — this is a standard field ATS systems and recruiters expect.`);
      }
    });

    const scoreCategories = [
      {
        pct: sectionCoveragePct, weight: 0.22,
        issue: () => {
          const missingSections = allSections.filter(s => !s.found).map(s => s.label);
          return `Resume is missing ${missingSections.length} standard section(s)${missingSections.length ? " (" + missingSections.slice(0, 3).join(", ") + (missingSections.length > 3 ? ", etc." : "") + ")" : ""}`;
        },
        fix: "Add the sections shown under \"Missing Sections\" below",
      },
      {
        pct: keywordCoveragePct, weight: 0.20,
        issue: () => (jdResult && jdResult.ratio !== null)
          ? `Resume matches only ${Math.round(jdResult.ratio * 100)}% of the job description's keywords`
          : `Missing common keywords (${missingCommonKw.slice(0, 3).join(", ")}${missingCommonKw.length > 3 ? ", etc." : ""})`,
        fix: (jdResult && jdResult.ratio !== null)
          ? "Work more of the job description's exact terms and phrases into your resume"
          : "Insert relevant missing keywords naturally throughout the resume",
      },
      {
        pct: contentStrengthPct, weight: 0.16,
        issue: () => {
          if (quant.total === 0 || quant.quantified === 0) return "No quantified results in bullet points";
          if (uniqueWeakPhrases.length) return "Weak/passive phrasing found in bullet points";
          if (duplicateBullets.length) return "Repeated bullet phrasing detected";
          return "Bullet points could show stronger, more measurable impact";
        },
        fix: () => {
          if (quant.total === 0 || quant.quantified === 0) return "Quantify impact for each experience/project bullet (numbers, %, $)";
          if (uniqueWeakPhrases.length) return "Replace weak phrases with strong action verbs";
          if (duplicateBullets.length) return "Vary your bullet point language across roles/projects";
          return "Add more numbers and outcomes to your bullet points";
        },
      },
      {
        pct: relevanceAlignmentPct, weight: 0.14,
        issue: () => (jdResult && jdResult.ratio !== null)
          ? "Resume's overall content doesn't closely align with the job description"
          : `Skill keyword density is ${skillDensity < 25 ? "low" : "high"} (${skillDensity}%) vs. the ideal 25–40% range`,
        fix: (jdResult && jdResult.ratio !== null)
          ? "Mirror more of the job description's responsibilities and required skills"
          : "Adjust how often core skills appear so they're clearly represented without over-stuffing",
      },
      {
        pct: readabilityPct, weight: 0.10,
        issue: () => `Reading level is outside the ideal range (Grade ${readability.gradeLevel})`,
        fix: "Aim for a Grade 8–12 reading level with clear, concise sentences",
      },
      {
        pct: formattingPct, weight: 0.10,
        issue: () => quant.total === 0
          ? "No bullet points detected — this reads poorly to ATS parsers"
          : `Resume length (${wordCount} words) is outside the ideal 400–900 word range`,
        fix: quant.total === 0
          ? "Use bullet points (lines starting with -, *, or •) to list achievements"
          : "Trim or expand content to land in the 400–900 word sweet spot",
      },
      {
        pct: timelineConsistencyPct, weight: 0.08,
        issue: () => futureGradFlag ? "Future graduation dates may cause timing concerns" : "No dates found in education or experience",
        fix: futureGradFlag ? "Clarify your graduation date or expected completion timeline" : "Add month/year ranges so recruiters can follow your timeline",
      },
    ];

    scoreCategories
      .filter(c => c.pct < 85)
      .sort((a, b) => (b.weight * (100 - b.pct)) - (a.weight * (100 - a.pct)))
      .forEach(c => {
        issues.push(typeof c.issue === "function" ? c.issue() : c.issue);
        fixes.push(typeof c.fix === "function" ? c.fix() : c.fix);
      });

    // Lower-weight polish items — not part of the score's own categories,
    // added last only if there's still room in the top-6 list.
    if (buzzwordsFound.length){ issues.push("Overused buzzwords found (" + buzzwordsFound.slice(0, 3).join(", ") + ")"); fixes.push("Swap vague buzzwords for specific, concrete language"); }
    if (!hasSummary){ issues.push("No professional summary"); fixes.push("Add a concise Professional Summary highlighting your focus area"); }

    const execIssuesEl = document.getElementById("execIssuesList");
    const execFixesEl = document.getElementById("execFixesList");
    execIssuesEl.innerHTML = "";
    execFixesEl.innerHTML = "";
    if (issues.length){
      issues.slice(0, 6).forEach(i => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="exec-icon">✕</span><span>${i}</span>`;
        execIssuesEl.appendChild(li);
      });
      fixes.slice(0, 6).forEach(f => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="exec-icon">✓</span><span>${f}</span>`;
        execFixesEl.appendChild(li);
      });
    } else {
      execIssuesEl.innerHTML = "<li class='exec-empty'>No major issues found — nice work!</li>";
      execFixesEl.innerHTML = "<li class='exec-empty'>Keep tailoring this resume for each job description.</li>";
    }

    // ---- Errors & Issues Found: every detected problem, ordered by ----
    // ---- severity (Critical → Moderate → Minor) with a plain-English ----
    // ---- explanation of why it matters and how to fix it.           ----
    const errorItems = [];
    missing.forEach(m => {
      errorItems.push({
        severity: "high",
        title: `Missing: ${m}`,
        detail: "This is a standard resume field or section — recruiters and ATS systems generally expect to see it."
      });
    });
    if (quant.total === 0){
      errorItems.push({ severity:"medium", title:"No bullet points detected", detail:"Use bullet points (lines starting with -, *, or •) to list your achievements clearly." });
    } else if (quant.quantified === 0){
      errorItems.push({ severity:"medium", title:"No quantified results in bullet points", detail:"Add numbers, percentages, or dollar amounts to show measurable impact." });
    }
    if (uniqueWeakPhrases.length){
      errorItems.push({
        severity:"medium",
        title:`Weak or passive phrasing found (${uniqueWeakPhrases.length})`,
        detail:`Phrases like ${uniqueWeakPhrases.slice(0,3).map(p => `"${p}"`).join(", ")} read passively — replace with strong action verbs.`
      });
    }
    if (duplicateBullets.length){
      errorItems.push({
        severity:"low",
        title:`Repeated bullet phrasing (${duplicateBullets.length})`,
        detail:"Several bullet points use very similar wording — vary your language across roles and projects."
      });
    }
    if (buzzwordsFound.length){
      errorItems.push({
        severity:"low",
        title:`Overused buzzwords found (${buzzwordsFound.length})`,
        detail:`Words like ${buzzwordsFound.slice(0,3).join(", ")} are vague — swap them for specific, concrete language.`
      });
    }
    if (missingCommonKw.length){
      errorItems.push({
        severity:"medium",
        title:`Missing common keywords (${missingCommonKw.length})`,
        detail:`Consider naturally adding: ${missingCommonKw.slice(0,5).join(", ")}${missingCommonKw.length > 5 ? ", etc." : ""}.`
      });
    }
    if (!hasSummary){
      errorItems.push({ severity:"low", title:"No professional summary", detail:"A 2–3 line summary at the top helps recruiters quickly understand your focus area." });
    }
    if (futureGradFlag){
      errorItems.push({ severity:"high", title:"Future graduation date detected", detail:"Double-check your education dates — a graduation year in the future can confuse recruiters if unintentional." });
    }
    if (noDatesFound){
      errorItems.push({ severity:"low", title:"No dates found in education or experience", detail:"Add month/year ranges so recruiters can follow your timeline at a glance." });
    }

    const severityRank = { high:0, medium:1, low:2 };
    errorItems.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

    const errorsListEl = document.getElementById("errorsList");
    errorsListEl.innerHTML = "";
    if (errorItems.length){
      const badgeLabel = { high:"Critical", medium:"Moderate", low:"Minor" };
      errorItems.forEach(err => {
        const row = document.createElement("div");
        row.className = "error-item";
        row.innerHTML = `
          <span class="error-badge ${err.severity}">${badgeLabel[err.severity]}</span>
          <div class="error-body">
            <div class="error-title">${err.title}</div>
            <div class="error-detail">${err.detail}</div>
          </div>
        `;
        errorsListEl.appendChild(row);
      });
    } else {
      errorsListEl.innerHTML = "<div class='errors-empty'>✓ No major errors found — this resume looks solid!</div>";
    }

    // ---- ATS Score (0-100) ----
    // A stricter, multi-factor score built from the same signals professional
    // ATS/resume-checker tools weigh — section completeness, keyword
    // relevance & placement, content/experience strength, formatting &
    // readability, and timeline consistency — using the breakdown metrics
    // computed above, rather than one flat point-per-field score. Critical
    // missing fields and high-severity issues are then subtracted as hard
    // penalties so a resume can't land in the "good" range purely because
    // a few unrelated metrics look fine.
    const weightedScore =
      sectionCoveragePct    * 0.22 +
      keywordCoveragePct    * 0.20 +
      contentStrengthPct    * 0.16 +
      relevanceAlignmentPct * 0.14 +
      readabilityPct        * 0.10 +
      formattingPct         * 0.10 +
      timelineConsistencyPct * 0.08;

    let score = Math.round(weightedScore);

    // Hard penalties: standard ATS-blocking gaps knock points off directly,
    // instead of being smoothed out by unrelated metrics.
    const criticalMissingCount = missing.filter(m => criticalMissingFields.includes(m)).length;
    score -= criticalMissingCount * 6;
    score -= Math.min(errorItems.filter(e => e.severity === "high").length, 5) * 4;

    // When a job description was pasted, blend in direct JD keyword match
    // as the dominant signal — this is the single strongest real-world
    // relevance factor for how an ATS will actually rank the resume.
    if (jdResult && jdResult.ratio !== null){
      score = Math.round(score * 0.5 + jdResult.ratio * 100 * 0.5);
    }

    score = Math.max(0, Math.min(100, score));

    let color = "#b3261e", verdict = "Needs Work";
    if (score >= 85){ color = "#2e7d32"; verdict = "Excellent — ATS Friendly"; }
    else if (score >= 65){ color = "#e07a5f"; verdict = "Good — Minor Gaps"; }
    else if (score >= 45){ color = "#c9962c"; verdict = "Fair — Several Gaps"; }
    else { color = "#b3261e"; verdict = "Needs Work — Major Gaps"; }

    renderATSScore(score, color, verdict);

    if (currentUser && !historySavedForCurrentUpload){
      saveHistoryEntry(currentUser.email, filename, score, verdict);
      historySavedForCurrentUpload = true;
    }

    // Snapshot everything the PDF export button needs, so it doesn't have
    // to re-scrape the DOM or re-run analysis.
    lastAnalysisData = {
      filename, name,
      email: emailMatch ? emailMatch[0] : "Not found",
      phone: (phoneMatch && phoneMatch[0].replace(/\D/g,"").length >= 7) ? phoneMatch[0] : "Not found",
      linkedin: linkedinMatch ? linkedinMatch[0] : "Not found",
      github: githubMatch ? githubMatch[0] : "Not found",
      skills: skills.map(s => s.name),
      years, wordCount,
      experience: experience || "Not clearly detected",
      education: education || "Not clearly detected",
      projects: projects || "Not clearly detected",
      missing,
      quant, uniqueWeakPhrases, duplicateBullets,
      jdResult,
      score, verdict,
    };

    document.getElementById("results").style.display = "block";
    document.getElementById("results").scrollIntoView({ behavior: "smooth" });
  }

  async function extractPdfText(arrayBuffer){
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++){
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      // pdf.js returns text items in whatever order they were drawn in the
      // PDF's content stream — for simple single-column resumes that's
      // usually top-to-bottom already, but many resume templates (two-column
      // layouts, floating text boxes, sidebars) draw text in an order that
      // has nothing to do with visual reading order. Sort every item by
      // position first — top-to-bottom (y descending, since PDF y grows
      // upward), then left-to-right (x ascending) within the same row —
      // to reconstruct the order a human would actually read the page in.
      const items = content.items
        .filter(it => it.str !== undefined)
        .map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));

      items.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 3) return b.y - a.y;
        return a.x - b.x;
      });

      // Now group the sorted items into visual lines using their y-position.
      const lines = [];
      let currentLine = [];
      let lastY = null;

      for (const item of items){
        if (lastY !== null && Math.abs(item.y - lastY) > 3){
          lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
          currentLine = [];
        }
        currentLine.push(item.str);
        lastY = item.y;
      }
      if (currentLine.length) lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());

      fullText += lines.filter(Boolean).join("\n") + "\n";
    }
    return fullText;
  }

  async function extractDocxText(arrayBuffer){
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  function setStatus(msg, isError){
    const el = document.getElementById("status");
    el.textContent = msg;
    el.className = isError ? "error" : "";
  }

  // ---- Loading indicator: shown during file extraction / analysis so the
  // user gets feedback instead of a frozen-looking page on larger files ----
  const loadingIndicator = document.getElementById("loadingIndicator");
  const loadingText = document.getElementById("loadingText");

  function showLoading(msg){
    loadingText.textContent = msg || "Working…";
    loadingIndicator.style.display = "flex";
    uploadBtn.disabled = true;
    analyzePastedBtn.disabled = true;
  }
  function hideLoading(){
    loadingIndicator.style.display = "none";
    uploadBtn.disabled = !pendingFile;
    analyzePastedBtn.disabled = false;
  }
  // Lets the browser actually paint the loading indicator before we run
  // synchronous, CPU-heavy work (regex scans, PDF text sorting, etc.)
  function paintFrame(){
    return new Promise(resolve => setTimeout(resolve, 30));
  }

  async function handleFile(file){
    if (!file) return;
    if (!currentUser){
      setStatus("Please log in or sign up to upload and analyze your resume.", true);
      openAuth("login");
      showToast(loginToast, "Please log in or sign up to upload and analyze your resume.", true);
      return;
    }
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "docx"].includes(ext)){
      setStatus("Only .pdf and .docx files are supported.", true);
      return;
    }
    document.getElementById("results").style.display = "none";
    document.getElementById("analysisOptions").style.display = "none";
    document.getElementById("preUploadFields").style.display = "none";
    document.getElementById("tipsCard").style.display = "none";
    setStatus("");
    showLoading("Reading " + file.name + " …");
    await paintFrame();

    try{
      const arrayBuffer = await file.arrayBuffer();
      let text = "";
      if (ext === "pdf"){
        showLoading("Extracting text from PDF…");
        await paintFrame();
        text = await extractPdfText(arrayBuffer);
      } else {
        showLoading("Extracting text from DOCX…");
        await paintFrame();
        text = await extractDocxText(arrayBuffer);
      }
      if (!text || !text.trim()){
        hideLoading();
        setStatus("Could not extract any text from this file.", true);
        return;
      }
      pendingResumeText = text;
      pendingResumeFilename = file.name;
      historySavedForCurrentUpload = false;
      hideLoading();
      setStatus("Resume ready — choose how you'd like it analyzed.");
      showAnalysisOptions();
    } catch(err){
      console.error(err);
      hideLoading();
      setStatus("Error while analyzing: " + err.message, true);
    }
  }

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const chosenName = document.getElementById("chosenName");
  const uploadBtn = document.getElementById("uploadBtn");

  let pendingFile = null;

  function setPendingFile(file){
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "docx"].includes(ext)){
      setStatus("Only .pdf and .docx files are supported.", true);
      return;
    }
    pendingFile = file;
    chosenName.textContent = file.name;
    uploadBtn.disabled = false;
    setStatus("File ready — click Upload to analyze.");
  }

  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) setPendingFile(fileInput.files[0]);
  });

  ["dragenter", "dragover"].forEach(evt => {
    dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add("drag"); });
  });
  ["dragleave", "drop"].forEach(evt => {
    dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove("drag"); });
  });
  dropzone.addEventListener("drop", e => {
    const file = e.dataTransfer.files[0];
    if (file) setPendingFile(file);
  });

  uploadBtn.addEventListener("click", () => {
    if (pendingFile) handleFile(pendingFile);
  });

  // ---- Paste-resume-text flow (alternative to file upload) ----
  const pasteToggleBtn = document.getElementById("pasteToggleBtn");
  const pasteWrap = document.getElementById("pasteWrap");
  const pasteTextInput = document.getElementById("pasteTextInput");
  const analyzePastedBtn = document.getElementById("analyzePastedBtn");

  pasteToggleBtn.addEventListener("click", () => {
    const showing = pasteWrap.style.display !== "none";
    pasteWrap.style.display = showing ? "none" : "block";
    pasteToggleBtn.textContent = showing ? "Paste text" : "Hide the text box";
    if (!showing) pasteTextInput.focus();
  });

  analyzePastedBtn.addEventListener("click", async () => {
    if (!currentUser){
      setStatus("Please log in or sign up to upload and analyze your resume.", true);
      openAuth("login");
      showToast(loginToast, "Please log in or sign up to upload and analyze your resume.", true);
      return;
    }
    const text = pasteTextInput.value.trim();
    if (!text){
      setStatus("Please paste some resume text first.", true);
      return;
    }
    if (text.split(/\s+/).filter(Boolean).length < 20){
      setStatus("That looks too short to be a resume — please paste more text.", true);
      return;
    }
    document.getElementById("results").style.display = "none";
    document.getElementById("analysisOptions").style.display = "none";
    document.getElementById("preUploadFields").style.display = "none";
    document.getElementById("tipsCard").style.display = "none";
    setStatus("");
    showLoading("Reading pasted text…");
    await paintFrame();
    try {
      pendingResumeText = text;
      pendingResumeFilename = "Pasted Resume Text";
      historySavedForCurrentUpload = false;
      hideLoading();
      setStatus("Resume ready — choose how you'd like it analyzed.");
      showAnalysisOptions();
    } catch(err){
      console.error(err);
      hideLoading();
      setStatus("Error while analyzing: " + err.message, true);
    }
  });

  // ---- Analysis mode selection: shows the two-option screen after the
  // resume text has been extracted, then routes to the ATS-only or the
  // full normal-analysis report using the already-extracted text. ----
  const analysisOptionsEl = document.getElementById("analysisOptions");
  const resultsEl = document.getElementById("results");

  function showAnalysisOptions(){
    resultsEl.style.display = "none";
    analysisOptionsEl.style.display = "block";
    analysisOptionsEl.scrollIntoView({ behavior: "smooth" });
  }

  function selectAnalysisMode(mode){
    if (!pendingResumeText) return;
    analysisMode = mode;
    analysisOptionsEl.style.display = "none";
    resultsEl.dataset.mode = mode;
    const execHeading = document.getElementById("execSummaryHeading");
    if (execHeading){
      execHeading.textContent = mode === "ats"
        ? "ATS Improvement Recommendations"
        : "Strengths, Weaknesses & Suggestions";
    }
    if (mode === "ats") runATSAnalysis(); else runNormalAnalysis();
    setStatus("Analysis complete ✓");
  }

  // Both modes share the same underlying extraction/analysis engine —
  // analyzeText() renders every section, and CSS (driven by #results'
  // data-mode attribute) shows only the sections relevant to the chosen mode.
  function runATSAnalysis(){
    analyzeText(pendingResumeText, pendingResumeFilename);
  }

  function runNormalAnalysis(){
    analyzeText(pendingResumeText, pendingResumeFilename);
  }

  function resetAnalysis(){
    resultsEl.style.display = "none";
    analysisOptionsEl.style.display = "none";
    resultsEl.removeAttribute("data-mode");
    document.getElementById("preUploadFields").style.display = "";
    document.getElementById("tipsCard").style.display = "";
    chosenName.textContent = "No file selected";
    uploadBtn.disabled = true;
    pendingFile = null;
    pendingResumeText = null;
    pendingResumeFilename = null;
    analysisMode = null;
    historySavedForCurrentUpload = false;
    fileInput.value = "";
    pasteTextInput.value = "";
    setStatus("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.getElementById("chooseAtsBtn").addEventListener("click", () => selectAnalysisMode("ats"));
  document.getElementById("chooseNormalBtn").addEventListener("click", () => selectAnalysisMode("normal"));

  document.getElementById("backToOptionsBtn").addEventListener("click", () => {
    showAnalysisOptions();
  });

  document.getElementById("resetBtn").addEventListener("click", resetAnalysis);

  document.getElementById("navHomeLink").addEventListener("click", (e) => {
    e.preventDefault();
    resetAnalysis();
  });

  // ---- PDF report export (client-side, via jsPDF — no server involved) ----
  const pdfExportBtn = document.getElementById("pdfExportBtn");

  pdfExportBtn.addEventListener("click", () => {
    if (!lastAnalysisData){
      setStatus("Analyze a resume first, then download the report.", true);
      return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF){
      setStatus("PDF library didn't load — check your connection and try again.", true);
      return;
    }
    try {
      generatePdfReport(lastAnalysisData);
    } catch (err){
      console.error(err);
      setStatus("Couldn't generate the PDF report: " + err.message, true);
    }
  });

  function generatePdfReport(data){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 48;
    const maxWidth = pageWidth - marginX * 2;
    let y = 56;

    function ensureSpace(lineHeight){
      if (y > 780){
        doc.addPage();
        y = 56;
      }
    }
    function heading(text){
      ensureSpace(24);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(30, 30, 40);
      doc.text(text, marginX, y);
      y += 18;
      doc.setDrawColor(220, 220, 220);
      doc.line(marginX, y - 12, pageWidth - marginX, y - 12);
    }
    function field(label, value){
      ensureSpace(16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(90, 90, 100);
      doc.text(label + ":", marginX, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(20, 20, 28);
      doc.text(String(value), marginX + 100, y);
      y += 16;
    }
    function paragraph(text, fontSize){
      doc.setFont("helvetica", "normal");
      doc.setFontSize(fontSize || 10.5);
      doc.setTextColor(40, 40, 48);
      const lines = doc.splitTextToSize(text || "Not clearly detected", maxWidth);
      lines.forEach(line => {
        ensureSpace(14);
        doc.text(line, marginX, y);
        y += 14;
      });
      y += 6;
    }
    function tagLine(items, prefix){
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(40, 40, 48);
      const text = items && items.length ? items.join(", ") : "None found";
      const lines = doc.splitTextToSize((prefix ? prefix + " " : "") + text, maxWidth);
      lines.forEach(line => {
        ensureSpace(14);
        doc.text(line, marginX, y);
        y += 14;
      });
      y += 6;
    }

    // ---- Title ----
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(20, 20, 28);
    doc.text("AI Resume Analyzer — Report", marginX, y);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 130);
    doc.text("Source file: " + data.filename + "   |   Generated: " + new Date().toLocaleString(), marginX, y);
    y += 28;

    // ---- ATS Score ----
    heading("ATS Compatibility Score");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(20, 20, 28);
    doc.text(String(data.score) + " / 100", marginX, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(90, 90, 100);
    doc.text(data.verdict, marginX + 120, y + 4);
    y += 30;

    // ---- Basic Info ----
    heading("Basic Info");
    field("Name", data.name);
    field("Email", data.email);
    field("Phone", data.phone);
    field("LinkedIn", data.linkedin);
    field("GitHub", data.github);
    field("Years Experience", data.years ? data.years + "+" : "Not explicitly stated");
    field("Word Count", data.wordCount);
    y += 6;

    // ---- Skills ----
    heading("Skills Detected (" + data.skills.length + ")");
    tagLine(data.skills);

    // ---- Missing Information ----
    heading("Missing Information");
    if (data.missing.length){
      tagLine(data.missing);
    } else {
      paragraph("Nothing missing — resume looks complete!");
    }

    // ---- Writing Quality ----
    heading("Writing Quality");
    field("Quantified achievements", data.quant.total ? `${data.quant.quantified} / ${data.quant.total} bullets` : "No bullet points detected");
    if (data.uniqueWeakPhrases.length){
      tagLine(data.uniqueWeakPhrases.map(p => `"${p}"`), "Weak/passive phrasing found:");
    }
    if (data.duplicateBullets.length){
      tagLine(data.duplicateBullets.slice(0, 6), "Possible repeated bullets:");
    }

    // ---- Job Description Match ----
    if (data.jdResult && data.jdResult.ratio !== null){
      heading("Job Description Match");
      field("Keyword match", Math.round(data.jdResult.ratio * 100) + "%");
      tagLine(data.jdResult.matched, "Matched:");
      tagLine(data.jdResult.missing, "Missing:");
    }

    // ---- Sections ----
    heading("Experience Section");
    paragraph(data.experience);
    heading("Education Section");
    paragraph(data.education);
    heading("Projects Section");
    paragraph(data.projects);

    const safeName = (data.filename || "resume").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "_");
    doc.save(`${safeName}_analysis_report.pdf`);
  }

  // =================================================================
  // AUTH
  //
  // IMPORTANT — read this before deploying: this is still a static
  // HTML file with no server. There is no real database. Accounts and
  // reset tokens are kept in the browser's localStorage, which means
  // they only exist on this device/browser, not on an actual server,
  // and anyone with local access to the browser could read them. For
  // a real product you'd move `accounts`, password checks, and reset
  // tokens to a real backend (with hashed passwords, e.g. bcrypt) and
  // call it with fetch(). What's below is as far as this can safely
  // go as a front-end-only page — Google sign-in and the emails are
  // real, but "account storage" is still local to the browser.
  //
  // Fill these in before the Google button / emails will work:
  // =================================================================
  const AUTH_CONFIG = {
    // Google Cloud Console → APIs & Services → Credentials → OAuth Client ID (Web application)
    GOOGLE_CLIENT_ID: "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com",

    // formsubmit.co — the inbox every site email is routed through.
    // Direct endpoint using the site admin email ensures FormSubmit autoresponses work seamlessly.
    FORMSUBMIT_ENDPOINT: "https://formsubmit.co/airesumeash@gmail.com",

    ADMIN_NOTIFY_EMAIL: "airesumeash@gmail.com"
  };

  function createFormSubmitFrame(){
    const uniqueName = "formsubmitFrame_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const frame = document.createElement("iframe");
    frame.id = uniqueName;
    frame.name = uniqueName;
    frame.style.display = "none";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);
    return frame;
  }

  function sendViaFormSubmit(fields){
    const adminEmail = AUTH_CONFIG.ADMIN_NOTIFY_EMAIL || "airesumeash@gmail.com";
    const userEmail = fields.email || fields._replyto || adminEmail;
    const isAutoResponse = Boolean(fields._autoresponse);

    // For general non-autoresponse notifications, send AJAX POST to admin
    if (!isAutoResponse){
      try {
        const payload = {
          _subject: fields._subject || "AI Resume Notification",
          _captcha: "false",
          _template: "table",
          _replyto: userEmail,
          name: fields.name || "User",
          email: userEmail,
          message: fields.message || fields._subject || "New notification from AI Resume Analyzer",
          ...fields
        };

        fetch("https://formsubmit.co/ajax/" + adminEmail, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        }).catch(() => {});
      } catch (e){
        console.warn("FormSubmit AJAX attempt error:", e);
      }
    }

    // Submit HTML form into hidden iframe (this triggers FormSubmit _autoresponse to user's inbox)
    return new Promise((resolve) => {
      const frame = createFormSubmitFrame();
      const form = document.createElement("form");
      form.action = "https://formsubmit.co/" + adminEmail;
      form.method = "POST";
      form.target = frame.name;
      form.style.display = "none";

      let safeUrl = location.href;
      if (location.protocol === "file:" || !safeUrl || safeUrl.startsWith("file:")){
        safeUrl = "http://localhost" + (location.pathname || "/");
      }

      const allFields = {
        _url: safeUrl,
        _captcha: "false",
        _template: "table",
        _replyto: adminEmail,
        ...fields,
        email: userEmail // Crucial: sets user email as form email so FormSubmit sends _autoresponse to user's inbox
      };

      Object.keys(allFields).forEach(key => {
        const value = allFields[key];
        if (value === undefined || value === null) return;
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();

      setTimeout(() => {
        form.remove();
        frame.remove();
        resolve(true);
      }, 1200);
    });
  }

  // "User table": email -> { name, password, provider, resetToken?, resetTokenExpires? }
  // Persisted to localStorage so a reset link opened later on this same
  // browser still finds the account. NOT a real database — see note above.
  function loadAccounts(){
    try {
      const raw = localStorage.getItem("ara_accounts_v1");
      return raw ? JSON.parse(raw) : {};
    } catch (e){ return {}; }
  }
  function saveAccounts(){
    try { localStorage.setItem("ara_accounts_v1", JSON.stringify(accounts)); } catch (e){}
  }
  const accounts = loadAccounts();
  let currentUser = null; // { name, email, provider }

  function normalizeEmail(email){ return email.trim().toLowerCase(); }

  // Real email format check: something@something.tld — used on every
  // login/signup/reset submit so bad addresses get caught before anything
  // else runs, with the error shown as the alert at the TOP of the form.
  function isValidEmail(email){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function generateResetToken(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // Emails the SITE OWNER (AUTH_CONFIG.ADMIN_NOTIFY_EMAIL) whenever someone
  // signs up or logs in — deliberately WITHOUT the password. Emailing
  // plaintext passwords to yourself is a serious security/privacy problem:
  // it puts every user's password in your inbox (and any mail server it
  // passes through), and because people reuse passwords across sites, a
  // leaked inbox would hand over access to their other accounts too. If
  // you need to verify logins, use the account email + timestamp below,
  // or check server-side auth logs — never the raw password.
  function notifyAdminOfAuthEvent({ email, name, action }){
    sendViaFormSubmit({
      _subject: `${action} — ${email}`,
      name: name || "(no name on file)",
      email: email,
      message: `${action} on AI Resume Analyzer.\nUser: ${name || "(no name on file)"}\nEmail: ${email}`
    }).then(
      () => console.log("Admin notify sent via FormSubmit"),
      (err) => console.error("Admin notify FAILED — FormSubmit rejected the send:", err)
    );
  }

  // Emails the USER themselves (not the admin) right after they sign up or
  // log in — a "Welcome" / "Welcome back" message sent to their own inbox.
  // Uses FormSubmit's "_autoresponse" field: FormSubmit auto-replies to
  // whatever address is in the "email" field of the submission, using
  // _autoresponse as the message body. The admin inbox also gets a copy of
  // the raw submission, same as every other FormSubmit send.
  function notifyUserOfAuthEvent({ email, name, action }){
    const displayName = name || "there";
    const isSignup = action.startsWith("Sign Up");
    const subject = isSignup ? "Welcome to AI Resume Analyzer 🎉" : "Welcome back to AI Resume Analyzer 👋";

    // 3 extra lines, different depending on whether this is a first sign up
    // or a returning login.
    const extraLines = isSignup
      ? [
          "1. Upload your resume (PDF or DOCX) to get an instant AI-powered score.",
          "2. Review the tailored suggestions to improve keyword matching and formatting.",
          "3. Your results are saved automatically — revisit them anytime from your History tab."
        ]
      : [
          "1. Your past resume analyses are waiting for you in the History tab.",
          "2. Upload a new or updated resume anytime for a fresh score and feedback.",
          "3. Need a hand? Use the feedback button in the corner to reach support."
        ];

    const greeting = isSignup ? `Welcome, ${displayName}!` : `Welcome back, ${displayName}!`;
    const message = `${greeting}\n\n${extraLines.join("\n")}`;

    sendViaFormSubmit({
      _subject: subject,
      _autoresponse: message,
      name: "AI Resume Analyzer",
      email: email,
      message: `Welcome email auto-sent to ${email} (${action}).`
    }).then(
      () => console.log("Welcome email sent via FormSubmit"),
      (err) => console.error("Welcome email FAILED — FormSubmit rejected the send:", err)
    );
  }

  // Sends a "confirm your email" link to a brand-new email/password signup.
  // The account is created as unverified and stays that way — and can't log
  // in — until this link is clicked. This is what stops someone from typing
  // in an email address they don't actually own/control (a "fake" email):
  // if it's not a real, reachable inbox, the link never gets clicked and the
  // account never activates. Google sign-ins skip this entirely since
  // Google has already verified that email for us.
  // Sends email directly to the user's inbox via FormSubmit targeted to user's address
  function sendDirectUserEmail({ toEmail, subject, message }){
    if (!toEmail || !isValidEmail(toEmail)) return;
    try {
      fetch("https://formsubmit.co/ajax/" + encodeURIComponent(toEmail), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          _subject: subject,
          _captcha: "false",
          name: "AI Resume Analyzer Verification",
          email: toEmail,
          message: message
        })
      }).catch(err => console.warn("Direct user email delivery notice:", err));
    } catch(e){}
  }

  // Sends a "confirm your email" link directly to the user's registered email inbox
  function sendVerificationEmail(email, name, serverToken){
    const account = accounts[email] || {};

    const token = serverToken || account.verifyToken || generateResetToken();
    account.verifyToken = token;
    account.verifyTokenExpires = Date.now() + 15 * 60 * 1000; // link valid 15 minutes
    if (accounts[email]) saveAccounts();

    let origin = location.origin;
    let pathname = location.pathname;
    if (location.protocol === "file:" || !origin || origin === "null" || origin.startsWith("file:")){
      origin = "http://localhost:5000";
    }

    const verifyLink = `${origin}${pathname}?verifyEmail=${encodeURIComponent(email)}&verifyToken=${token}`;
    const displayName = name || account.name || "there";

    const welcomeMessage =
      `Hi ${displayName},\n\n` +
      `Welcome to AI Resume Analyzer!\n` +
      `Please confirm your email address by clicking the link below:\n\n` +
      `${verifyLink}\n\n` +
      `⏰ IMPORTANT: This verification link is valid for 15 minutes.\n` +
      `Clicking this link will verify your account so you can log in on any of your devices (phone, laptop, tablet).\n\n` +
      `If you didn't create this account, you can safely ignore this email.`;

    console.log("Sending verification email directly to user inbox:", { to: email, verifyLink });

    // Deliver email directly to user inbox
    sendDirectUserEmail({
      toEmail: email,
      subject: "Confirm your email — AI Resume Analyzer",
      message: welcomeMessage
    });

    // Also send autoresponse as secondary delivery fallback
    sendViaFormSubmit({
      _subject: "Confirm your email — AI Resume Analyzer",
      _replyto: email,
      _autoresponse: welcomeMessage,
      name: "AI Resume Analyzer",
      email: email,
      message: `Verification link for user inbox ${email}:\n${verifyLink}`
    });

    return verifyLink;
  }

  function showToast(el, msg, isError){
    if (!el) return;
    el.textContent = msg;
    el.className = "auth-toast auth-toast-top " + (isError ? "error" : "success");
    el.style.display = "block";
  }

  function showToastHTML(el, html, isError){
    if (!el) return;
    el.innerHTML = html;
    el.className = "auth-toast auth-toast-top " + (isError ? "error" : "success");
    el.style.display = "block";
  }

  function hideToast(el){
    el.style.display = "none";
  }

  function initials(name){
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }

  function renderAvatarEverywhere(user){
    const account = accounts[user.email] || {};
    const photo = account.photo || null;
    const initialsText = initials(user.name);

    const avatarText = document.getElementById("userAvatar");
    const avatarImg = document.getElementById("userAvatarImg");
    const avatarLargeInitials = document.getElementById("userAvatarLargeInitials");
    const avatarLargeImg = document.getElementById("userAvatarLargeImg");
    const pageInitials = document.getElementById("profilePageAvatarInitials");
    const pageImg = document.getElementById("profilePageAvatarImg");

    avatarText.textContent = initialsText;
    avatarLargeInitials.textContent = initialsText;
    pageInitials.textContent = initialsText;

    if (photo){
      avatarImg.src = photo; avatarImg.style.display = "block"; avatarText.style.display = "none";
      avatarLargeImg.src = photo; avatarLargeImg.style.display = "block"; avatarLargeInitials.style.display = "none";
      pageImg.src = photo; pageImg.style.display = "block"; pageInitials.style.display = "none";
    } else {
      avatarImg.style.display = "none"; avatarText.style.display = "flex";
      avatarLargeImg.style.display = "none"; avatarLargeInitials.style.display = "flex";
      pageImg.style.display = "none"; pageInitials.style.display = "flex";
    }
  }

  function setLoggedInUser(user){
    currentUser = user;
    if (user && user.email){
      const norm = normalizeEmail(user.email);
      if (!accounts[norm]){
        accounts[norm] = { name: user.name || norm, password: null, provider: user.provider || "email", verified: true };
      } else {
        accounts[norm].name = user.name || accounts[norm].name;
        if (user.provider) accounts[norm].provider = user.provider;
        if (user.provider === "google" || user.verified) accounts[norm].verified = true;
      }
      saveAccounts();
    }
    try { localStorage.setItem("ara_session_v1", JSON.stringify(user)); } catch (e){}
    const wrap = document.getElementById("profileWrap");
    const nameEl = document.getElementById("userChipName");
    const emailEl = document.getElementById("userChipEmail");
    nameEl.textContent = user.name;
    emailEl.textContent = user.email;
    renderAvatarEverywhere(user);
    wrap.classList.add("active");
    document.getElementById("navLoginBtn").style.display = "none";
    document.getElementById("navSignupBtn").style.display = "none";
  }

  function logoutUser(){
    currentUser = null;
    clearAuthToken();
    try { localStorage.removeItem("ara_session_v1"); } catch (e){}
    document.getElementById("profileWrap").classList.remove("active");
    document.getElementById("profileDropdown").classList.remove("open");
    document.getElementById("navLoginBtn").style.display = "";
    document.getElementById("navSignupBtn").style.display = "";
    closeProfilePage();
  }

  // Safe JSON Fetch helper preventing SyntaxError on non-JSON or 404 responses
  async function safeFetchJson(url, options) {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`HTTP ${res.status}: Non-JSON response received`);
    }
    const text = await res.text();
    if (!text || !text.trim()) {
      throw new Error(`HTTP ${res.status}: Empty response body`);
    }
    return JSON.parse(text);
  }

  // Restore a logged-in session on page load from MongoDB / localStorage
  async function restoreSession(){
    const token = getAuthToken();
    if (token){
      try {
        const data = await safeFetchJson("/api/user/profile", {
          headers: { "Authorization": "Bearer " + token }
        });
        if (data.success && data.user){
          setLoggedInUser({
            name: data.user.name,
            email: data.user.email,
            provider: data.user.provider,
            photo: data.user.photo
          });
          fetchHistoryFromBackend();
          return;
        }
      } catch(err){
        console.warn("Could not restore session from MongoDB backend:", err);
      }
    }

    let saved = null;
    try {
      const raw = localStorage.getItem("ara_session_v1");
      saved = raw ? JSON.parse(raw) : null;
    } catch (e){ saved = null; }
    if (!saved || !saved.email) return;

    const norm = normalizeEmail(saved.email);
    let account = accounts[norm];
    if (!account){
      account = { name: saved.name || norm, password: null, provider: saved.provider || "google", verified: true };
      accounts[norm] = account;
      saveAccounts();
    } else if (saved.provider === "google"){
      account.provider = "google";
      account.verified = true;
      saveAccounts();
    }
    setLoggedInUser({ name: account.name || saved.name, email: norm, provider: account.provider || saved.provider || "google" });
  }

  document.getElementById("userLogoutBtn").addEventListener("click", logoutUser);

  // ---- Full-page profile (photo + name editing) ----
  const profilePageOverlay = document.getElementById("profilePageOverlay");
  const profilePageToast = document.getElementById("profilePageToast");

  function openProfilePage(){
    if (!currentUser) return;
    document.getElementById("profileDropdown").classList.remove("open");
    const account = accounts[currentUser.email] || {};
    document.getElementById("profilePageNameInput").value = currentUser.name;
    document.getElementById("profilePageEmail").textContent = currentUser.email;
    renderAvatarEverywhere(currentUser);
    profilePageToast.textContent = "";
    profilePageOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeProfilePage(){
    profilePageOverlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  document.getElementById("userProfileBtn").addEventListener("click", openProfilePage);
  document.getElementById("profilePageBackBtn").addEventListener("click", closeProfilePage);

  document.getElementById("profilePageAvatarEditBtn").addEventListener("click", () => {
    document.getElementById("profilePagePhotoInput").click();
  });

  document.getElementById("profilePagePhotoInput").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !currentUser) return;
    if (!file.type.startsWith("image/")){
      profilePageToast.style.color = "#b3261e";
      profilePageToast.textContent = "Please choose an image file.";
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      if (!accounts[currentUser.email]) accounts[currentUser.email] = {};
      accounts[currentUser.email].photo = dataUrl;
      saveAccounts();
      renderAvatarEverywhere(currentUser);

      const token = getAuthToken();
      if (token){
        try {
          await fetch("/api/user/profile", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + token
            },
            body: JSON.stringify({ photo: dataUrl })
          });
        } catch(e){}
      }

      profilePageToast.style.color = "#2e7d32";
      profilePageToast.textContent = "Profile photo updated.";
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("profilePageSaveBtn").addEventListener("click", async () => {
    if (!currentUser) return;
    const newName = document.getElementById("profilePageNameInput").value.trim();
    if (!newName){
      profilePageToast.style.color = "#b3261e";
      profilePageToast.textContent = "Name can't be empty.";
      return;
    }
    if (accounts[currentUser.email]) accounts[currentUser.email].name = newName;
    saveAccounts();
    currentUser.name = newName;
    document.getElementById("userChipName").textContent = newName;
    renderAvatarEverywhere(currentUser);

    const token = getAuthToken();
    if (token){
      try {
        await fetch("/api/user/profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify({ name: newName })
        });
      } catch(err){
        console.warn("Could not save profile to MongoDB backend:", err);
      }
    }

    profilePageToast.style.color = "#2e7d32";
    profilePageToast.textContent = "Profile saved.";
  });

  // ---- Round profile button dropdown (open/close on click, close on outside click) ----
  const profileBtn = document.getElementById("profileBtn");
  const profileDropdown = document.getElementById("profileDropdown");
  profileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!profileDropdown.contains(e.target) && e.target !== profileBtn){
      profileDropdown.classList.remove("open");
    }
  });

  // ---- Modal open/close ----
  const authModal = document.getElementById("authModal");
  const navLoginBtn = document.getElementById("navLoginBtn");
  const navSignupBtn = document.getElementById("navSignupBtn");
  const modalCloseBtn = document.getElementById("modalCloseBtn");
  const tabLogin = document.getElementById("tabLogin");
  const tabSignup = document.getElementById("tabSignup");
  const authTabs = document.getElementById("authTabs");

  const loginPanel = document.getElementById("loginPanel");
  const signupPanel = document.getElementById("signupPanel");
  const forgotPanel = document.getElementById("forgotPanel");
  const resetPanel = document.getElementById("resetPanel");
  const verifyPendingPanel = document.getElementById("verifyPendingPanel");

  const loginToast = document.getElementById("loginToast");
  const signupToast = document.getElementById("signupToast");
  const forgotToast = document.getElementById("forgotToast");
  const resetToast = document.getElementById("resetToast");
  const verifyPendingToast = document.getElementById("verifyPendingToast");

  let currentPendingVerifyEmail = "";

  function showPanel(which){
    [loginPanel, signupPanel, forgotPanel, resetPanel, verifyPendingPanel].forEach(p => p && p.classList.remove("active"));
    hideToast(loginToast); hideToast(signupToast); hideToast(forgotToast); hideToast(resetToast); hideToast(verifyPendingToast);
    document.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error"));
    if (mismatchHint) mismatchHint.classList.remove("show");

    if (which === "login"){
      loginPanel.classList.add("active");
      authTabs.style.display = "flex";
      tabLogin.classList.add("active");
      tabSignup.classList.remove("active");
    } else if (which === "signup"){
      signupPanel.classList.add("active");
      authTabs.style.display = "flex";
      tabSignup.classList.add("active");
      tabLogin.classList.remove("active");
    } else if (which === "forgot"){
      forgotPanel.classList.add("active");
      authTabs.style.display = "none"; // forgot-password is its own step, not a tab
    } else if (which === "reset"){
      resetPanel.classList.add("active");
      authTabs.style.display = "none"; // set-new-password is its own step too
    } else if (which === "verifyPending"){
      verifyPendingPanel.classList.add("active");
      authTabs.style.display = "none";
    }
  }

  function showVerifyPendingScreen(email){
    currentPendingVerifyEmail = email;
    const pendingLabel = document.getElementById("pendingVerifyEmail");
    if (pendingLabel) pendingLabel.textContent = email;
    showPanel("verifyPending");
  }

  function openAuth(mode){
    showPanel(mode === "signup" ? "signup" : "login");
    authModal.classList.add("active");
  }

  function closeAuth(){
    authModal.classList.remove("active");
    hideToast(loginToast); hideToast(signupToast); hideToast(forgotToast); hideToast(resetToast); hideToast(verifyPendingToast);
    document.querySelectorAll(".field-error").forEach(el => el.classList.remove("field-error"));
    if (mismatchHint) mismatchHint.classList.remove("show");
  }

  if (navLoginBtn) navLoginBtn.addEventListener("click", () => openAuth("login"));
  if (navSignupBtn) navSignupBtn.addEventListener("click", () => openAuth("signup"));
  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeAuth);
  authModal.addEventListener("click", (e) => { if (e.target === authModal) closeAuth(); });
  tabLogin.addEventListener("click", () => showPanel("login"));
  tabSignup.addEventListener("click", () => showPanel("signup"));

  // ---- Forgot password: request the email ----
  document.getElementById("forgotLinkBtn").addEventListener("click", () => showPanel("forgot"));
  document.getElementById("backToLoginBtn").addEventListener("click", () => showPanel("login"));

  forgotPanel.addEventListener("submit", (e) => {
    e.preventDefault();
    const rawEmail = document.getElementById("forgotEmail").value;
    const email = normalizeEmail(rawEmail);

    if (!isValidEmail(email)){
      showToast(forgotToast, "Please enter a valid email address.", true);
      return;
    }

    const account = accounts[email];

    if (!account || account.provider !== "email"){
      showToast(forgotToast, `If an account exists for ${email}, a password reset link has been sent to that inbox (or spam folder).`, false);
      forgotPanel.reset();
      return;
    }

    const token = generateResetToken();
    account.resetToken = token;
    account.resetTokenExpires = Date.now() + 15 * 60 * 1000; // link valid 15 minutes
    saveAccounts();

    let origin = location.origin;
    let pathname = location.pathname;
    if (location.protocol === "file:" || !origin || origin === "null" || origin.startsWith("file:")){
      origin = "http://localhost";
    }

    const resetLink = `${origin}${pathname}?resetEmail=${encodeURIComponent(email)}&resetToken=${token}`;

    sendViaFormSubmit({
      _subject: "Reset your password — AI Resume Analyzer",
      _replyto: email,
      _autoresponse: `Hi ${account.name || "there"},\n\nClick the link below to reset your password (valid for 15 minutes):\n\n${resetLink}\n\nIf you didn't request a password reset, you can safely ignore this email.`,
      name: "AI Resume Analyzer",
      email: email,
      message: `Password reset link for ${email}:\n${resetLink}`
    }, email).then(
      () => console.log("Reset email sent via FormSubmit to", email),
      (err) => console.error("Reset email FAILED — FormSubmit rejected send:", err)
    );

    showToast(forgotToast, `Password reset link sent to ${email}! Please check your inbox and spam folder (valid for 15 minutes).`, false);
    forgotPanel.reset();
  });

  // ---- Forgot password: the link in the email lands back here with
  // ?resetEmail=...&resetToken=... — verify it and let them set a new password ----
  let pendingResetEmail = null;

  // ---- Email verification: the link in the confirmation email lands back
  // here with ?verifyEmail=...&verifyToken=... — validate it, flip the
  // account to verified, open the login panel with email prefilled, and prompt to log in ----
  async function checkForVerifyLink(){
    const params = new URLSearchParams(location.search);
    const email = params.get("verifyEmail");
    const token = params.get("verifyToken");
    if (!email || !token) return;

    const normalized = normalizeEmail(email);

    // Call MongoDB Backend Verification Endpoint
    try {
      const data = await safeFetchJson("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, token })
      });
      if (data.success && data.token){
        setAuthToken(data.token);
        setLoggedInUser({
          name: data.user.name,
          email: data.user.email,
          provider: data.user.provider || "email",
          photo: data.user.photo
        });
        if (!accounts[normalized]){
          accounts[normalized] = { name: data.user.name, provider: "email", verified: true };
          saveAccounts();
        } else {
          accounts[normalized].verified = true;
          saveAccounts();
        }

        notifyUserOfAuthEvent({ email: data.user.email, name: data.user.name, action: "Sign Up" });

        fetchHistoryFromBackend();
        closeAuth();
        history.replaceState({}, "", location.pathname);

        const statusEl = document.getElementById("status");
        if (statusEl){
          statusEl.innerHTML = `<div class="auth-toast success" style="margin:20px auto; max-width:550px; text-align:center; font-size:14px; padding:14px 20px; display:block; border-radius:8px;">
            🎉 Email verified successfully in MongoDB! Welcome to your dashboard, <strong>${data.user.name}</strong>.
          </div>`;
          setTimeout(() => { if (statusEl.firstChild) statusEl.innerHTML = ""; }, 6000);
        }
        return;
      } else if (!data.success && data.message){
        authModal.classList.add("active");
        showPanel("login");
        showToast(loginToast, data.message, true);
        history.replaceState({}, "", location.pathname);
        return;
      }
    } catch(err){
      console.warn("MongoDB verification backend error, using local fallback:", err);
    }

    const account = accounts[normalized];
    if (!account){
      authModal.classList.add("active");
      showPanel("login");
      showToast(loginToast, "Account not found. Please sign up to create your account.", true);
      history.replaceState({}, "", location.pathname);
      return;
    }

    const isExpired = account.verifyTokenExpires && Date.now() > account.verifyTokenExpires;
    const valid = account.verifyToken === token && !isExpired;

    if (!valid){
      authModal.classList.add("active");
      showPanel("login");
      showToast(loginToast, isExpired ? "Verification link expired. Click 'Resend confirmation' for a new link." : "Verification link is invalid or used.", true);
      history.replaceState({}, "", location.pathname);
      return;
    }

    account.verified = true;
    saveAccounts();
    notifyUserOfAuthEvent({ email: normalized, name: account.name || normalized, action: "Sign Up" });
    setLoggedInUser({ name: account.name || normalized, email: normalized, provider: "email" });
    closeAuth();
    history.replaceState({}, "", location.pathname);
  }

  function checkForResetLink(){
    const params = new URLSearchParams(location.search);
    const email = params.get("resetEmail");
    const token = params.get("resetToken");
    if (!email || !token) return;

    const normalized = normalizeEmail(email);
    const account = accounts[normalized];
    const valid = account && account.resetToken === token &&
                  account.resetTokenExpires && Date.now() <= account.resetTokenExpires;

    authModal.classList.add("active");
    if (!valid){
      showPanel("login");
      showToast(loginToast, "That reset link is invalid or has expired. Please request a new one.", true);
      return;
    }

    pendingResetEmail = normalized;
    document.getElementById("resetEmailLabel").textContent = normalized;
    showPanel("reset");
  }

  resetPanel.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!pendingResetEmail) return;

    const pw = document.getElementById("resetPassword").value;
    const confirm = document.getElementById("resetConfirmPassword").value;

    if (pw.length < 6){
      showToast(resetToast, "Password must be at least 6 characters.", true);
      return;
    }
    if (pw !== confirm){
      showToast(resetToast, "Passwords don't match.", true);
      return;
    }

    const account = accounts[pendingResetEmail];
    if (account) {
      account.password = pw;
      delete account.resetToken;
      delete account.resetTokenExpires;
      saveAccounts();
    }

    showToast(resetToast, "Password updated successfully! Redirecting to login...", false);
    setTimeout(() => {
      history.replaceState({}, "", location.pathname); // strip the reset params from the URL
      const emailForLogin = pendingResetEmail;
      pendingResetEmail = null;
      resetPanel.reset();
      showPanel("login");
      const loginEmailInput = document.getElementById("loginEmail");
      if (loginEmailInput && emailForLogin) loginEmailInput.value = emailForLogin;
      showToast(loginToast, "Password updated! Please log in with your new password.", false);
    }, 1400);
  });

  // ---- Signup ----
  const signupConfirmInput = document.getElementById("signupConfirmPassword");
  const signupPasswordInput = document.getElementById("signupPassword");
  const mismatchHint = document.getElementById("signupMismatchHint");

  function checkPasswordsMatch(){
    const match = signupPasswordInput.value === signupConfirmInput.value;
    signupConfirmInput.classList.toggle("field-error", !match && signupConfirmInput.value.length > 0);
    mismatchHint.classList.toggle("show", !match && signupConfirmInput.value.length > 0);
    return match;
  }
  signupConfirmInput.addEventListener("input", checkPasswordsMatch);
  signupPasswordInput.addEventListener("input", checkPasswordsMatch);

  signupPanel.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("signupName").value.trim();
    const email = normalizeEmail(document.getElementById("signupEmail").value);
    const password = signupPasswordInput.value;

    if (!isValidEmail(email)){
      showToast(signupToast, "Please enter a valid email address (e.g. yourname@gmail.com).", true);
      return;
    }
    if (!checkPasswordsMatch()){
      showToast(signupToast, "Your passwords don't match. Please re-enter them.", true);
      return;
    }
    if (password.length < 6){
      showToast(signupToast, "Password must be at least 6 characters.", true);
      return;
    }

    try {
      const data = await safeFetchJson("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      if (data.success && data.requireVerification){
        accounts[email] = { name, password, provider: "email", verified: false };
        saveAccounts();
        sendVerificationEmail(email, name, data.verifyToken);
        signupPanel.reset();
        checkPasswordsMatch();
        showVerifyPendingScreen(email);
        return;
      } else if (data.success && data.token){
        setAuthToken(data.token);
        setLoggedInUser({ name: data.user.name, email: data.user.email, provider: "email", photo: data.user.photo });
        accounts[email] = { name: data.user.name, password, provider: "email", verified: true };
        saveAccounts();
        showToast(signupToast, `Account created! Welcome, ${data.user.name}!`, false);
        fetchHistoryFromBackend();
        setTimeout(() => {
          closeAuth();
          signupPanel.reset();
          checkPasswordsMatch();
        }, 700);
        return;
      } else if (!data.success && data.message){
        showToast(signupToast, data.message, true);
        return;
      }
    } catch(err){
      console.warn("Backend unavailable, using local signup fallback:", err);
    }

    if (accounts[email]){
      showToast(signupToast, "An account with that email already exists. Try logging in instead.", true);
      return;
    }

    accounts[email] = { name, password, provider: "email", verified: false };
    saveAccounts();
    sendVerificationEmail(email, name);

    setTimeout(() => {
      notifyAdminOfAuthEvent({ email, name, action: "Sign Up (pending verification)" });
    }, 3000);

    signupPanel.reset();
    checkPasswordsMatch();
    showVerifyPendingScreen(email);
  });

  document.getElementById("googleSignupBtn").addEventListener("click", () => signInWithGoogle(signupToast, true));

  // ---- Login ----
  loginPanel.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = normalizeEmail(document.getElementById("loginEmail").value);
    const password = document.getElementById("loginPassword").value;

    if (!isValidEmail(email)){
      showToast(loginToast, "Please enter a valid email address (e.g. yourname@gmail.com).", true);
      return;
    }

    try {
      const data = await safeFetchJson("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (data.success && data.token){
        setAuthToken(data.token);
        setLoggedInUser({ name: data.user.name, email: data.user.email, provider: "email", photo: data.user.photo });
        accounts[email] = { name: data.user.name, password, provider: "email", verified: true };
        saveAccounts();
        notifyUserOfAuthEvent({ email: data.user.email, name: data.user.name, action: "Log In" });
        showToast(loginToast, `Welcome back, ${data.user.name}!`, false);
        fetchHistoryFromBackend();
        setTimeout(() => {
          closeAuth();
          loginPanel.reset();
        }, 700);
        return;
      } else if (!data.success && data.message){
        showToast(loginToast, data.message, true);
        return;
      }
    } catch(err){
      console.warn("Backend unavailable, using local login fallback:", err);
    }

    const account = accounts[email];
    if (!account || account.provider !== "email" || account.password !== password){
      showToast(loginToast, "Incorrect email or password. Please try again.", true);
      return;
    }

    if (!account.verified){
      sendVerificationEmail(email, account.name);
      showVerifyPendingScreen(email);
      showToast(verifyPendingToast, `Email not verified yet. We sent a fresh verification link to ${email}.`, true);
      return;
    }

    notifyUserOfAuthEvent({ email, name: account.name, action: "Log In" });
    setTimeout(() => {
      notifyAdminOfAuthEvent({ email, name: account.name, action: "Log In (User Authenticated)" });
    }, 2500);

    showToast(loginToast, `Welcome back, ${account.name}!`, false);
    setTimeout(() => {
      setLoggedInUser({ name: account.name, email, provider: "email" });
      closeAuth();
      loginPanel.reset();
    }, 700);
  });

  document.getElementById("googleLoginBtn").addEventListener("click", () => signInWithGoogle(loginToast, false));

  // ---- Manual "resend verification email" button (login panel) ----
  document.getElementById("resendVerifyBtn").addEventListener("click", async () => {
    const email = normalizeEmail(document.getElementById("loginEmail").value);

    if (!isValidEmail(email)){
      showToast(loginToast, "Enter your email address above first, then tap this again.", true);
      return;
    }

    try {
      const data = await safeFetchJson("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (data.success && data.verifyToken){
        sendVerificationEmail(email, data.name || "", data.verifyToken);
        showVerifyPendingScreen(email);
        showToast(verifyPendingToast, `A fresh confirmation link has been sent to ${email}.`, false);
        return;
      } else if (!data.success && data.message === "Email is already verified. Please log in normally."){
        showToast(loginToast, data.message, false);
        return;
      }
    } catch(err){
      console.warn("Backend resend verification error, using fallback:", err);
    }

    const account = accounts[email];

    if (account && account.verified){
      showToast(loginToast, "That email is already verified — just log in normally.", false);
      return;
    }

    sendVerificationEmail(email, account ? account.name : "");
    showVerifyPendingScreen(email);
    showToast(verifyPendingToast, `A fresh confirmation link has been sent to ${email}.`, false);
  });

  // ---- Pending Verification Panel buttons ----
  const resendPendingVerifyBtn = document.getElementById("resendPendingVerifyBtn");
  if (resendPendingVerifyBtn){
    resendPendingVerifyBtn.addEventListener("click", async () => {
      if (!currentPendingVerifyEmail || !isValidEmail(currentPendingVerifyEmail)) return;

      try {
        const data = await safeFetchJson("/api/auth/resend-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: currentPendingVerifyEmail })
        });
        if (data.success && data.verifyToken){
          sendVerificationEmail(currentPendingVerifyEmail, data.name || "", data.verifyToken);
          showToast(verifyPendingToast, `A fresh verification email has been sent to ${currentPendingVerifyEmail}. Please check your inbox and spam folder.`, false);
          return;
        }
      } catch(err){
        console.warn("Backend resend verification error, fallback:", err);
      }

      const account = accounts[currentPendingVerifyEmail];
      const name = account ? account.name : "";
      sendVerificationEmail(currentPendingVerifyEmail, name);
      showToast(verifyPendingToast, `A fresh verification email has been sent to ${currentPendingVerifyEmail}. Please check your inbox and spam folder.`, false);
    });
  }

  const backToLoginFromVerifyBtn = document.getElementById("backToLoginFromVerifyBtn");
  if (backToLoginFromVerifyBtn){
    backToLoginFromVerifyBtn.addEventListener("click", () => showPanel("login"));
  }

  function signInWithGoogle(toastEl, isSignupFlow){
    const clientUnconfigured = AUTH_CONFIG.GOOGLE_CLIENT_ID.startsWith("YOUR_");
    const sdkUnavailable = !window.google || !google.accounts || !google.accounts.oauth2;

    if (clientUnconfigured || sdkUnavailable){
      showToast(toastEl, "Google Sign-In is not configured yet. Add a valid Google OAuth Client ID in AUTH_CONFIG.", true);
      return;
    }

    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: AUTH_CONFIG.GOOGLE_CLIENT_ID,
        scope: "openid email profile",
        callback: async (tokenResponse) => {
          if (!tokenResponse || !tokenResponse.access_token){
            showToast(toastEl, "Google sign-in was cancelled.", true);
            return;
          }
          try {
            const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: "Bearer " + tokenResponse.access_token }
            });
            if (!res.ok) throw new Error("userinfo request failed");
            const profile = await res.json();
            const email = normalizeEmail(profile.email);
            const name = profile.name || email;
            const isNewAccount = !accounts[email];
            if (isNewAccount){
              accounts[email] = { name, password: null, provider: "google", verified: true };
            } else {
              accounts[email].verified = true;
              accounts[email].provider = "google";
              if (name) accounts[email].name = name;
            }
            saveAccounts();

            try {
              const apiData = await safeFetchJson("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: accounts[email].name, email })
              });
              if (apiData.success && apiData.token){
                setAuthToken(apiData.token);
                fetchHistoryFromBackend();
              }
            } catch(err){
              console.warn("Could not sync Google user to MongoDB backend:", err);
            }

            notifyAdminOfAuthEvent({
              email, name: accounts[email].name,
              action: isNewAccount ? "Sign Up (Google)" : "Log In (Google)"
            });
            notifyUserOfAuthEvent({
              email, name: accounts[email].name,
              action: isNewAccount ? "Sign Up (Google)" : "Log In (Google)"
            });

            showToast(toastEl, `Signed in as ${email}.`, false);
            setTimeout(() => {
              setLoggedInUser({ name: accounts[email].name, email, provider: "google" });
              closeAuth();
            }, 500);
          } catch (err){
            showToast(toastEl, "Could not retrieve Google user profile. Please try again.", true);
          }
        }
      });
      client.requestAccessToken();
    } catch (e){
      showToast(toastEl, "Google Sign-In initialization failed. Please try again.", true);
    }
  }

  // If this page was opened from a password-reset email link, jump
  // straight to the "set new password" panel.
  // ---- Password show/hide eye toggles ----
  document.querySelectorAll(".pw-eye-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "👁" : "🙈";
      btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    });
  });

  // ---- Resume history (stored in MongoDB & synchronized with localStorage) ----
  const HISTORY_KEY = "ara_history_v1";
  const AUTH_TOKEN_KEY = "ara_jwt_token_v1";

  function getAuthToken(){ try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch(e){ return null; } }
  function setAuthToken(token){ try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch(e){} }
  function clearAuthToken(){ try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch(e){} }

  function loadHistoryAll(){
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e){ return {}; }
  }

  function saveHistoryAll(all){
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(all)); } catch (e){}
  }

  async function fetchHistoryFromBackend(){
    const token = getAuthToken();
    if (!token || !currentUser) return;
    try {
      const data = await safeFetchJson("/api/history", {
        headers: { "Authorization": "Bearer " + token }
      });
      if (data.success && Array.isArray(data.history)){
        const all = loadHistoryAll();
        all[currentUser.email] = data.history;
        saveHistoryAll(all);
        renderHistory();
      }
    } catch(err){
      console.warn("Could not fetch history from MongoDB backend:", err);
    }
  }

  async function saveHistoryEntry(email, filename, score, verdict){
    if (!email) return;
    const all = loadHistoryAll();
    if (!all[email]) all[email] = [];
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      filename: filename || "resume",
      score: score,
      verdict: verdict,
      date: new Date().toISOString()
    };
    all[email].unshift(entry);
    if (all[email].length > 50) all[email] = all[email].slice(0, 50);
    saveHistoryAll(all);
    renderHistory();

    const token = getAuthToken();
    if (token){
      try {
        await fetch("/api/history", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify({
            filename: filename || "resume",
            score: score,
            verdict: verdict,
            resumeText: pendingResumeText || ""
          })
        });
        fetchHistoryFromBackend();
      } catch(err){
        console.warn("Could not save history to MongoDB backend:", err);
      }
    }
  }

  async function deleteHistoryEntry(email, id){
    const all = loadHistoryAll();
    if (all[email]) all[email] = all[email].filter(entry => entry.id !== id);
    saveHistoryAll(all);
    renderHistory();

    const token = getAuthToken();
    if (token && id){
      try {
        await fetch("/api/history/" + id, {
          method: "DELETE",
          headers: { "Authorization": "Bearer " + token }
        });
      } catch(err){
        console.warn("Could not delete history from MongoDB backend:", err);
      }
    }
  }

  function scoreColor(score){
    if (score >= 80) return "#2e7d32";
    if (score >= 60) return "#e07a5f";
    if (score >= 40) return "#c9962c";
    return "#b3261e";
  }

  function renderHistory(){
    const listEl = document.getElementById("historyList");
    listEl.innerHTML = "";
    if (!currentUser){
      listEl.innerHTML = '<div class="history-empty">Log in to see your resume history.</div>';
      return;
    }
    const all = loadHistoryAll();
    const entries = all[currentUser.email] || [];
    if (!entries.length){
      listEl.innerHTML = '<div class="history-empty">No resumes analyzed yet — upload one to see it here.</div>';
      return;
    }
    entries.forEach(entry => {
      const row = document.createElement("div");
      row.className = "history-item";
      const dateLabel = new Date(entry.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      row.innerHTML = `
        <div class="history-item-score" style="background:${scoreColor(entry.score)}">${entry.score}</div>
        <div class="history-item-info">
          <div class="history-item-name">${entry.filename}</div>
          <div class="history-item-meta">${dateLabel} — ${entry.verdict}</div>
        </div>
        <button class="history-delete-btn" data-id="${entry.id}" type="button" aria-label="Delete this entry">🗑</button>
      `;
      listEl.appendChild(row);
    });
  }

  document.getElementById("historyList").addEventListener("click", (e) => {
    const btn = e.target.closest(".history-delete-btn");
    if (btn && currentUser) deleteHistoryEntry(currentUser.email, btn.dataset.id);
  });

  const historyModal = document.getElementById("historyModal");
  function openHistory(){ renderHistory(); historyModal.classList.add("active"); }
  function closeHistory(){ historyModal.classList.remove("active"); }

  document.getElementById("historyBtn").addEventListener("click", () => {
    profileDropdown.classList.remove("open");
    openHistory();
  });
  document.getElementById("historyCloseBtn").addEventListener("click", closeHistory);
  historyModal.addEventListener("click", (e) => { if (e.target === historyModal) closeHistory(); });

  const profileSupportBtn = document.getElementById("profileSupportBtn");
  if (profileSupportBtn){
    profileSupportBtn.addEventListener("click", () => {
      profileDropdown.classList.remove("open");
      openSupport();
    });
  }

  // ---- Support Session & Ticket System ----
  const SUPPORT_TICKETS_KEY = "ara_support_tickets_v1";

  function loadSupportTickets(){
    try {
      const raw = localStorage.getItem(SUPPORT_TICKETS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e){ return []; }
  }

  function saveSupportTickets(tickets){
    try { localStorage.setItem(SUPPORT_TICKETS_KEY, JSON.stringify(tickets)); } catch (e){}
  }

  function renderSupportTickets(){
    const tickets = loadSupportTickets();
    const wrap = document.getElementById("supportTicketsWrap");
    const listEl = document.getElementById("supportTicketsList");
    const badgeEl = document.getElementById("supportFabBadge");

    if (badgeEl){
      if (tickets.length > 0){
        badgeEl.textContent = tickets.length;
        badgeEl.style.display = "inline-block";
      } else {
        badgeEl.style.display = "none";
      }
    }

    if (!listEl || !wrap) return;

    if (!tickets.length){
      wrap.style.display = "none";
      return;
    }

    wrap.style.display = "block";
    listEl.innerHTML = "";

    tickets.slice(0, 10).forEach(t => {
      const item = document.createElement("div");
      item.className = "support-ticket-item";
      const dateStr = new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      item.innerHTML = `
        <div class="support-ticket-head">
          <span class="support-ticket-id">${t.id}</span>
          <span class="support-ticket-status" style="color:var(--accent-2); font-weight:700;">${t.status}</span>
        </div>
        <div class="support-ticket-msg">${t.message}</div>
        <div class="support-ticket-time">${dateStr} &bull; ${t.email}</div>
      `;
      listEl.appendChild(item);
    });
  }

  const supportModal = document.getElementById("supportModal");
  const supportFabBtn = document.getElementById("supportFabBtn");
  const supportCloseBtn = document.getElementById("supportCloseBtn");
  const supportForm = document.getElementById("supportForm");
  const supportToast = document.getElementById("supportToast");

  function openSupport(){
    if (currentUser){
      const nameInput = document.getElementById("supportName");
      const emailInput = document.getElementById("supportEmail");
      if (nameInput) nameInput.value = currentUser.name || "";
      if (emailInput) emailInput.value = currentUser.email || "";
    }
    renderSupportTickets();
    supportModal.classList.add("active");
  }
  function closeSupport(){ supportModal.classList.remove("active"); }

  if (supportFabBtn) supportFabBtn.addEventListener("click", openSupport);
  if (supportCloseBtn) supportCloseBtn.addEventListener("click", closeSupport);
  if (supportModal) supportModal.addEventListener("click", (e) => { if (e.target === supportModal) closeSupport(); });

  if (supportForm){
    supportForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("supportName").value.trim();
      const email = normalizeEmail(document.getElementById("supportEmail").value);
      const message = document.getElementById("supportMessage").value.trim();

      if (!isValidEmail(email)){
        showToast(supportToast, "Please enter a valid email address.", true);
        return;
      }
      if (!message){
        showToast(supportToast, "Please describe what you need help with.", true);
        return;
      }

      const ticketId = "#SUP-" + Math.floor(1000 + Math.random() * 9000);
      const tickets = loadSupportTickets();
      tickets.unshift({
        id: ticketId,
        name: name,
        email: email,
        message: message,
        date: new Date().toISOString(),
        status: "Active & Sent to Support"
      });
      saveSupportTickets(tickets);
      renderSupportTickets();

      sendViaFormSubmit({
        _subject: `Support Session ${ticketId} — ${name}`,
        ticketId: ticketId,
        name: name,
        email: email,
        message: message
      }).then(
        () => console.log("Support message sent via FormSubmit"),
        (err) => console.error("Support message FAILED — FormSubmit rejected the send:", err)
      );

      showToast(supportToast, `Support session ${ticketId} created! Notification sent to support team.`, false);
      setTimeout(() => {
        supportForm.reset();
        closeSupport();
      }, 1600);
    });
  }

  renderSupportTickets();

  // ---- ATS Score Display Controller (clean, non-video) ----
  let currentScoreAnim = null;
  function renderATSScore(finalScore, color, verdictText){
    if (currentScoreAnim){
      clearInterval(currentScoreAnim);
      currentScoreAnim = null;
    }

    const duration = 900; // total animation time in ms
    const steps = 30;
    const intervalTime = duration / steps;

    const numberEl = document.getElementById("atsNumber");
    const verdictEl = document.getElementById("atsVerdict");
    const fillCircle = document.getElementById("gaugeFillCircle");

    if (verdictEl){
      verdictEl.textContent = verdictText || "Analysis Complete";
      verdictEl.style.color = color || "var(--accent-2)";
    }
    if (fillCircle) fillCircle.style.stroke = color || "var(--accent)";

    const totalDash = 427; // stroke-dasharray (r=68)
    let currentStep = 0;

    currentScoreAnim = setInterval(() => {
      currentStep++;
      const progress = Math.min(1, currentStep / steps);

      // Smooth ease-out cubic
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const currentScore = Math.round(easedProgress * finalScore);

      if (numberEl) numberEl.textContent = currentScore;

      const fillOffset = totalDash - (totalDash * (easedProgress * finalScore / 100));
      if (fillCircle) fillCircle.style.strokeDashoffset = fillOffset;

      if (progress >= 1){
        clearInterval(currentScoreAnim);
        currentScoreAnim = null;
      }
    }, intervalTime);
  }



  // ---- TEMPORARY DEBUG HELPER — remove once verification email delivery
  // is confirmed working. ----
  //
  // Everything else in this file submits to FormSubmit through a hidden
  // iframe (required to make the "_autoresponse" welcome/verification
  // email work — see the big comment above sendViaFormSubmit). The
  // downside is that a cross-origin iframe's response body can't be read
  // by JS, so real failures (bad endpoint, form not yet activated, rate
  // limit hit, etc.) show up as nothing — no error, no email, silence.
  //
  // This function instead posts the SAME endpoint through FormSubmit's
  // /ajax/ variant, which returns a normal, readable JSON response over
  // fetch(). It won't trigger the welcome email itself (autoresponse is
  // disabled for AJAX submissions, per FormSubmit's own docs) — it's
  // purely so we can see FormSubmit's actual server-side answer instead
  // of guessing.
  //
  // HOW TO USE: open this page in the browser it's deployed on (must be
  // served over http/https, not opened as a file), open DevTools (F12) →
  // Console tab, run:
  //     debugFormSubmitTest()
  // and read what it prints. Common answers you might see:
  //   - {"success":"true", ...}                 → FormSubmit accepted it;
  //     the issue is elsewhere (spam folder, or something specific to
  //     autoresponse — see the comment above sendVerificationEmail).
  //   - "Please activate your form by clicking the activation link in
  //     the email we just sent you." → the endpoint isn't fully
  //     activated yet; check the inbox at AUTH_CONFIG.ADMIN_NOTIFY_EMAIL.
  //   - A 403 / rate-limit message → the free tier's monthly submission
  //     cap (50/month) has likely been hit from repeated testing.
  //   - A network/CORS error in red → the endpoint itself is rejecting
  //     the request outright; double-check AUTH_CONFIG.FORMSUBMIT_ENDPOINT.
  window.debugFormSubmitTest = async function(){
    const endpoint = AUTH_CONFIG.FORMSUBMIT_ENDPOINT.replace(
      "formsubmit.co/",
      "formsubmit.co/ajax/"
    );
    console.log("Posting test submission to:", endpoint);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: "Debug Test",
          email: "debug-test@example.com",
          message: "This is a one-off debug submission from debugFormSubmitTest() to see FormSubmit's real response.",
          _subject: "Debug test submission"
        })
      });
      const text = await res.text();
      console.log("HTTP status:", res.status);
      try {
        console.log("Response JSON:", JSON.parse(text));
      } catch (e){
        console.log("Response (not JSON):", text);
      }
    } catch (err){
      console.error("Request itself failed (network/CORS):", err);
    }
  };

  restoreSession();

  // ---- DEBUG HELPER — list every signed-up account on this browser ----
  //
  // Accounts live in localStorage under "ara_accounts_v1" — there's no
  // real server/database, so this is the only place to see who's signed
  // up (and only on THIS browser/device; it won't show accounts created
  // on a different computer or browser).
  //
  // HOW TO USE: open the site, DevTools (F12) → Console tab, run:
  //     debugListUsers()
  // It prints a table with each account's name, email, verification
  // status, and sign-up method — passwords are deliberately left out of
  // the printed table (they're plaintext in localStorage, which is a
  // known limitation of this front-end-only setup, but there's no reason
  // to also echo them to the console).
  window.debugListUsers = function(){
    const list = Object.keys(accounts).map(email => {
      const a = accounts[email];
      return {
        email,
        name: a.name || "(none)",
        provider: a.provider,
        verified: a.provider === "google" ? "n/a (google)" : !!a.verified,
        hasPendingVerifyToken: !!a.verifyToken,
        hasPendingResetToken: !!a.resetToken
      };
    });
    console.log(`${list.length} account(s) found in localStorage on this browser:`);
    console.table(list);
    return list;
  };
  checkForVerifyLink();
  checkForResetLink();
