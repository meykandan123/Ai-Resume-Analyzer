  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  // Snapshot of the most recent analysis, used by the "Download PDF Report" button.
  let lastAnalysisData = null;

  // Active authenticated user state
  let currentUser = null;

  // ---- Analysis mode selection state ----
  // Holds the extracted resume text/filename between "upload" and the user
  // picking an analysis type, so the file doesn't need to be re-uploaded.
  let pendingResumeText = null;
  let pendingResumeFilename = null;
  let analysisMode = null; // "ats" | "normal" | null
  let historySavedForCurrentUpload = false;

  // ---------------------------------------------------------------
  // Comprehensive Industry Skill Dictionary & Precision Extractor
  // ---------------------------------------------------------------
  const SKILL_KEYWORDS = [
    // Programming languages (lang)
    { name: "python", type: "lang" },
    { name: "java", type: "lang" },
    { name: "javascript", type: "lang" },
    { name: "typescript", type: "lang" },
    { name: "c++", type: "lang" },
    { name: "c#", type: "lang" },
    { name: "c", type: "lang" },
    { name: "php", type: "lang" },
    { name: "ruby", type: "lang" },
    { name: "go", type: "lang" },
    { name: "rust", type: "lang" },
    { name: "swift", type: "lang" },
    { name: "kotlin", type: "lang" },
    { name: "sql", type: "lang" },
    { name: "html", type: "lang" },
    { name: "html5", type: "lang" },
    { name: "css", type: "lang" },
    { name: "css3", type: "lang" },
    { name: "bash", type: "lang" },
    { name: "shell", type: "lang" },
    { name: "r", type: "lang" },
    { name: "dart", type: "lang" },
    { name: "scala", type: "lang" },

    // Frameworks & Libraries (tool)
    { name: "react", type: "tool" },
    { name: "react.js", type: "tool" },
    { name: "react native", type: "tool" },
    { name: "angular", type: "tool" },
    { name: "vue", type: "tool" },
    { name: "vue.js", type: "tool" },
    { name: "next.js", type: "tool" },
    { name: "node.js", type: "tool" },
    { name: "express", type: "tool" },
    { name: "express.js", type: "tool" },
    { name: "django", type: "tool" },
    { name: "flask", type: "tool" },
    { name: "fastapi", type: "tool" },
    { name: "spring", type: "tool" },
    { name: "spring boot", type: "tool" },
    { name: ".net", type: "tool" },
    { name: "asp.net", type: "tool" },
    { name: "laravel", type: "tool" },
    { name: "bootstrap", type: "tool" },
    { name: "tailwind", type: "tool" },
    { name: "tailwind css", type: "tool" },
    { name: "redux", type: "tool" },
    { name: "flutter", type: "tool" },
    { name: "jquery", type: "tool" },

    // Data / AI / ML
    { name: "machine learning", type: "tool" },
    { name: "deep learning", type: "tool" },
    { name: "nlp", type: "tool" },
    { name: "artificial intelligence", type: "tool" },
    { name: "tensorflow", type: "tool" },
    { name: "pytorch", type: "tool" },
    { name: "keras", type: "tool" },
    { name: "scikit-learn", type: "tool" },
    { name: "opencv", type: "tool" },
    { name: "pandas", type: "tool" },
    { name: "numpy", type: "tool" },
    { name: "data analysis", type: "tool" },
    { name: "data science", type: "tool" },
    { name: "tableau", type: "tool" },
    { name: "power bi", type: "tool" },

    // Databases & Storage
    { name: "mysql", type: "tool" },
    { name: "postgresql", type: "tool" },
    { name: "mongodb", type: "tool" },
    { name: "redis", type: "tool" },
    { name: "sqlite", type: "tool" },
    { name: "oracle", type: "tool" },
    { name: "firebase", type: "tool" },
    { name: "prisma", type: "tool" },
    { name: "mongoose", type: "tool" },

    // Cloud / DevOps / Tools
    { name: "aws", type: "tool" },
    { name: "amazon web services", type: "tool" },
    { name: "azure", type: "tool" },
    { name: "gcp", type: "tool" },
    { name: "google cloud", type: "tool" },
    { name: "docker", type: "tool" },
    { name: "kubernetes", type: "tool" },
    { name: "jenkins", type: "tool" },
    { name: "ci/cd", type: "tool" },
    { name: "git", type: "tool" },
    { name: "github", type: "tool" },
    { name: "gitlab", type: "tool" },
    { name: "linux", type: "tool" },
    { name: "nginx", type: "tool" },
    { name: "apache", type: "tool" },
    { name: "rest api", type: "tool" },
    { name: "graphql", type: "tool" },
    { name: "microservices", type: "tool" },
    { name: "system design", type: "tool" },

    // Testing & Tools
    { name: "jest", type: "tool" },
    { name: "cypress", type: "tool" },
    { name: "selenium", type: "tool" },
    { name: "junit", type: "tool" },
    { name: "figma", type: "tool" },
    { name: "jira", type: "tool" },

    // Soft / Management / Core
    { name: "project management", type: "soft" },
    { name: "communication", type: "soft" },
    { name: "leadership", type: "soft" },
    { name: "teamwork", type: "soft" },
    { name: "problem solving", type: "soft" },
    { name: "agile", type: "soft" },
    { name: "scrum", type: "soft" },
    { name: "excel", type: "soft" },
    { name: "analytical skills", type: "soft" },
    { name: "time management", type: "soft" }
  ];

  // Extra headers used for section-presence checks (Sections Found / Missing)
  // and to help extractSection() find correct boundaries between sections.
  const SUMMARY_HEADERS = ["summary", "professional summary", "career summary", "profile", "about", "about me", "objective", "career objective", "executive summary"];
  const SKILLS_HEADERS = ["skills", "technical skills", "key skills", "core competencies", "skills & tools", "technical proficiencies", "technologies", "skillset", "skills summary"];
  const CERT_HEADERS = ["certifications", "certification", "certifications & achievements", "licenses & certifications", "achievements", "accomplishments", "certificates", "courses & certifications"];
  const LEADERSHIP_HEADERS = ["leadership", "activities", "leadership & activities", "leadership/activities", "extracurricular activities", "extra curricular activities", "volunteer experience", "volunteering"];
  const AWARDS_HEADERS = ["awards", "honors", "awards & honors", "honors & awards"];

  const SECTION_HEADERS = {
    experience: ["experience", "work experience", "employment history", "professional experience", "career history", "work history", "internships", "internship experience", "relevant experience"],
    education: ["education", "academic background", "qualifications", "educational qualification", "educational qualifications", "academic qualification", "academic qualifications", "academic details", "education & qualifications", "degrees", "academic profile"],
    projects: ["projects", "personal projects", "academic projects", "key projects", "technical projects", "selected projects", "major projects"],
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
    const seenNames = new Set();

    for (const skill of SKILL_KEYWORDS){
      const sName = skill.name.toLowerCase();
      if (seenNames.has(sName)) continue;

      let matched = false;
      if (sName === "c++") {
        matched = /\bc\+\+|\bcplusplus\b/i.test(lower);
      } else if (sName === "c#") {
        matched = /\bc#|\bcsharp\b/i.test(lower);
      } else if (sName === ".net" || sName === "asp.net") {
        matched = /\.net\b|asp\.net\b/i.test(lower);
      } else if (sName === "node.js" || sName === "node") {
        matched = /\bnode\.?js\b|\bnodejs\b|\bnode\b/i.test(lower);
      } else if (sName === "react.js" || sName === "react") {
        matched = /\breact\.?js\b|\breactjs\b|\breact\b/i.test(lower);
      } else if (sName === "vue.js" || sName === "vue") {
        matched = /\bvue\.?js\b|\bvuejs\b|\bvue\b/i.test(lower);
      } else if (sName === "next.js" || sName === "next") {
        matched = /\bnext\.?js\b|\bnextjs\b/i.test(lower);
      } else if (sName === "express.js" || sName === "express") {
        matched = /\bexpress\.?js\b|\bexpressjs\b|\bexpress\b/i.test(lower);
      } else {
        const escaped = sName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp("(?:^|[^a-zA-Z0-9_#+.-])" + escaped + "(?:$|[^a-zA-Z0-9_#+.-])", "i");
        matched = re.test(lower);
      }

      if (matched){
        found.push(skill);
        seenNames.add(sName);
      }
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
    "SQL", "Git", "API", "Agile", "Project Management",
    "Data Structures", "Algorithms", "Python", "JavaScript", "Problem Solving",
    "Communication", "Documentation", "Testing", "CI/CD", "Optimization",
    "Leadership", "Analysis", "Design"
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
    const fNameEl = document.getElementById("fName"); if (fNameEl) fNameEl.textContent = name;
    const fEmailEl = document.getElementById("fEmail"); if (fEmailEl) fEmailEl.textContent = emailMatch ? emailMatch[0] : "Not found";
    const fPhoneEl = document.getElementById("fPhone"); if (fPhoneEl) fPhoneEl.textContent = (phoneMatch && phoneMatch[0].replace(/\D/g,"").length >= 7) ? phoneMatch[0] : "Not found";

    const linkedinEl = document.getElementById("fLinkedin");
    if (linkedinEl) {
      if (linkedinMatch){ linkedinEl.innerHTML = `<a href="https://${linkedinMatch[0].replace(/^https?:\/\//,'')}" target="_blank">${linkedinMatch[0]}</a>`; }
      else { linkedinEl.textContent = "Not found"; }
    }

    const githubEl = document.getElementById("fGithub");
    if (githubEl) {
      if (githubMatch){ githubEl.innerHTML = `<a href="https://${githubMatch[0].replace(/^https?:\/\//,'')}" target="_blank">${githubMatch[0]}</a>`; }
      else { githubEl.textContent = "Not found"; }
    }

    const sSkillsEl = document.getElementById("sSkills"); if (sSkillsEl) sSkillsEl.textContent = skills.length;
    const sExpEl = document.getElementById("sExp"); if (sExpEl) sExpEl.textContent = years ? years + "+" : "—";
    const sWordsEl = document.getElementById("sWords"); if (sWordsEl) sWordsEl.textContent = wordCount;

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
      ["LinkedIn", linkedinMatch ? `<a href="https://${linkedinMatch[0].replace(/^https?:\/\//,'')}" target="_blank" style="color:var(--accent);font-weight:600;">${linkedinMatch[0]}</a>` : null],
      ["GitHub", githubMatch ? `<a href="https://${githubMatch[0].replace(/^https?:\/\//,'')}" target="_blank" style="color:var(--accent);font-weight:600;">${githubMatch[0]}</a>` : null],
    ];
    coPersonalEl.innerHTML = personalRows.map(([label, value]) =>
      `<div class="co-personal-row"><span class="co-k">${label}</span><span class="co-v">${value ? value : '<span class="co-empty">✕ Not found</span>'}</span></div>`
    ).join("");

    const coSkillsEl = document.getElementById("coSkills");
    if (skills.length) {
      const langs = skills.filter(s => s.type === "lang");
      const tools = skills.filter(s => s.type === "tool");
      const soft = skills.filter(s => s.type === "soft");

      let html = '<div class="co-skills-grouped">';
      if (langs.length) {
        html += `<div class="co-skill-group"><span class="co-sg-title">Languages & Core:</span> <div class="tags">${langs.map(s => `<span class="tag lang">${s.name}</span>`).join("")}</div></div>`;
      }
      if (tools.length) {
        html += `<div class="co-skill-group"><span class="co-sg-title">Frameworks & Tools:</span> <div class="tags">${tools.map(s => `<span class="tag tool">${s.name}</span>`).join("")}</div></div>`;
      }
      if (soft.length) {
        html += `<div class="co-skill-group"><span class="co-sg-title">Soft Skills & Domain:</span> <div class="tags">${soft.map(s => `<span class="tag soft">${s.name}</span>`).join("")}</div></div>`;
      }
      html += '</div>';
      coSkillsEl.innerHTML = html;
    } else {
      coSkillsEl.innerHTML = `
        <div class="co-empty-box">
          <div class="co-empty-msg">✕ No Skills Section Clearly Detected</div>
          <div class="co-guidance-title">💡 What to include in this section:</div>
          <div class="co-guidance-text">List relevant technical skills (Languages, Frameworks, Tools, Databases) and soft skills matching your target job role.</div>
        </div>
      `;
    }

    function renderStructuredCoSection(elId, content, guidanceMsg) {
      const el = document.getElementById(elId);
      if (!el) return;

      if (content && content.trim()) {
        const rawLines = content.split("\n").map(l => l.trim()).filter(Boolean);
        let html = '<div class="co-structured-list">';
        rawLines.forEach(line => {
          const isBullet = BULLET_PREFIX_RE.test(line) || line.startsWith("-") || line.startsWith("*") || line.startsWith("•");
          const cleanLine = line.replace(BULLET_PREFIX_RE, "").replace(/^[\-*•]\s*/, "").trim();

          if (isBullet) {
            html += `<div class="co-bullet-item"><span class="co-bullet-dot">•</span><span>${escapeHtml(cleanLine)}</span></div>`;
          } else if (cleanLine.length < 70 && (/\b(20|19)\d{2}\b/.test(cleanLine) || /^[A-Z]/.test(cleanLine))) {
            html += `<div class="co-title-item">${escapeHtml(cleanLine)}</div>`;
          } else {
            html += `<div class="co-text-item">${escapeHtml(cleanLine)}</div>`;
          }
        });
        html += '</div>';
        el.innerHTML = html;
      } else {
        el.innerHTML = `
          <div class="co-empty-box">
            <div class="co-empty-msg">✕ Section Not Detected</div>
            <div class="co-guidance-title">💡 What to include in this section:</div>
            <div class="co-guidance-text">${guidanceMsg}</div>
          </div>
        `;
      }
    }

    renderStructuredCoSection("coExperience", experience, "Include Job Title, Company Name, Employment Dates (Month Year – Present), and 3–5 bullet points starting with strong action verbs and quantified metrics (%, $, numbers).");
    renderStructuredCoSection("coEducation", education, "Include Degree Name (e.g. B.Tech / B.S. in Computer Science), University Name, Graduation Month & Year, GPA/Percentage (optional), and Relevant Coursework.");
    renderStructuredCoSection("coCertifications", certifications, "Include Professional Certifications (e.g., AWS Certified Developer, Web Dev Certificate), Issuing Organization (e.g. Coursera, Udemy, Google), and Date.");
    renderStructuredCoSection("coProjects", projects, "Include 2–3 Key Projects with Title, Tech Stack Used (e.g., React, Node.js, MongoDB), Live Demo / GitHub Links, and 2–3 impact bullet points describing key features.");

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
    renderMetricBox(metricGrid, "Avg Sentence Length", readability.avgSentenceLength, readability.avgSentenceLength, 10, 25, 35, "Target range: 10–25 words");
    renderMetricBox(metricGrid, "Reading Grade Level", readability.gradeLevel, readability.gradeLevel, 7, 14, 20, "Target range: Grade 7–14 (clear business & technical writing)");
    renderMetricBox(metricGrid, "Skill Density", skillDensity, skillDensity + "%", 6, 22, 35, "Target range: 6–22% of words are skills");
    renderMetricBox(metricGrid, "Quantification", quantPct, quantPct + "%", 30, 70, 100, `Target range: 30–70% bullets with numbers (${quant.quantified}/${quant.total})`);

    // Timeline consistency: flag graduation/education years that are in the future
    const currentYear = new Date().getFullYear();
    const eduYears = [...(education || "").matchAll(/\b(20\d{2})\b/g)].map(m => parseInt(m[1], 10));
    const futureGradFlag = eduYears.some(y => y > currentYear);
    const noDatesFound = eduYears.length === 0 && !/\b(19|20)\d{2}\b/.test(experience || "");

    // ---- Score Breakdown (6 metrics, 0-100) ----
    const sectionCoveragePct = Math.min(100, Math.round((allSections.filter(s => s.found).length / allSections.length) * 100));

    const adjustedJdRatio = (jdResult && jdResult.ratio !== null)
      ? Math.min(1.0, jdResult.ratio)
      : null;

    const keywordCoveragePct = adjustedJdRatio !== null
      ? Math.round(adjustedJdRatio * 100)
      : Math.min(100, (skills.length >= 10 ? 90 : skills.length >= 7 ? 80 : skills.length >= 4 ? 65 : skills.length >= 2 ? 50 : 30));

    let contentStrengthPct = 50; // strict baseline for resume content impact
    if (quant.total > 0) {
      contentStrengthPct += Math.round((quant.quantified / quant.total) * 40);
    } else {
      contentStrengthPct = 40;
    }
    contentStrengthPct -= Math.min(uniqueWeakPhrases.length, 5) * 4;
    contentStrengthPct -= Math.min(duplicateBullets.length, 5) * 4;
    contentStrengthPct = Math.max(20, Math.min(100, contentStrengthPct));

    let timelineConsistencyPct = noDatesFound ? 55 : 100;
    if (futureGradFlag) timelineConsistencyPct -= 25;
    timelineConsistencyPct = Math.max(30, Math.min(100, timelineConsistencyPct));

    const gradeDelta = readability.gradeLevel < 7 ? 7 - readability.gradeLevel : (readability.gradeLevel > 14 ? readability.gradeLevel - 14 : 0);
    const readabilityPct = Math.max(45, 100 - gradeDelta * 6);

    let relevanceAlignmentPct;
    if (adjustedJdRatio !== null){
      relevanceAlignmentPct = Math.round(adjustedJdRatio * 100);
    } else {
      const densityDelta = skillDensity < 6 ? 6 - skillDensity : (skillDensity > 22 ? skillDensity - 22 : 0);
      relevanceAlignmentPct = Math.max(45, 100 - densityDelta * 4);
    }

    let formattingPct = 60; // strict formatting baseline
    if (wordCount >= 300 && wordCount <= 1100) formattingPct = 100;
    else if (wordCount >= 200 && wordCount <= 1400) formattingPct = 75;
    else if (wordCount > 0) formattingPct = 50;
    if (quant.total === 0) formattingPct -= 20;
    formattingPct = Math.max(30, Math.min(100, formattingPct));

    // Critical fields carry a fixed penalty in the ATS score
    const criticalMissingFields = ["Name", "Email address", "Phone number", "Experience section", "Education section", "Skills section"];

    const scoreBreakdownGrid = document.getElementById("scoreBreakdownGrid");
    scoreBreakdownGrid.innerHTML = "";
    renderScoreItem(scoreBreakdownGrid, "Section Coverage", sectionCoveragePct);
    renderScoreItem(scoreBreakdownGrid, "Keyword Coverage", keywordCoveragePct);
    renderScoreItem(scoreBreakdownGrid, "Content Strength", contentStrengthPct);
    renderScoreItem(scoreBreakdownGrid, "Timeline Consistency", timelineConsistencyPct);
    renderScoreItem(scoreBreakdownGrid, "Readability", readabilityPct);
    renderScoreItem(scoreBreakdownGrid, "Relevance Alignment", relevanceAlignmentPct);

    // ---- Executive Summary / ATS Improvement Recommendations ----
    const recs = [];

    // 1. Critical Contact / Core Sections
    criticalMissingFields.forEach(field => {
      if (missing.includes(field)){
        recs.push({
          badge: "Critical",
          type: "critical",
          issue: `Missing Essential Field: ${field}`,
          fix: `Add a clear ${field.replace(/ section$/i, "").toLowerCase()} header — ATS parsers rely on this to map your application data.`
        });
      }
    });

    // 2. Missing Job Description or Common Keywords
    if (jdResult && jdResult.missing && jdResult.missing.length > 0){
      recs.push({
        badge: "Keyword Match",
        type: "keyword",
        issue: `Missing Job Description Keywords: ${jdResult.missing.slice(0, 4).join(", ")}${jdResult.missing.length > 4 ? "..." : ""}`,
        fix: `Incorporate missing keywords (${jdResult.missing.slice(0, 4).join(", ")}) naturally into your Experience or Skills bullet points.`
      });
    } else if (missingCommonKw && missingCommonKw.length > 0){
      recs.push({
        badge: "Keywords",
        type: "keyword",
        issue: `Missing Core Industry Terms: ${missingCommonKw.slice(0, 4).join(", ")}`,
        fix: `Add relevant industry skills (${missingCommonKw.slice(0, 4).join(", ")}) to improve ATS keyword search ranking.`
      });
    }

    // 3. Bullet Point Impact & Metrics
    if (quant.total === 0 || quant.quantified === 0){
      recs.push({
        badge: "Impact Metrics",
        type: "impact",
        issue: "No Quantified Achievements Found",
        fix: "Add numbers, percentages, or metrics to your experience bullets (e.g., 'Boosted efficiency by 30%', 'Managed $20k budget')."
      });
    }

    // 4. Action Verbs & Weak Phrasing
    if (uniqueWeakPhrases && uniqueWeakPhrases.length > 0){
      recs.push({
        badge: "Verb Strength",
        type: "impact",
        issue: `Weak or Passive Verbs Detected: ${uniqueWeakPhrases.slice(0, 3).map(p => `"${p}"`).join(", ")}`,
        fix: `Replace passive phrasing with strong action verbs like 'Engineered', 'Spearheaded', 'Architected', or 'Optimized'.`
      });
    }

    // 5. Formatting & Length
    if (wordCount < 300 || wordCount > 1100){
      recs.push({
        badge: "Formatting",
        type: "format",
        issue: `Resume Length (${wordCount} words) Outside Ideal Range`,
        fix: `Aim for 300–1100 words. ${wordCount < 300 ? "Add more detailed bullet points describing your technical accomplishments." : "Trim redundant details to keep your resume focused."}`
      });
    }

    // 6. Section Coverage & Structure
    const missingSections = allSections.filter(s => !s.found).map(s => s.label);
    if (missingSections.length > 0){
      recs.push({
        badge: "Structure",
        type: "format",
        issue: `Missing Recommended Sections: ${missingSections.slice(0, 3).join(", ")}`,
        fix: `Add standard section headers (${missingSections.slice(0, 3).join(", ")}) to improve standard ATS parsing.`
      });
    }

    // 7. Timeline / Dates
    if (noDatesFound){
      recs.push({
        badge: "Timeline",
        type: "format",
        issue: "No Clear Dates Found in Experience or Education",
        fix: "Include month and year ranges (e.g., 'Jan 2022 – Present') so ATS scanners can compute years of experience."
      });
    }

    // 8. Buzzwords & Summary Polish
    if (buzzwordsFound && buzzwordsFound.length > 0){
      recs.push({
        badge: "Polish",
        type: "polish",
        issue: `Overused Buzzwords Detected: ${buzzwordsFound.slice(0, 3).join(", ")}`,
        fix: "Swap generic fluff terms for concrete technical tools and verifiable achievements."
      });
    }

    if (!hasSummary){
      recs.push({
        badge: "Summary",
        type: "polish",
        issue: "No Professional Summary Header Found",
        fix: "Include a 2–3 sentence Professional Summary at the top highlighting your key tech stack and career focus."
      });
    }

    const execIssuesEl = document.getElementById("execIssuesList");
    const execFixesEl = document.getElementById("execFixesList");
    execIssuesEl.innerHTML = "";
    execFixesEl.innerHTML = "";

    if (recs.length > 0){
      recs.slice(0, 8).forEach(r => {
        const liIssue = document.createElement("li");
        liIssue.innerHTML = `<span class="exec-icon">✕</span><div><span class="exec-badge ${r.type}">${r.badge}</span><span>${r.issue}</span></div>`;
        execIssuesEl.appendChild(liIssue);

        const liFix = document.createElement("li");
        liFix.innerHTML = `<span class="exec-icon">✓</span><div><span class="exec-badge fix-${r.type}">${r.badge}</span><span>${r.fix}</span></div>`;
        execFixesEl.appendChild(liFix);
      });
    } else {
      execIssuesEl.innerHTML = "<li class='exec-empty'>No major ATS issues detected — excellent resume structure!</li>";
      execFixesEl.innerHTML = "<li class='exec-empty'>Keep tailoring your resume keywords for each target job description.</li>";
    }

    // ---- Errors & Issues Found: every detected problem, ordered by ----
    // ---- severity (Critical → Moderate → Minor) with a plain-English ----
    // ---- explanation of why it matters and how to fix it.           ----
    const errorItems = [];
    missing.forEach(m => {
      let severity = "high";
      if (["LinkedIn profile", "GitHub profile", "Years of experience (not explicitly stated)"].includes(m)) severity = "low";
      else if (["Education section", "Projects section"].includes(m)) severity = "medium";

      let detail = "This is a standard resume field or section — recruiters and ATS systems generally expect to see it.";
      if (severity === "low") detail = "Adding a profile link or explicit timeline helps recruiters, though not strictly required by all ATS parsers.";

      errorItems.push({
        severity,
        title: `Missing: ${m}`,
        detail
      });
    });
    if (quant.total === 0){
      errorItems.push({ severity:"medium", title:"No bullet points detected", detail:"Use bullet points (lines starting with -, *, or •) to list your achievements clearly." });
    } else if (quant.quantified === 0){
      errorItems.push({ severity:"low", title:"No quantified results in bullet points", detail:"Add numbers, percentages, or dollar amounts where possible to show measurable impact." });
    }
    if (uniqueWeakPhrases.length){
      errorItems.push({
        severity:"low",
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
        severity:"low",
        title:`Missing common keywords (${missingCommonKw.length})`,
        detail:`Consider naturally adding: ${missingCommonKw.slice(0,5).join(", ")}${missingCommonKw.length > 5 ? ", etc." : ""}.`
      });
    }
    if (!hasSummary){
      errorItems.push({ severity:"low", title:"No professional summary", detail:"A 2–3 line summary at the top helps recruiters quickly understand your focus area." });
    }
    if (futureGradFlag){
      errorItems.push({ severity:"medium", title:"Future graduation date detected", detail:"Double-check your education dates — a graduation year in the future can clarify your timeline." });
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
    // A strict, unboosted multi-factor score built from standard ATS parsing signals.
    const weightedScore =
      sectionCoveragePct    * 0.25 +
      keywordCoveragePct    * 0.24 +
      contentStrengthPct    * 0.16 +
      relevanceAlignmentPct * 0.14 +
      readabilityPct        * 0.09 +
      formattingPct         * 0.07 +
      timelineConsistencyPct * 0.05;

    let score = Math.round(weightedScore);

    // Apply strict penalties for missing critical contact & core sections
    const criticalMissingCount = missing.filter(m => criticalMissingFields.includes(m)).length;
    score -= criticalMissingCount * 7;
    score -= Math.min(errorItems.filter(e => e.severity === "high").length, 4) * 4;

    if (adjustedJdRatio !== null){
      score = Math.round(score * 0.40 + adjustedJdRatio * 100 * 0.60);
    }

    score = Math.max(15, Math.min(100, score));

    let color = "#d9534f", verdict = "Needs Work";
    if (score >= 85){ color = "#2e7d32"; verdict = "Excellent — ATS Friendly"; }
    else if (score >= 72){ color = "#25855a"; verdict = "Good — Minor Gaps"; }
    else if (score >= 55){ color = "#c9962c"; verdict = "Fair — Moderate Gaps"; }
    else { color = "#d9534f"; verdict = "Needs Work — Major Gaps"; }

    renderATSScore(score, color, verdict);

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

    if (!historySavedForCurrentUpload){
      saveHistoryEntry(currentUser ? currentUser.email : null, filename, score, verdict);
      historySavedForCurrentUpload = true;
    }

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
      logResumeUploadActivity(file.name);
      hideLoading();
      setStatus("Resume ready — choose how you'd like it analyzed.");
      showAnalysisOptions();
    } catch(err){
      console.error(err);
      hideLoading();
      setStatus("Error while analyzing: " + err.message, true);
    }
  }

  async function logResumeUploadActivity(filename) {
    const token = getAuthToken();
    if (!token) return;
    try {
      await safeFetchJson("/api/activity/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ filename })
      });
    } catch (e) {}
  }

  async function logResumeDownloadActivity(filename) {
    const token = getAuthToken();
    if (!token) return;
    try {
      await safeFetchJson("/api/activity/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ filename: filename || "resume_report.pdf", format: "pdf" })
      });
    } catch (e) {}
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
      logResumeUploadActivity("Pasted Resume Text");
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
    if (typeof logUserAction === "function") {
      logUserAction("mode selection", mode === "ats" ? "User selected ATS Score Check mode" : "User selected Full Breakdown mode", { mode });
    }
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

  const chooseAtsBtn = document.getElementById("chooseAtsBtn");
  if (chooseAtsBtn) chooseAtsBtn.addEventListener("click", () => selectAnalysisMode("ats"));

  const chooseNormalBtn = document.getElementById("chooseNormalBtn");
  if (chooseNormalBtn) chooseNormalBtn.addEventListener("click", () => selectAnalysisMode("normal"));

  const backToOptionsBtn = document.getElementById("backToOptionsBtn");
  if (backToOptionsBtn) {
    backToOptionsBtn.addEventListener("click", () => {
      showAnalysisOptions();
    });
  }

  const resetBtn = document.getElementById("resetBtn");
  if (resetBtn) resetBtn.addEventListener("click", resetAnalysis);

  const navHomeLink = document.getElementById("navHomeLink");
  if (navHomeLink) {
    navHomeLink.addEventListener("click", (e) => {
      e.preventDefault();
      resetAnalysis();
    });
  }

  const navBrandLogo = document.getElementById("navBrandLogo");
  if (navBrandLogo) {
    navBrandLogo.addEventListener("click", (e) => {
      e.preventDefault();
      resetAnalysis();
    });
  }

  // ---- PDF report export (client-side, via jsPDF — no server involved) ----
  const pdfExportBtn = document.getElementById("pdfExportBtn");
  if (pdfExportBtn) {
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
      logResumeDownloadActivity(lastAnalysisData.filename || "resume_report.pdf");
    } catch (err){
      console.error(err);
      setStatus("Couldn't generate the PDF report: " + err.message, true);
    }
  });
}

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
    GOOGLE_CLIENT_ID: "YOUR_GOOGLE_CLIENT_ID",
    ADMIN_NOTIFY_EMAIL: "airesumeash@gmail.com"
  };

  // User accounts storage helper
  function loadAccounts(){
    try {
      const raw = localStorage.getItem("ara_accounts_v1");
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e){ return {}; }
  }
  let accounts = loadAccounts();

  function getFirebaseAuth() {
    return window.firebaseAuth || null;
  }
  function getFirebaseAuthHelpers() {
    return window.firebaseAuthHelpers || null;
  }

  function saveAccounts(){
    try { localStorage.setItem("ara_accounts_v1", JSON.stringify(accounts)); } catch (e){}
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function normalizeEmail(email){
    if (!email) return "";
    return String(email).trim().toLowerCase();
  }

  function isValidEmail(email){
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
  }

  function generateResetToken(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // Safe stubs (all site emails are routed via backend SMTP transport)
  function sendEmailStub(fields){
    return Promise.resolve(true);
  }

  function notifyAdminOfAuthEvent({ email, name, action }){
    console.log(`[AUTH EVENT] ${action} — ${name || "User"} (${email})`);
  }

  function notifyUserOfAuthEvent({ email, name, action }){
    console.log(`[AUTH EVENT] User notification for ${action} — ${email}`);
  }

  function sendDirectUserEmail({ toEmail, subject, message }){
    console.log(`[EMAIL DISPATCH] Handled via backend SMTP for: ${toEmail}`);
  }

  // Sends a "confirm your email" link directly to the user's registered email inbox
  function sendVerificationEmail(email, name, serverToken){
    const account = accounts[email] || {};

    const token = serverToken || account.verifyToken || generateResetToken();
    account.verifyToken = token;
    account.verifyTokenExpires = Date.now() + 5 * 60 * 1000; // link valid exactly 5 minutes
    if (accounts[email]) saveAccounts();

    // Trigger Firebase Auth Email Verification if Firebase user is logged in
    const auth = getFirebaseAuth();
    const helpers = getFirebaseAuthHelpers();
    if (auth && auth.currentUser && helpers && helpers.sendEmailVerification) {
      helpers.sendEmailVerification(auth.currentUser).catch(err => {
        console.warn("Firebase Auth sendEmailVerification notice:", err.message || err);
      });
    }

    let origin = location.origin;
    let pathname = location.pathname;
    if (location.protocol === "file:" || !origin || origin === "null" || origin.startsWith("file:")){
      origin = "http://localhost:5000";
    }

    const verifyLink = `${origin}/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
    const displayName = name || account.name || "there";

    const welcomeMessage =
      `Hi ${displayName},\n\n` +
      `Thank you for creating an account with AI Resume Analyzer!\n` +
      `Please confirm your email address by clicking the link below:\n\n` +
      `${verifyLink}\n\n` +
      `⏰ IMPORTANT: This verification link is valid for 5 minutes.\n\n` +
      `If you didn't create this account, you can safely ignore this email.`;

    console.log("Sending verification email directly to user inbox:", { to: email });

    // Deliver email directly to user's registered inbox ONLY
    sendDirectUserEmail({
      toEmail: email,
      subject: "Verify Your Account",
      message: welcomeMessage
    });

    return verifyLink;
  }

  function hideToast(el){
    if (!el) return;
    el.style.display = "none";
    if (el._toastTimer) {
      clearTimeout(el._toastTimer);
      el._toastTimer = null;
    }
  }

  function showToast(el, msg, isError, autoHideMs = 6000){
    if (!el) return;
    hideToast(el);
    el.textContent = msg;
    el.className = "auth-toast auth-toast-top " + (isError ? "error" : "success");
    el.title = "Click to dismiss";
    if (!el._hasClickListener) {
      el.addEventListener("click", () => hideToast(el));
      el._hasClickListener = true;
    }
    el.style.display = "block";
    if (autoHideMs && autoHideMs > 0) {
      el._toastTimer = setTimeout(() => hideToast(el), autoHideMs);
    }
  }

  function showToastHTML(el, html, isError, autoHideMs = 6000){
    if (!el) return;
    hideToast(el);
    el.innerHTML = html;
    el.className = "auth-toast auth-toast-top " + (isError ? "error" : "success");
    el.title = "Click to dismiss";
    if (!el._hasClickListener) {
      el.addEventListener("click", () => hideToast(el));
      el._hasClickListener = true;
    }
    el.style.display = "block";
    if (autoHideMs && autoHideMs > 0) {
      el._toastTimer = setTimeout(() => hideToast(el), autoHideMs);
    }
  }

  function initials(name){
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }

  function renderAvatarEverywhere(user){
    if (!user) return;
    const photo = (user && user.photo) ? user.photo : null;
    const initialsText = initials((user && user.name) ? user.name : "");

    const avatarText = document.getElementById("userAvatar");
    const avatarImg = document.getElementById("userAvatarImg");
    const avatarLargeInitials = document.getElementById("userAvatarLargeInitials");
    const avatarLargeImg = document.getElementById("userAvatarLargeImg");
    const pageInitials = document.getElementById("profilePageAvatarInitials");
    const pageImg = document.getElementById("profilePageAvatarImg");

    if (avatarText) avatarText.textContent = initialsText;
    if (avatarLargeInitials) avatarLargeInitials.textContent = initialsText;
    if (pageInitials) pageInitials.textContent = initialsText;

    if (photo){
      if (avatarImg) { avatarImg.src = photo; avatarImg.style.display = "block"; }
      if (avatarText) avatarText.style.display = "none";
      if (avatarLargeImg) { avatarLargeImg.src = photo; avatarLargeImg.style.display = "block"; }
      if (avatarLargeInitials) avatarLargeInitials.style.display = "none";
      if (pageImg) { pageImg.src = photo; pageImg.style.display = "block"; }
      if (pageInitials) pageInitials.style.display = "none";
    } else {
      if (avatarImg) avatarImg.style.display = "none";
      if (avatarText) avatarText.style.display = "flex";
      if (avatarLargeImg) avatarLargeImg.style.display = "none";
      if (avatarLargeInitials) avatarLargeInitials.style.display = "flex";
      if (pageImg) pageImg.style.display = "none";
      if (pageInitials) pageInitials.style.display = "flex";
    }
  }

  function setLoggedInUser(user){
    if (!user || !user.email) return;
    const norm = normalizeEmail(user.email);
    user.email = norm;
    if (user._id || user.id || user.userId) {
      const primaryId = (user._id || user.id || user.userId).toString();
      user._id = primaryId;
      user.id = primaryId;
      user.userId = primaryId;
    }
    const token = user.token || (currentUser && currentUser.token) || getAuthToken();
    if (token) {
      user.token = token;
      setAuthToken(token);
    }
    currentUser = user;
    if (!accounts[norm]){
      accounts[norm] = { name: user.name || norm, password: null, provider: user.provider || "email", verified: true, photo: user.photo || "" };
    } else {
      if (user.name) accounts[norm].name = user.name;
      if (user.provider) accounts[norm].provider = user.provider;
      if (user.provider === "google" || user.verified) accounts[norm].verified = true;
      if (user.photo !== undefined) accounts[norm].photo = user.photo;
    }
    saveAccounts();

    try { localStorage.setItem("ara_session_v1", JSON.stringify(user)); } catch (e){}
    const wrap = document.getElementById("profileWrap");
    const nameEl = document.getElementById("userChipName");
    const dropdownNameEl = document.getElementById("userDropdownName");
    const emailEl = document.getElementById("userChipEmail");

    const displayName = user.name || norm.split("@")[0];
    if (nameEl) nameEl.textContent = displayName;
    if (dropdownNameEl) dropdownNameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = norm;

    renderAvatarEverywhere(user);
    if (wrap) {
      wrap.style.display = "inline-flex";
      wrap.classList.add("active");
    }
    const navLoginBtn = document.getElementById("navLoginBtn");
    if (navLoginBtn) navLoginBtn.style.display = "none";
    const navSignupBtn = document.getElementById("navSignupBtn");
    if (navSignupBtn) navSignupBtn.style.display = "none";
    const navSignInBtn = document.getElementById("navSignInBtn");
    if (navSignInBtn) navSignInBtn.style.display = "none";
    document.querySelectorAll(".logged-out-only").forEach(el => el.style.display = "none");

    const navHomeBtn = document.getElementById("navHomeBtn");
    if (navHomeBtn) navHomeBtn.style.display = "inline-flex";
    document.querySelectorAll(".logged-in-only").forEach(el => {
      if (el.classList.contains("nav-home-btn") || el.tagName === "BUTTON") {
        el.style.display = "inline-flex";
      } else if (el.classList.contains("profile-wrap")) {
        el.style.display = "inline-flex";
      } else {
        el.style.display = "flex";
      }
    });

    fetchHistoryFromBackend();
    fetchActivityFromBackend();
    syncUnsyncedAnalysesToBackend();
  }

  async function logoutUser(){
    const auth = getFirebaseAuth();
    const helpers = getFirebaseAuthHelpers();
    if (auth && helpers && helpers.signOut) {
      try { await helpers.signOut(auth); } catch (e) {}
    }

    const token = getAuthToken();
    if (token) {
      try {
        await safeFetchJson("/api/auth/logout", {
          method: "POST",
          headers: { "Authorization": "Bearer " + token }
        });
      } catch (e) {}
    }
    currentUser = null;
    clearAuthToken();
    try { localStorage.removeItem("ara_session_v1"); } catch (e){}
    try { localStorage.removeItem("ara_history_cache_v1"); } catch (e){}
    userHistoryList = [];
    userActivitiesList = [];
    unsyncedPendingAnalyses = [];
    renderHistory();

    const profileWrap = document.getElementById("profileWrap");
    if (profileWrap) {
      profileWrap.style.display = "none";
      profileWrap.classList.remove("active");
    }
    const profileDropdown = document.getElementById("profileDropdown");
    if (profileDropdown) profileDropdown.classList.remove("open");

    const navLoginBtn = document.getElementById("navLoginBtn");
    if (navLoginBtn) navLoginBtn.style.display = "";
    const navSignupBtn = document.getElementById("navSignupBtn");
    if (navSignupBtn) navSignupBtn.style.display = "";
    const navSignInBtn = document.getElementById("navSignInBtn");
    if (navSignInBtn) navSignInBtn.style.display = "";
    const userMenuDivider = document.getElementById("userMenuDivider");
    if (userMenuDivider) userMenuDivider.style.display = "none";

    document.querySelectorAll(".logged-in-only").forEach(el => el.style.display = "none");
    document.querySelectorAll(".logged-out-only").forEach(el => el.style.display = "");
    const navMenuDropdown = document.getElementById("navMenuDropdown");
    if (navMenuDropdown) navMenuDropdown.classList.remove("open");

    if (typeof closeProfilePage === "function") closeProfilePage();
    if (typeof closeHistory === "function") closeHistory();
    if (typeof closeSupport === "function") closeSupport();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Determine Backend API Base URL
  // On production (e.g. Render/HTTPS), relative URLs (/api/...) use current origin securely without hardcoding HTTP or port 5000.
  // In local dev (Live Server, file://, or non-5000 port), target local backend server on port 5000.
  const isLocalDev = (
    location.protocol === "file:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    (location.port && location.port !== "5000" && location.protocol !== "https:")
  );

  const currentHost = (location.hostname === "localhost" || !location.hostname) ? "127.0.0.1" : location.hostname;
  const devProtocol = location.protocol === "file:" ? "http:" : location.protocol;

  const API_BASE = isLocalDev
    ? `${devProtocol}//${currentHost}:5000`
    : "";

  // Safe JSON Fetch helper preventing SyntaxError on non-JSON, cold-start, or 404 responses
  async function safeFetchJson(url, options = {}, retries = 1) {
    const fullUrl = (url.startsWith("/api/") && API_BASE)
      ? (API_BASE + url)
      : url;

    options = options || {};
    options.headers = options.headers || {};

    const token = getAuthToken();
    if (token && !options.headers["Authorization"] && !options.headers["authorization"]) {
      options.headers["Authorization"] = "Bearer " + token;
    }
    if (currentUser && currentUser.email && !options.headers["x-user-email"]) {
      options.headers["x-user-email"] = currentUser.email;
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(fullUrl, options);

        // Auto re-hydrate token if renewed by backend
        const renewedToken = res.headers && res.headers.get("x-auth-token");
        if (renewedToken) {
          setAuthToken(renewedToken);
          if (currentUser) currentUser.token = renewedToken;
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          return {
            success: false,
            isNonJson: true,
            isOffline: true,
            status: res.status,
            message: `Backend server is offline or unreachable. Please start your server with 'node server.js'.`
          };
        }
        const text = await res.text();
        if (!text || !text.trim()) {
          return { success: false, isEmpty: true, status: res.status, message: `Empty response (${res.status})` };
        }
        const parsed = JSON.parse(text);
        if (parsed && parsed.token && typeof setAuthToken === "function") {
          setAuthToken(parsed.token);
          if (currentUser) currentUser.token = parsed.token;
        }
        return parsed;
      } catch (err) {
        if (attempt === retries) {
          return {
            success: false,
            isError: true,
            isOffline: true,
            status: 0,
            message: `Backend server is offline or unreachable. Please start server with 'node server.js'.`
          };
        }
        await new Promise(r => setTimeout(r, 800));
      }
    }
  }

  // Centralized User Activity Logger to ensure everything the user does is logged in MongoDB
  async function logUserAction(action, description, metadata = {}) {
    try {
      const email = (currentUser && currentUser.email) ? currentUser.email : "";
      await safeFetchJson("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          activityType: action,
          description: description || `User performed ${action}`,
          email,
          ...metadata
        })
      });
    } catch (e) {}
  }

  let sessionRestorePromise = null;

  // Restore a logged-in session on page load strictly from MongoDB Backend
  async function restoreSession(){
    const token = getAuthToken();
    if (!token){
      currentUser = null;
      try { localStorage.removeItem("ara_session_v1"); } catch(e){}
      userHistoryList = [];
      renderHistory();
      return;
    }

    try {
      const data = await safeFetchJson("/api/user/profile", {
        headers: { "Authorization": "Bearer " + token }
      });
      if (data && data.success && data.user){
        setLoggedInUser({
          _id: (data.user._id || data.user.id || data.user.userId || "").toString(),
          id: (data.user._id || data.user.id || data.user.userId || "").toString(),
          userId: (data.user.userId || data.user._id || data.user.id || "").toString(),
          name: data.user.name,
          email: data.user.email,
          provider: data.user.provider,
          photo: data.user.photo,
          token: token
        });
        await fetchHistoryFromBackend();
        return;
      } else {
        // Token is invalid/expired on backend -> clear invalid token & session state
        clearAuthToken();
        currentUser = null;
        try { localStorage.removeItem("ara_session_v1"); } catch(e){}
        userHistoryList = [];
        renderHistory();
        return;
      }
    } catch(err){
      console.warn("Could not restore session from MongoDB backend:", err);
      clearAuthToken();
      currentUser = null;
      try { localStorage.removeItem("ara_session_v1"); } catch(e){}
      userHistoryList = [];
      renderHistory();
    }
  }

  document.getElementById("userLogoutBtn").addEventListener("click", logoutUser);

  // ---- Full-page profile (photo + name editing) ----
  const profilePageOverlay = document.getElementById("profilePageOverlay");
  const profilePageToast = document.getElementById("profilePageToast");

  async function openProfilePage(){
    if (sessionRestorePromise) {
      try { await sessionRestorePromise; } catch(e){}
    }
    if (!currentUser) return;
    const pdd = document.getElementById("profileDropdown");
    if (pdd) pdd.classList.remove("open");

    const token = getAuthToken();
    if (token) {
      try {
        const data = await safeFetchJson("/api/user/profile", {
          headers: { "Authorization": "Bearer " + token }
        });
        if (data && data.success && data.user) {
          setLoggedInUser({
            ...currentUser,
            _id: (data.user._id || data.user.id || data.user.userId || "").toString(),
            id: (data.user._id || data.user.id || data.user.userId || "").toString(),
            userId: (data.user.userId || data.user._id || data.user.id || "").toString(),
            name: data.user.name,
            email: data.user.email,
            provider: data.user.provider || currentUser.provider,
            photo: data.user.photo,
            token: token
          });
        }
      } catch (e) {}
    }

    const account = accounts[currentUser.email] || {};

    const nameInput = document.getElementById("profilePageNameInput");
    const emailEl = document.getElementById("profilePageEmail");
    const providerEl = document.getElementById("profilePageProvider");
    const verifiedEl = document.getElementById("profilePageVerified");

    if (nameInput) nameInput.value = currentUser.name || "";
    if (emailEl) emailEl.textContent = currentUser.email || "—";

    const provider = currentUser.provider || account.provider || "email";
    if (providerEl) providerEl.textContent = provider === "google" ? "Google Account (OAuth)" : "Email & Password";

    const isVerified = account.verified !== false;
    if (verifiedEl) {
      verifiedEl.textContent = isVerified ? "Verified Account ✓" : "Verification Pending";
      verifiedEl.style.color = isVerified ? "#2e7d32" : "#d32f2f";
    }

    renderAvatarEverywhere(currentUser);
    if (profilePageToast) profilePageToast.textContent = "";
    profilePageOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeProfilePage(){
    profilePageOverlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  document.getElementById("userProfileBtn").addEventListener("click", openProfilePage);
  document.getElementById("profilePageBackBtn").addEventListener("click", closeProfilePage);

  const profileNameInputEl = document.getElementById("profilePageNameInput");
  if (profileNameInputEl) {
    profileNameInputEl.addEventListener("input", () => {
      if (profilePageToast) profilePageToast.textContent = "";
    });
  }

  let pendingProfileAvatarDataUrl = null;

  async function ensureAuthToken() {
    let token = getAuthToken();
    if (token) return token;
    if (currentUser && currentUser.token) {
      setAuthToken(currentUser.token);
      return currentUser.token;
    }
    try {
      const sess = localStorage.getItem("ara_session_v1");
      if (sess) {
        const parsed = JSON.parse(sess);
        if (parsed && parsed.token) {
          setAuthToken(parsed.token);
          return parsed.token;
        }
      }
    } catch (e) {}
    if (currentUser && currentUser.email) {
      try {
        const res = await safeFetchJson("/api/auth/session-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: currentUser.email })
        });
        if (res && res.success && res.token) {
          setAuthToken(res.token);
          currentUser.token = res.token;
          return res.token;
        }
      } catch (e) {}
    }
    return null;
  }

  function compressImage(file, maxWidth = 400, maxHeight = 400, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(compressedDataUrl);
        };
        img.onerror = () => reject(new Error("Failed to process image"));
        img.src = readerEvent.target.result;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  document.getElementById("profilePageAvatarEditBtn").addEventListener("click", () => {
    document.getElementById("profilePagePhotoInput").click();
  });

  document.getElementById("profilePagePhotoInput").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !currentUser) return;
    if (!file.type.startsWith("image/")){
      profilePageToast.style.color = "#b3261e";
      profilePageToast.textContent = "Please choose an image file.";
      return;
    }
    try {
      profilePageToast.style.color = "var(--muted)";
      profilePageToast.textContent = "Processing photo...";

      const compressedDataUrl = await compressImage(file, 400, 400, 0.85);
      pendingProfileAvatarDataUrl = compressedDataUrl;

      // Update avatar preview immediately across UI
      renderAvatarEverywhere({ ...currentUser, photo: compressedDataUrl });

      const token = await ensureAuthToken();
      const headers = {
        "Content-Type": "application/json",
        "x-user-email": currentUser.email
      };
      if (token) headers["Authorization"] = "Bearer " + token;

      const res = await safeFetchJson("/api/user/profile", {
        method: "PUT",
        headers,
        body: JSON.stringify({ photo: compressedDataUrl, email: currentUser.email })
      });
      if (res && res.success && res.user) {
        const activeToken = res.token || token || (currentUser && currentUser.token) || "";
        if (activeToken) setAuthToken(activeToken);

        setLoggedInUser({
          ...currentUser,
          _id: (res.user._id || res.user.id || res.user.userId || "").toString(),
          id: (res.user._id || res.user.id || res.user.userId || "").toString(),
          userId: (res.user.userId || res.user._id || res.user.id || "").toString(),
          name: res.user.name,
          email: res.user.email,
          provider: res.user.provider || currentUser.provider,
          photo: res.user.photo,
          token: activeToken
        });
        renderAvatarEverywhere(res.user);
        profilePageToast.style.color = "#2e7d32";
        profilePageToast.textContent = "Profile photo updated successfully.";

        logUserAction("profile photo update", "User updated profile photo");
        return;
      }
      profilePageToast.style.color = "#2e7d32";
      profilePageToast.textContent = "Photo chosen. Click Save Changes to confirm.";
    } catch(err) {
      console.error("Profile photo processing failed:", err);
      profilePageToast.style.color = "#b3261e";
      profilePageToast.textContent = "Error processing photo: " + err.message;
    }
  });

  document.getElementById("profilePageSaveBtn").addEventListener("click", async () => {
    if (!currentUser) return;
    const newName = document.getElementById("profilePageNameInput").value.trim();
    if (!newName){
      profilePageToast.style.color = "#b3261e";
      profilePageToast.textContent = "Name can't be empty.";
      return;
    }

    profilePageToast.style.color = "var(--muted)";
    profilePageToast.textContent = "Saving profile to MongoDB...";

    const token = await ensureAuthToken();
    const updatePayload = {
      name: newName,
      email: currentUser.email
    };
    if (pendingProfileAvatarDataUrl !== null) {
      updatePayload.photo = pendingProfileAvatarDataUrl;
    } else if (currentUser.photo) {
      updatePayload.photo = currentUser.photo;
    }

    try {
      const headers = {
        "Content-Type": "application/json",
        "x-user-email": currentUser.email
      };
      if (token) headers["Authorization"] = "Bearer " + token;

      const res = await safeFetchJson("/api/user/profile", {
        method: "PUT",
        headers,
        body: JSON.stringify(updatePayload)
      });
      if (!res || !res.success || !res.user) {
        profilePageToast.style.color = "#b3261e";
        profilePageToast.textContent = (res && res.message) ? res.message : "Failed to save profile in MongoDB.";
        return;
      }

      const activeToken = res.token || token || (currentUser && currentUser.token) || "";
      if (activeToken) setAuthToken(activeToken);

      setLoggedInUser({
        ...currentUser,
        _id: (res.user._id || res.user.id || res.user.userId || "").toString(),
        id: (res.user._id || res.user.id || res.user.userId || "").toString(),
        userId: (res.user.userId || res.user._id || res.user.id || "").toString(),
        name: res.user.name,
        email: res.user.email,
        provider: res.user.provider || currentUser.provider,
        photo: res.user.photo,
        token: activeToken
      });

      renderAvatarEverywhere(res.user);
      const nameEl = document.getElementById("userChipName");
      const dropdownNameEl = document.getElementById("profileDropdownName");
      if (nameEl) nameEl.textContent = res.user.name;
      if (dropdownNameEl) dropdownNameEl.textContent = res.user.name;

      pendingProfileAvatarDataUrl = null;
      profilePageToast.style.color = "#2e7d32";
      profilePageToast.textContent = "Profile saved successfully.";
      setTimeout(() => {
        if (profilePageToast) profilePageToast.textContent = "";
      }, 3000);

      logUserAction("profile update", `User updated profile (Name: ${res.user.name})`, { name: res.user.name });
    } catch(err){
      console.error("MongoDB profile save error:", err);
      profilePageToast.style.color = "#b3261e";
      profilePageToast.textContent = "Database error: " + err.message;
    }
  });

  // ---- Profile button dropdown (open/close on click, close on item click & outside click) ----
  const profileBtn = document.getElementById("profileBtn");
  const profileDropdown = document.getElementById("profileDropdown");
  if (profileBtn && profileDropdown) {
    profileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle("open");
    });
    profileDropdown.querySelectorAll(".profile-dropdown-item").forEach(item => {
      item.addEventListener("click", () => {
        profileDropdown.classList.remove("open");
      });
    });
  }
  document.addEventListener("click", (e) => {
    const pdd = document.getElementById("profileDropdown");
    const pbtn = document.getElementById("profileBtn");
    if (pdd && !pdd.contains(e.target) && (!pbtn || !pbtn.contains(e.target))){
      pdd.classList.remove("open");
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

  // Auto-clear error toasts as soon as user clicks or types in any auth input field
  document.querySelectorAll("#loginPanel input, #signupPanel input, #forgotPanel input, #resetPanel input").forEach(input => {
    input.addEventListener("input", () => {
      hideToast(loginToast);
      hideToast(signupToast);
      hideToast(forgotToast);
      hideToast(resetToast);
    });
    input.addEventListener("focus", () => {
      hideToast(loginToast);
      hideToast(signupToast);
      hideToast(forgotToast);
      hideToast(resetToast);
    });
  });

  // ---- Forgot password: request the email ----
  document.getElementById("forgotLinkBtn").addEventListener("click", () => showPanel("forgot"));
  document.getElementById("backToLoginBtn").addEventListener("click", () => showPanel("login"));

  forgotPanel.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rawEmail = document.getElementById("forgotEmail").value;
    const email = normalizeEmail(rawEmail);

    if (!isValidEmail(email)){
      showToast(forgotToast, "Please enter a valid email address.", true);
      return;
    }

    // Trigger Firebase Auth Password Reset Email Session
    const auth = getFirebaseAuth();
    const helpers = getFirebaseAuthHelpers();
    if (auth && helpers && helpers.sendPasswordResetEmail) {
      helpers.sendPasswordResetEmail(auth, email).catch(err => {
        console.warn("Firebase Auth sendPasswordResetEmail notice:", err.message || err);
      });
    }

    try {
      const data = await safeFetchJson("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (data.success){
        const account = accounts[email];
        if (account && data.resetToken){
          account.resetToken = data.resetToken;
          account.resetTokenExpires = Date.now() + 15 * 60 * 1000;
          saveAccounts();
        }
        showToast(forgotToast, data.message || `If an account exists for ${email}, a password reset link has been sent to that inbox.`, false);
        forgotPanel.reset();
        return;
      }
    } catch(err){
      console.warn("MongoDB forgot password backend error, using local fallback:", err);
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
      origin = "http://localhost:5000";
    }

    const resetLink = `${origin}${pathname}?resetEmail=${encodeURIComponent(email)}&resetToken=${token}`;
    const resetMessage =
      `Hi ${account.name || "there"},\n\n` +
      `Click the link below to reset your password for AI Resume Analyzer:\n\n` +
      `${resetLink}\n\n` +
      `⏰ IMPORTANT: This password reset link is valid for 15 minutes.\n\n` +
      `If you didn't request a password reset, you can safely ignore this email.`;

    // Deliver reset email directly to user's registered inbox ONLY
    sendDirectUserEmail({
      toEmail: email,
      subject: "Reset your password — AI Resume Analyzer",
      message: resetMessage
    });

    showToast(forgotToast, `Password reset link sent to ${email}! Please check your inbox and spam folder (valid for 15 minutes).`, false);
    forgotPanel.reset();
  });

  // ---- Forgot password: the link in the email lands back here with
  // ?resetEmail=...&resetToken=... — verify it and let them set a new password ----
  let pendingResetEmail = null;
  let pendingResetToken = null;

  // ---- Email verification: the link in the confirmation email lands back
  // here with ?verifyEmail=...&verifyToken=... — validate it, flip the
  // account to verified, open the login panel with email prefilled, and prompt to log in ----
  let isVerificationProcessing = false;
  async function checkForVerifyLink(){
    if (isVerificationProcessing) return;
    const params = new URLSearchParams(location.search);
    const token = params.get("token") || params.get("verifyToken");
    const email = params.get("email") || params.get("verifyEmail");
    const pathname = window.location.pathname || "";

    if (!token && !pathname.includes("verify-email")) return;
    if (!token) return;

    isVerificationProcessing = true;
    const normalized = email ? normalizeEmail(email) : "";

    try {
      const data = await safeFetchJson("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, token })
      });
      if (data && data.success){
        const verifiedEmail = normalizeEmail(data.user?.email || normalized);
        if (verifiedEmail){
          if (!accounts[verifiedEmail]){
            accounts[verifiedEmail] = { name: data.user?.name || verifiedEmail, provider: "email", verified: true };
          } else {
            accounts[verifiedEmail].verified = true;
          }
          saveAccounts();
        }

        notifyUserOfAuthEvent({ email: verifiedEmail, name: data.user?.name || verifiedEmail, action: "Sign Up" });

        // Open login panel & prefill email so user can use login
        authModal.classList.add("active");
        showPanel("login");
        const loginEmailInput = document.getElementById("loginEmail");
        if (loginEmailInput && verifiedEmail) {
          loginEmailInput.value = verifiedEmail;
        }
        const loginPasswordInput = document.getElementById("loginPassword");
        if (loginPasswordInput) {
          setTimeout(() => loginPasswordInput.focus(), 300);
        }

        showToast(loginToast, `🎉 Email verified successfully! Your account is active. Please log in with your password.`, false);

        let cleanPath = window.location.pathname.replace(/\/verify-email\/?$/, "/");
        if (!cleanPath) cleanPath = "/";
        history.replaceState({}, document.title, cleanPath);
        return;
      } else if (data && !data.success && data.message){
        authModal.classList.add("active");
        showPanel("login");
        showToast(loginToast, data.message, true);
        let cleanPath = window.location.pathname.replace(/\/verify-email\/?$/, "/");
        if (!cleanPath) cleanPath = "/";
        history.replaceState({}, document.title, cleanPath);
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
      let cleanPath = window.location.pathname.replace(/\/verify-email\/?$/, "/");
      if (!cleanPath) cleanPath = "/";
      history.replaceState({}, document.title, cleanPath);
      return;
    }

    const isExpired = account.verifyTokenExpires && Date.now() > account.verifyTokenExpires;
    const valid = account.verifyToken === token && !isExpired;

    if (!valid){
      authModal.classList.add("active");
      showPanel("login");
      showToast(loginToast, isExpired ? "Verification link expired. Click 'Resend confirmation' for a new link." : "Verification link is invalid or used.", true);
      let cleanPath = window.location.pathname.replace(/\/verify-email\/?$/, "/");
      if (!cleanPath) cleanPath = "/";
      history.replaceState({}, document.title, cleanPath);
      return;
    }

    account.verified = true;
    saveAccounts();

    authModal.classList.add("active");
    showPanel("login");
    const loginEmailInput = document.getElementById("loginEmail");
    if (loginEmailInput && normalized) {
      loginEmailInput.value = normalized;
    }
    const loginPasswordInput = document.getElementById("loginPassword");
    if (loginPasswordInput) {
      setTimeout(() => loginPasswordInput.focus(), 300);
    }

    showToast(loginToast, `🎉 Email verified successfully! Your account is active. Please log in with your password.`, false);
    let cleanPath = window.location.pathname.replace(/\/verify-email\/?$/, "/");
    if (!cleanPath) cleanPath = "/";
    history.replaceState({}, document.title, cleanPath);
  }

  function checkForResetLink(){
    const params = new URLSearchParams(location.search);
    const email = params.get("email") || params.get("resetEmail");
    const token = params.get("token") || params.get("resetToken");
    const pathname = window.location.pathname || "";

    if (!token && !pathname.includes("reset-password")) return;
    if (!token || !email) return;

    const normalized = normalizeEmail(email);
    pendingResetEmail = normalized;
    pendingResetToken = token;
    const labelEl = document.getElementById("resetEmailLabel");
    if (labelEl) labelEl.textContent = normalized;

    authModal.classList.add("active");
    showPanel("reset");
  }

  resetPanel.addEventListener("submit", async (e) => {
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

    const params = new URLSearchParams(location.search);
    const token = pendingResetToken || params.get("token") || params.get("resetToken");

    if (!token) {
      showToast(resetToast, "Reset token is missing or expired. Please request a new link.", true);
      return;
    }

    try {
      const data = await safeFetchJson("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingResetEmail, token, password: pw })
      });
      if (data && data.success){
        const account = accounts[pendingResetEmail];
        if (account){
          account.password = pw;
          delete account.resetToken;
          delete account.resetTokenExpires;
          saveAccounts();
        }
        showToast(resetToast, "🎉 Password updated successfully! Redirecting to login...", false);
        setTimeout(() => {
          let cleanPath = window.location.pathname.replace(/\/reset-password\/?$/, "/");
          if (!cleanPath) cleanPath = "/";
          history.replaceState({}, document.title, cleanPath);
          const emailForLogin = pendingResetEmail;
          pendingResetEmail = null;
          pendingResetToken = null;
          resetPanel.reset();
          showPanel("login");
          const loginEmailInput = document.getElementById("loginEmail");
          if (loginEmailInput && emailForLogin) loginEmailInput.value = emailForLogin;
          const loginPasswordInput = document.getElementById("loginPassword");
          if (loginPasswordInput) setTimeout(() => loginPasswordInput.focus(), 300);
          showToast(loginToast, "Password updated! Please log in with your new password.", false);
        }, 1400);
        return;
      } else if (data && !data.success && data.message){
        showToast(resetToast, data.message, true);
        return;
      }
    } catch(err){
      console.warn("Backend reset-password error, using local fallback:", err);
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
      let cleanPath = window.location.pathname.replace(/\/reset-password\/?$/, "/");
      if (!cleanPath) cleanPath = "/";
      history.replaceState({}, document.title, cleanPath);
      const emailForLogin = pendingResetEmail;
      pendingResetEmail = null;
      pendingResetToken = null;
      resetPanel.reset();
      showPanel("login");
      const loginEmailInput = document.getElementById("loginEmail");
      if (loginEmailInput && emailForLogin) loginEmailInput.value = emailForLogin;
      const loginPasswordInput = document.getElementById("loginPassword");
      if (loginPasswordInput) setTimeout(() => loginPasswordInput.focus(), 300);
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

    // 1. Firebase Auth Signup & Email Verification Session
    const auth = getFirebaseAuth();
    const helpers = getFirebaseAuthHelpers();
    if (auth && helpers && helpers.createUserWithEmailAndPassword) {
      try {
        const userCredential = await helpers.createUserWithEmailAndPassword(auth, email, password);
        if (userCredential && userCredential.user) {
          if (helpers.updateProfile) {
            await helpers.updateProfile(userCredential.user, { displayName: name }).catch(() => {});
          }
          if (helpers.sendEmailVerification) {
            await helpers.sendEmailVerification(userCredential.user).catch(() => {});
          }
        }
      } catch (fbErr) {
        console.warn("Firebase Auth createUser notice:", fbErr.message || fbErr);
      }
    }

    // 2. MongoDB Backend Sync with Local Offline Fallback
    try {
      const data = await safeFetchJson("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      if (data && data.success && data.requireVerification){
        signupPanel.reset();
        checkPasswordsMatch();
        showVerifyPendingScreen(email);
        showToast(verifyPendingToast, data.message || "Account created successfully! A verification link has been sent to your email inbox. Please check your Inbox or Spam folder.", false);
        return;
      } else if (data && data.success && data.token){
        setAuthToken(data.token);
        setLoggedInUser({
          id: data.user._id || data.user.id || data.user.userId,
          _id: data.user._id || data.user.id,
          userId: data.user.userId || data.user._id,
          name: data.user.name,
          email: data.user.email,
          provider: "email",
          photo: data.user.photo
        });
        showToast(signupToast, `Account created! Welcome, ${data.user.name}!`, false);
        fetchHistoryFromBackend();
        setTimeout(() => {
          closeAuth();
          signupPanel.reset();
          checkPasswordsMatch();
        }, 700);
        return;
      } else if (data && !data.success && data.isOffline) {
        // Instant Local Offline Signup Fallback (requires email verification)
        accounts[email] = { name, password, provider: "email", verified: false };
        saveAccounts();
        signupPanel.reset();
        checkPasswordsMatch();
        showVerifyPendingScreen(email);
        showToast(verifyPendingToast, "Account created! A verification link has been sent to your email inbox. Please verify your email before logging in.", false);
        return;
      } else if (data && !data.success && data.message){
        showToast(signupToast, data.message, true);
        return;
      } else {
        // Fallback local unverified account
        accounts[email] = { name, password, provider: "email", verified: false };
        saveAccounts();
        signupPanel.reset();
        checkPasswordsMatch();
        showVerifyPendingScreen(email);
        showToast(verifyPendingToast, "Account created! A verification link has been sent to your email inbox. Please verify your email before logging in.", false);
        return;
      }
    } catch(err){
      console.warn("MongoDB signup API notice:", err);
      accounts[email] = { name, password, provider: "email", verified: false };
      saveAccounts();
      signupPanel.reset();
      checkPasswordsMatch();
      showVerifyPendingScreen(email);
      showToast(verifyPendingToast, "Account created! A verification link has been sent to your email inbox. Please verify your email before logging in.", false);
      return;
    }
  });

  const googleSignupBtn = document.getElementById("googleSignupBtn");
  if (googleSignupBtn) googleSignupBtn.addEventListener("click", () => signInWithGoogle(signupToast, true));

  // ---- Login ----
  loginPanel.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = normalizeEmail(document.getElementById("loginEmail").value);
    const password = document.getElementById("loginPassword").value;

    if (!isValidEmail(email)){
      showToast(loginToast, "Please enter a valid email address (e.g. yourname@gmail.com).", true);
      return;
    }

    // Authentication is handled entirely by the MongoDB backend below.
    // Firebase Auth is NOT used for email+password login — users exist in MongoDB only.
    // Firebase is only used for Google OAuth popups (signInWithPopup).

    // 2. MongoDB Backend Sync with Local Fallback
    try {
      const data = await safeFetchJson("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (data && data.success && data.token){
        setAuthToken(data.token);
        setLoggedInUser({
          id: data.user._id || data.user.id || data.user.userId,
          _id: data.user._id || data.user.id,
          userId: data.user.userId || data.user._id,
          name: data.user.name,
          email: data.user.email,
          provider: "email",
          photo: data.user.photo,
          token: data.token
        });
        showToast(loginToast, `Welcome back, ${data.user.name}!`, false);
        fetchHistoryFromBackend();
        setTimeout(() => {
          closeAuth();
          loginPanel.reset();
        }, 700);
        return;
      } else if (data && !data.success && data.requireVerification){
        showToast(loginToast, data.message || "Please verify your email before logging in. We have sent a verification link to your email inbox.", true);
        return;
      } else if (data && !data.success && data.isOffline) {
        // Instant Local Offline Login Fallback
        const existingAcc = accounts[email];
        if (existingAcc && !existingAcc.verified) {
          showToast(loginToast, "Please verify your email address before logging in. Check your email inbox for the verification link.", true);
          return;
        }
        if (existingAcc && existingAcc.password === password) {
          const userName = existingAcc.name || email.split("@")[0] || "User";
          setLoggedInUser({ id: "local_" + Date.now(), name: userName, email, provider: "email" });
          showToast(loginToast, `Welcome back, ${userName}!`, false);
          setTimeout(() => { closeAuth(); loginPanel.reset(); }, 700);
          return;
        }
        showToast(loginToast, "Incorrect email or password.", true);
        return;
      } else if (data && !data.success && data.message){
        showToast(loginToast, data.message, true);
        return;
      } else {
        showToast(loginToast, "Unable to log in. Please check your credentials.", true);
        return;
      }
    } catch(err){
      console.warn("MongoDB login API error:", err);
      // Do NOT fall back to localStorage accounts on other devices — the local
      // cache doesn't exist there, so showing "wrong password" is misleading.
      showToast(loginToast, "Unable to reach the server. Please check your internet connection and try again.", true);
      return;
    }
  });

  const googleLoginBtn = document.getElementById("googleLoginBtn");
  if (googleLoginBtn) googleLoginBtn.addEventListener("click", () => signInWithGoogle(loginToast, false));


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
      if (data.success && (data.verifyToken || data.message)){
        if (data.verifyToken) sendVerificationEmail(email, data.name || "", data.verifyToken);
        showVerifyPendingScreen(email);
        showToast(verifyPendingToast, "Account created successfully! A verification link has been sent to your email. Please check your Inbox or Spam/Junk folder.", false);
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
    showToast(verifyPendingToast, "Account created successfully! A verification link has been sent to your email. Please check your Inbox or Spam/Junk folder.", false);
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
        if (data.success && (data.verifyToken || data.message)){
          if (data.verifyToken) sendVerificationEmail(currentPendingVerifyEmail, data.name || "", data.verifyToken);
          showToast(verifyPendingToast, "A fresh verification link has been sent to your email inbox. Please check your Inbox or Spam folder.", false);
          return;
        }
      } catch(err){
        console.warn("Backend resend verification error, fallback:", err);
      }

      const account = accounts[currentPendingVerifyEmail];
      const name = account ? account.name : "";
      sendVerificationEmail(currentPendingVerifyEmail, name);
      showToast(verifyPendingToast, "A fresh verification link has been sent to your email inbox. Please check your Inbox or Spam folder.", false);
    });
  }

  const backToLoginFromVerifyBtn = document.getElementById("backToLoginFromVerifyBtn");
  if (backToLoginFromVerifyBtn){
    backToLoginFromVerifyBtn.addEventListener("click", () => showPanel("login"));
  }

  let isSigningIn = false;

  async function checkFirebaseRedirectResult() {
    const auth = getFirebaseAuth();
    const helpers = getFirebaseAuthHelpers();
    if (auth && helpers && helpers.getRedirectResult) {
      try {
        const result = await helpers.getRedirectResult(auth);
        if (result && result.user) {
          const gUser = result.user;
          const email = normalizeEmail(gUser.email);
          const name = gUser.displayName || email.split("@")[0];
          const photo = gUser.photoURL || "";
          let idToken = "";
          try { idToken = await gUser.getIdToken(); } catch(e){}

          const data = await safeFetchJson("/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, id_token: idToken })
          });

          if (data && data.success && data.token) {
            setAuthToken(data.token);
            setLoggedInUser({
              id: data.user._id || data.user.id || data.user.userId,
              _id: data.user._id || data.user.id,
              userId: data.user.userId || data.user._id,
              name: data.user.name || name,
              email: data.user.email || email,
              provider: "google",
              photo: data.user.photo || photo,
              token: data.token
            });
            fetchHistoryFromBackend();
            closeAuth();
          } else {
            showToast(loginToast, (data && data.message) || "Google authentication failed on MongoDB backend.", true);
          }
        }
      } catch (err) {
        console.warn("Firebase getRedirectResult notice:", err.message || err);
      }
    }
  }

  async function signInWithGoogle(toastEl, isSignupFlow){
    if (isSigningIn) {
      console.warn("Sign-in request already in progress.");
      return;
    }

    isSigningIn = true;

    const googleSignupBtn = document.getElementById("googleSignupBtn");
    const googleLoginBtn = document.getElementById("googleLoginBtn");
    if (googleSignupBtn) googleSignupBtn.disabled = true;
    if (googleLoginBtn) googleLoginBtn.disabled = true;

    try {
      const auth = getFirebaseAuth();
      const helpers = getFirebaseAuthHelpers();

      // 1. Try Firebase Auth Google Popup first (called directly before async delays to preserve user gesture)
      if (auth && helpers && helpers.signInWithPopup && helpers.GoogleAuthProvider) {
        try {
          const provider = new helpers.GoogleAuthProvider();
          if (provider && provider.setCustomParameters) {
            provider.setCustomParameters({ prompt: 'select_account' });
          }
          const result = await helpers.signInWithPopup(auth, provider);
          if (result && result.user) {
            const gUser = result.user;
            const email = normalizeEmail(gUser.email);
            const name = gUser.displayName || email.split("@")[0];
            const photo = gUser.photoURL || "";
            let idToken = "";
            try { idToken = await gUser.getIdToken(); } catch(e){}

            // Sync with MongoDB Backend /api/auth/google
            const data = await safeFetchJson("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, email, id_token: idToken })
            });

            if (data && data.success && data.token) {
              setAuthToken(data.token);
              setLoggedInUser({
                id: data.user._id || data.user.id || data.user.userId,
                _id: data.user._id || data.user.id,
                userId: data.user.userId || data.user._id,
                name: data.user.name || name,
                email: data.user.email || email,
                provider: "google",
                photo: data.user.photo || photo,
                token: data.token
              });
              showToast(toastEl, `Signed in as ${email}.`, false);
              fetchHistoryFromBackend();
              closeAuth();
              return;
            } else if (data && data.isOffline) {
              setLoggedInUser({
                id: "google_" + Date.now(),
                name: name,
                email: email,
                provider: "google",
                photo: photo
              });
              showToast(toastEl, `Signed in as ${email} (offline mode).`, false);
              closeAuth();
              return;
            } else {
              setLoggedInUser({
                id: "google_" + Date.now(),
                name: name,
                email: email,
                provider: "google",
                photo: photo
              });
              showToast(toastEl, `Signed in as ${email}.`, false);
              closeAuth();
              return;
            }
          }
        } catch (fbErr) {
          console.warn("Firebase Google Sign-In notice:", fbErr.code || fbErr.message || fbErr);
          if (fbErr.code === "auth/cancelled-popup-request") {
            // Ignore silently as this is the result of overlapping requests
            console.warn("Firebase sign-in popup cancelled due to concurrent request.");
            return;
          } else if (fbErr.code === "auth/popup-blocked" || fbErr.code === "auth/unauthorized-domain") {
            // Domain not in Firebase authorized list or popup blocked: offer seamless direct Google email login
            const fallbackEmail = prompt("Google popup was blocked or this domain is not whitelisted in Firebase Console.\nEnter your Google email address to sign in directly:", "user@gmail.com");
            if (fallbackEmail && isValidEmail(fallbackEmail.trim())) {
              const cleanEmail = normalizeEmail(fallbackEmail);
              const cleanName = cleanEmail.split("@")[0];
              try {
                const data = await safeFetchJson("/api/auth/google", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: cleanName, email: cleanEmail })
                });
                if (data && data.success && data.token) {
                  setAuthToken(data.token);
                  setLoggedInUser({
                    id: data.user._id || data.user.id || data.user.userId,
                    _id: data.user._id || data.user.id,
                    userId: data.user.userId || data.user._id,
                    name: data.user.name || cleanName,
                    email: data.user.email || cleanEmail,
                    provider: "google",
                    photo: data.user.photo || "",
                    token: data.token
                  });
                  showToast(toastEl, `Signed in as ${cleanEmail}.`, false);
                  fetchHistoryFromBackend();
                  closeAuth();
                  return;
                }
              } catch (e) {}
              setLoggedInUser({
                id: "google_" + Date.now(),
                name: cleanName,
                email: cleanEmail,
                provider: "google"
              });
              showToast(toastEl, `Signed in as ${cleanEmail}.`, false);
              closeAuth();
              return;
            }
            showToast(toastEl, "Google sign-in was cancelled.", true);
            return;
          } else if (fbErr.code === "auth/popup-closed-by-user") {
            showToast(toastEl, "Google sign-in was cancelled.", true);
            return;
          } else if (fbErr.code === "auth/operation-not-allowed") {
            showToast(toastEl, "Google Sign-In is not enabled in Firebase Console. Please use Email / Password signup above.", true);
            return;
          } else if (fbErr.code === "auth/network-request-failed" || (fbErr.message && fbErr.message.includes("ERR_NAME_NOT_RESOLVED"))) {
            showToast(toastEl, "DNS / Network error reaching Google Authentication servers. Please check your internet connection.", true);
            return;
          } else {
            showToast(toastEl, fbErr.message || "Google Sign-In failed. Please use Email & Password.", true);
            return;
          }
        }
      }

      // 2. Fallback to Google Identity Services (GIS)
      if (window.gsiScriptFailed || !window.google || !google.accounts || !google.accounts.oauth2) {
        showToast(toastEl, "Google Sign-In service is unreachable. Please check your internet connection or ad-blocker.", true);
        return;
      }

      if (!AUTH_CONFIG || !AUTH_CONFIG.GOOGLE_CLIENT_ID || AUTH_CONFIG.GOOGLE_CLIENT_ID.startsWith("YOUR_")) {
        showToast(toastEl, "Please configure your Google OAuth Client ID in AUTH_CONFIG.GOOGLE_CLIENT_ID to enable Google Sign-In.", true);
        return;
      }

      try {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: AUTH_CONFIG.GOOGLE_CLIENT_ID,
          scope: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid",
          error_callback: (err) => {
            console.warn("Google OAuth Error:", err);
            showToast(toastEl, "Unable to connect to Google OAuth service. Please verify your Client ID and Authorized Origins.", true);
          },
          callback: async (tokenResponse) => {
            if (!tokenResponse || (!tokenResponse.access_token && !tokenResponse.id_token)){
              showToast(toastEl, "Google sign-in was cancelled.", true);
              return;
            }

            let profile = null;
            const accessToken = tokenResponse.access_token;

            if (accessToken) {
              try {
                const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                  headers: { Authorization: "Bearer " + accessToken }
                });
                if (res.ok) profile = await res.json();
              } catch (e) {
                console.warn("Client userinfo v3 fetch error:", e);
              }
            }

            if ((!profile || !profile.email) && accessToken) {
              try {
                const res = await fetch("https://www.googleapis.com/userinfo/v2/me", {
                  headers: { Authorization: "Bearer " + accessToken }
                });
                if (res.ok) profile = await res.json();
              } catch (e) {}
            }

            if (profile && profile.email) {
              const email = normalizeEmail(profile.email);
              const name = profile.name || email.split("@")[0];
              const photo = profile.picture || "";

              // CRITICAL: Always sync with backend to get the real MongoDB _id.
              // Never set a dummy id — that would orphan the session from resume history.
              try {
                const data = await safeFetchJson("/api/auth/google", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, email, photo })
                });
                if (data && data.success && data.token) {
                  setAuthToken(data.token);
                  setLoggedInUser({
                    id: data.user._id || data.user.id || data.user.userId,
                    _id: data.user._id || data.user.id,
                    userId: data.user.userId || data.user._id,
                    name: data.user.name || name,
                    email: data.user.email || email,
                    provider: "google",
                    photo: data.user.photo || photo,
                    token: data.token
                  });
                  showToast(toastEl, `Signed in as ${email}.`, false);
                  fetchHistoryFromBackend();
                  closeAuth();
                } else {
                  showToast(toastEl, (data && data.message) || "Google sign-in failed. Please try again.", true);
                }
              } catch (syncErr) {
                console.warn("GIS backend sync error:", syncErr);
                showToast(toastEl, "Could not complete Google sign-in. Please check your connection.", true);
              }
            } else {
              showToast(toastEl, "Could not retrieve Google profile. Please try again.", true);
            }
          }
        });
        client.requestAccessToken();
      } catch (e){
        console.warn("Google Sign-In GIS init error:", e);
        showToast(toastEl, "Google Sign-In initialization failed. Please check your Client ID.", true);
      }
    } finally {
      isSigningIn = false;
      if (googleSignupBtn) googleSignupBtn.disabled = false;
      if (googleLoginBtn) googleLoginBtn.disabled = false;
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

  // ---- Resume History & User Activity (Source of truth: MongoDB Backend) ----
  const AUTH_TOKEN_KEY = "ara_jwt_token_v1";
  let unsyncedPendingAnalyses = [];
  let userActivitiesList = [];
  let userHistoryList = [];

  function getAuthToken(){
    try {
      const stored = localStorage.getItem(AUTH_TOKEN_KEY);
      if (stored) return stored;
      if (currentUser && currentUser.token) return currentUser.token;
      return null;
    } catch(e){
      return (currentUser && currentUser.token) || null;
    }
  }
  function setAuthToken(token){ try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch(e){} }
  function clearAuthToken(){ try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch(e){} }

  async function fetchActivityFromBackend(){
    const token = getAuthToken();
    if (!token || !currentUser) return;
    try {
      const data = await safeFetchJson("/api/activity", {
        headers: { "Authorization": "Bearer " + token }
      });
      if (data.success && Array.isArray(data.activities)){
        userActivitiesList = data.activities;
      }
    } catch(err){
      console.warn("Could not fetch activity from MongoDB backend:", err);
    }
  }

  async function fetchHistoryFromBackend(){
    const token = getAuthToken();
    if (!token){
      userHistoryList = [];
      renderHistory();
      return;
    }
    try {
      const data = await safeFetchJson("/api/history", {
        headers: { "Authorization": "Bearer " + token }
      });
      if (data && data.success && Array.isArray(data.history)){
        userHistoryList = data.history;
      } else {
        userHistoryList = [];
      }
    } catch(err){
      console.warn("Could not fetch history from MongoDB backend:", err);
      userHistoryList = [];
    } finally {
      renderHistory();
    }
  }

  async function syncUnsyncedAnalysesToBackend(){
    const token = getAuthToken();
    if (!token || !unsyncedPendingAnalyses.length) return;
    const toSync = [...unsyncedPendingAnalyses];
    unsyncedPendingAnalyses = [];
    for (const item of toSync){
      try {
        await safeFetchJson("/api/history", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify(item.payload)
        });
      } catch(e){}
    }
    await fetchHistoryFromBackend();
  }

  async function saveHistoryEntry(email, filename, score, verdict){
    if (!email && currentUser) email = currentUser.email;
    
    const finalFilename = filename || pendingResumeFilename || "resume.pdf";
    const ext = finalFilename.split(".").pop().toLowerCase();
    const fileType = ["pdf", "docx", "txt"].includes(ext) ? ext : "pdf";
    const analysisType = (analysisMode === "ats") ? "ATS Check" : "Full Breakdown";

    const payload = {
      fileName: finalFilename,
      filename: finalFilename,
      fileType: fileType,
      analysisType: analysisType,
      atsScore: score,
      score: score,
      verdict: verdict,
      resumeText: pendingResumeText || "",
      detectedSkills: (lastAnalysisData && lastAnalysisData.skills) ? lastAnalysisData.skills : [],
      missingKeywords: (lastAnalysisData && lastAnalysisData.missing) ? lastAnalysisData.missing : [],
      suggestions: (lastAnalysisData && lastAnalysisData.uniqueWeakPhrases) ? lastAnalysisData.uniqueWeakPhrases : [],
      analysisResult: {
        verdict: verdict,
        atsScore: score,
        score: score,
        analysisType: analysisType,
        experience: lastAnalysisData ? lastAnalysisData.experience : null,
        education: lastAnalysisData ? lastAnalysisData.education : null,
        projects: lastAnalysisData ? lastAnalysisData.projects : null,
        skills: lastAnalysisData ? lastAnalysisData.skills : [],
        missingKeywords: lastAnalysisData ? lastAnalysisData.missing : [],
        suggestions: lastAnalysisData ? lastAnalysisData.uniqueWeakPhrases : [],
        mode: analysisMode || "ats"
      },
      analysisResults: {
        verdict: verdict,
        score: score,
        atsScore: score
      },
      mode: analysisMode || "ats"
    };

    // Add entry to local state immediately for instant feedback
    const localEntry = {
      id: "temp_" + Date.now(),
      fileName: finalFilename,
      filename: finalFilename,
      fileType: fileType,
      analysisType: analysisType,
      atsScore: score,
      score: score,
      verdict: verdict,
      uploadDate: new Date(),
      analysisDate: new Date(),
      date: new Date()
    };
    userHistoryList.unshift(localEntry);
    renderHistory();

    const token = getAuthToken();
    if (token){
      try {
        await safeFetchJson("/api/history", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify(payload)
        });
        await fetchHistoryFromBackend();
      } catch(err){
        console.warn("Could not save history to MongoDB backend:", err);
        unsyncedPendingAnalyses.push({ payload });
      }
    } else {
      unsyncedPendingAnalyses.push({ payload });
    }
  }

  async function deleteHistoryEntry(email, id){
    if (!id) return;
    // Optimistic delete locally
    userHistoryList = userHistoryList.filter(e => (e.id !== id && e._id !== id && e.analysisId !== id && e.resumeId !== id));
    renderHistory();

    const token = getAuthToken();
    if (token){
      try {
        const res = await safeFetchJson("/api/history/" + encodeURIComponent(id), {
          method: "DELETE",
          headers: { "Authorization": "Bearer " + token }
        });
        if (res && res.success && Array.isArray(res.history)) {
          userHistoryList = res.history;
          renderHistory();
        } else {
          await fetchHistoryFromBackend();
        }
        showToast("Resume removed from history", "success");
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
    if (!listEl) return;
    listEl.innerHTML = "";
    const token = getAuthToken();
    if (!currentUser && !token){
      listEl.innerHTML = '<div class="history-empty">Log in to see your resume history across all devices.</div>';
      return;
    }
    const entries = userHistoryList || [];
    if (!entries.length){
      listEl.innerHTML = '<div class="history-empty">No resume analysis history found.</div>';
      return;
    }
    entries.forEach(entry => {
      const row = document.createElement("div");
      row.className = "history-item";
      
      const fileNameStr = entry.fileName || entry.filename || "resume.pdf";
      const uploadDateObj = new Date(entry.uploadDate || entry.date || Date.now());
      const dateLabel = isNaN(uploadDateObj.getTime()) ? "Recently" : uploadDateObj.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      
      const scoreVal = (entry.atsScore !== undefined && entry.atsScore !== null) ? entry.atsScore : (entry.score !== undefined ? entry.score : null);
      const scoreDisplay = scoreVal !== null ? `${scoreVal}` : "—";
      const statusText = entry.verdict || entry.status || "Analyzed";
      const typeText = entry.analysisType || "Resume Analysis";
      const idVal = entry.id || entry._id || entry.analysisId;

      row.setAttribute("data-id", idVal || "");
      row.innerHTML = `
        <div class="history-item-score" style="background:${scoreColor(scoreVal || 0)}" title="ATS Score">${scoreDisplay}</div>
        <div class="history-item-info">
          <div class="history-item-name">${escapeHtml(fileNameStr)}</div>
          <div class="history-item-meta">
            <span class="history-type-tag" style="background:var(--subtle); padding:2px 6px; border-radius:4px; font-weight:600; font-size:11px;">${escapeHtml(typeText)}</span> &bull; 
            <span>${dateLabel}</span> &bull; 
            <span class="history-status-tag" style="font-weight:600; color:var(--accent);">${escapeHtml(statusText)}</span>
          </div>
        </div>
        <button class="history-delete-btn" data-id="${idVal}" type="button" aria-label="Delete this entry" title="Delete entry">🗑</button>
      `;
      listEl.appendChild(row);
    });
  }

  async function loadHistoricalAnalysisView(idVal){
    if (!idVal) return;
    const token = getAuthToken();
    if (!token) return;
    try {
      showLoading("Loading saved analysis result...");
      await paintFrame();
      const res = await safeFetchJson("/api/user/resume-analysis/" + encodeURIComponent(idVal), {
        headers: { "Authorization": "Bearer " + token }
      });
      hideLoading();
      if (res && res.success && res.analysis) {
        const item = res.analysis;
        const resultData = item.analysisResult || {};
        const extracted = item.extractedData || {};
        
        const score = item.atsScore || resultData.atsScore || resultData.score || 0;
        const verdict = resultData.verdict || "Analyzed";
        const color = scoreColor(score);
        
        renderATSScore(score, color, verdict);

        const skills = extracted.skills || resultData.detectedSkills || [];
        const missing = resultData.missingKeywords || [];
        
        lastAnalysisData = {
          filename: item.fileName || "resume.pdf",
          name: extracted.name || item.name || "User",
          email: extracted.email || item.email || "Not found",
          phone: extracted.phone || "Not found",
          skills: skills,
          missing: missing,
          score: score,
          verdict: verdict,
          experience: extracted.experience ? (Array.isArray(extracted.experience) ? extracted.experience.join("\n") : extracted.experience) : "Loaded from history",
          education: extracted.education ? (Array.isArray(extracted.education) ? extracted.education.join("\n") : extracted.education) : "Loaded from history"
        };

        if (typeof closeHistory === "function") closeHistory();
        const resultsEl = document.getElementById("results");
        if (resultsEl) {
          resultsEl.style.display = "block";
          resultsEl.scrollIntoView({ behavior: "smooth" });
        }
        if (typeof showToast === "function") {
          showToast("Loaded analysis for " + (item.fileName || "resume"), "success");
        }
      } else {
        if (typeof showToast === "function") {
          showToast("Could not load analysis details", "error");
        }
      }
    } catch(err){
      hideLoading();
      console.warn("Failed to load historical analysis:", err);
      if (typeof showToast === "function") {
        showToast("Error loading saved analysis", "error");
      }
    }
  }

  document.getElementById("historyList").addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".history-delete-btn");
    if (deleteBtn) {
      e.stopPropagation();
      const id = deleteBtn.dataset.id;
      deleteHistoryEntry(currentUser ? currentUser.email : null, id);
      return;
    }
    const itemRow = e.target.closest(".history-item");
    if (itemRow) {
      const delBtn = itemRow.querySelector(".history-delete-btn");
      const id = itemRow.dataset.id || (delBtn ? delBtn.dataset.id : null);
      if (id) {
        loadHistoricalAnalysisView(id);
      }
    }
  });

  const historyModal = document.getElementById("historyModal");
  async function openHistory(){
    if (!historyModal) return;
    historyModal.classList.add("active");
    renderHistory();
    if (sessionRestorePromise) {
      try { await sessionRestorePromise; } catch(e){}
    }
    await fetchHistoryFromBackend();
    if (typeof logUserAction === "function") {
      logUserAction("view history", "User opened resume history");
    }
  }
  function closeHistory(){ if (historyModal) historyModal.classList.remove("active"); }

  const historyBtn = document.getElementById("historyBtn");
  if (historyBtn) {
    historyBtn.addEventListener("click", () => {
      const pdd = document.getElementById("profileDropdown");
      if (pdd) pdd.classList.remove("open");
      openHistory();
    });
  }

  const navHistoryBtn = document.getElementById("navHistoryBtn");
  if (navHistoryBtn) {
    navHistoryBtn.addEventListener("click", () => {
      const pdd = document.getElementById("profileDropdown");
      if (pdd) pdd.classList.remove("open");
      openHistory();
    });
  }
  document.getElementById("historyCloseBtn").addEventListener("click", closeHistory);
  if (historyModal) {
    historyModal.addEventListener("click", (e) => { if (e.target === historyModal) closeHistory(); });
  }

  // ---- User Dashboard System ----
  async function fetchDashboardDataFromBackend() {
    const token = getAuthToken();
    if (!token) return null;
    try {
      const data = await safeFetchJson("/api/user/dashboard", {
        headers: { "Authorization": "Bearer " + token }
      });
      if (data && data.success) {
        return data;
      }
    } catch(err) {
      console.warn("Could not fetch dashboard data from MongoDB backend:", err);
    }
    return null;
  }

  function renderDashboardData(data) {
    if (!data) return;
    const u = data.user || {};
    const s = data.stats || {};

    // 1. User Information
    const dashName = document.getElementById("dashUserName");
    const dashEmail = document.getElementById("dashUserEmail");
    const dashProvider = document.getElementById("dashUserProvider");
    const dashCreated = document.getElementById("dashUserCreated");
    const dashLastLogin = document.getElementById("dashUserLastLogin");

    if (dashName) dashName.textContent = u.name || (currentUser ? currentUser.name : "User");
    if (dashEmail) dashEmail.textContent = u.email || (currentUser ? currentUser.email : "—");
    if (dashProvider) dashProvider.textContent = u.provider || "email";
    if (dashCreated) dashCreated.textContent = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—";
    if (dashLastLogin) dashLastLogin.textContent = u.lastLogin ? new Date(u.lastLogin).toLocaleString() : "—";

    // Avatar
    const dashInitials = document.getElementById("dashAvatarInitials");
    const dashImg = document.getElementById("dashAvatarImg");
    if (dashInitials && dashImg) {
      if (u.photo) {
        dashImg.src = u.photo;
        dashImg.style.display = "block";
        dashInitials.style.display = "none";
      } else {
        dashImg.style.display = "none";
        dashInitials.style.display = "inline";
        dashInitials.textContent = (u.name || "U").trim().charAt(0).toUpperCase();
      }
    }

    // 2. Metrics Cards
    const totalEl = document.getElementById("dashStatTotalResumes");
    const latestScoreEl = document.getElementById("dashStatLatestScore");
    const highestScoreEl = document.getElementById("dashStatHighestScore");
    const avgScoreEl = document.getElementById("dashStatAvgScore");

    if (totalEl) totalEl.textContent = s.totalResumes !== undefined ? s.totalResumes : 0;
    if (latestScoreEl) latestScoreEl.textContent = s.latestScore !== null ? s.latestScore : "—";
    if (highestScoreEl) highestScoreEl.textContent = s.highestScore !== null ? s.highestScore : "—";
    if (avgScoreEl) avgScoreEl.textContent = s.avgScore !== null ? s.avgScore : "—";

    // 3. Latest Uploaded Resume
    const latestBox = document.getElementById("dashLatestUploadBox");
    const latestFileName = document.getElementById("dashLatestFileName");
    const latestFileType = document.getElementById("dashLatestFileType");
    const latestFileDate = document.getElementById("dashLatestFileDate");

    if (s.latestUpload) {
      if (latestBox) latestBox.style.display = "block";
      if (latestFileName) latestFileName.textContent = s.latestUpload.fileName || "resume.pdf";
      if (latestFileType) latestFileType.textContent = (s.latestUpload.fileType || "PDF").toUpperCase();
      if (latestFileDate) latestFileDate.textContent = s.latestUpload.uploadDate ? new Date(s.latestUpload.uploadDate).toLocaleString() : "—";
    } else {
      if (latestBox) latestBox.style.display = "none";
    }

    // 4. Recent Resume Analyses
    const analysesContainer = document.getElementById("dashRecentAnalysesList");
    if (analysesContainer) {
      const analyses = data.recentAnalyses || [];
      if (!analyses.length) {
        analysesContainer.innerHTML = '<div style="padding:16px; text-align:center; color:#888; font-size:13px;">No resume analyses found yet. Upload a resume to get started!</div>';
      } else {
        analysesContainer.innerHTML = analyses.map(item => `
          <div class="history-item" style="padding:12px 14px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:700; font-size:14px; color:var(--ink);">${escapeHtml(item.fileName || item.filename)}</div>
              <div style="font-size:12px; color:#777; margin-top:2px;">
                <span style="display:inline-block; background:var(--subtle); padding:2px 6px; border-radius:4px; font-weight:600;">${escapeHtml(item.analysisType || 'Resume Analysis')}</span>
                &bull; ${new Date(item.date).toLocaleDateString()}
              </div>
            </div>
            <div style="text-align:right;">
              <span class="history-item-score" style="font-size:15px; font-weight:800; color:${scoreColor(item.atsScore)}">${item.atsScore}</span>
              <div style="font-size:11px; color:#666; font-weight:600;">${escapeHtml(item.verdict || 'Analyzed')}</div>
            </div>
          </div>
        `).join("");
      }
    }

    // 5. Recent User Activities Feed
    const activitiesContainer = document.getElementById("dashRecentActivitiesList");
    if (activitiesContainer) {
      const acts = data.recentActivities || [];
      if (!acts.length) {
        activitiesContainer.innerHTML = '<div style="padding:16px; text-align:center; color:#888; font-size:13px;">No activities recorded yet.</div>';
      } else {
        activitiesContainer.innerHTML = acts.map(act => `
          <div class="activity-item" style="padding:10px 12px; border-bottom:1px solid #f0f0f0; display:flex; align-items:center; justify-content:space-between;">
            <div>
              <span style="display:inline-block; font-size:11px; text-transform:uppercase; font-weight:700; background:#e8f4fd; color:#1976d2; padding:2px 6px; border-radius:4px; margin-right:8px;">${escapeHtml(act.action)}</span>
              <span style="font-size:13px; color:var(--ink);">${escapeHtml(act.description)}</span>
            </div>
            <div style="font-size:11px; color:#888; white-space:nowrap; margin-left:12px;">${new Date(act.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
          </div>
        `).join("");
      }
    }
  }

  const dashboardModal = document.getElementById("dashboardModal");
  async function openDashboard() {
    if (!dashboardModal) return;
    dashboardModal.classList.add("active");
    if (sessionRestorePromise) {
      try { await sessionRestorePromise; } catch(e){}
    }
    const data = await fetchDashboardDataFromBackend();
    if (data) {
      renderDashboardData(data);
    }
  }

  function closeDashboard() {
    if (dashboardModal) dashboardModal.classList.remove("active");
  }

  const navDashboardBtn = document.getElementById("navDashboardBtn");
  if (navDashboardBtn) navDashboardBtn.addEventListener("click", openDashboard);

  const dropdownDashboardBtn = document.getElementById("dropdownDashboardBtn");
  if (dropdownDashboardBtn) {
    dropdownDashboardBtn.addEventListener("click", () => {
      const pdd = document.getElementById("profileDropdown");
      if (pdd) pdd.classList.remove("open");
      openDashboard();
    });
  }

  const dashboardCloseBtn = document.getElementById("dashboardCloseBtn");
  if (dashboardCloseBtn) dashboardCloseBtn.addEventListener("click", closeDashboard);

  if (dashboardModal) {
    dashboardModal.addEventListener("click", (e) => {
      if (e.target === dashboardModal) closeDashboard();
    });
  }

  const profileSupportBtn = document.getElementById("profileSupportBtn");
  if (profileSupportBtn){
    profileSupportBtn.addEventListener("click", () => {
      const pdd = document.getElementById("profileDropdown");
      if (pdd) pdd.classList.remove("open");
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

  async function deleteSupportTicket(ticketId){
    if (!ticketId) return;
    const currentTickets = loadSupportTickets();
    const updatedTickets = currentTickets.filter(t => (t.id || t.ticketId) !== ticketId);
    saveSupportTickets(updatedTickets);
    renderSupportTickets();

    // Call backend API to delete from database and log activity
    try {
      const userEmail = currentUser ? currentUser.email : (currentTickets.find(t => (t.id || t.ticketId) === ticketId)?.email || "");
      await safeFetchJson(`/api/support/${encodeURIComponent(ticketId)}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": userEmail
        },
        body: JSON.stringify({ ticketId: ticketId, email: userEmail })
      });
    } catch (err) {
      console.warn("Support ticket backend deletion notice:", err);
    }
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
      listEl.innerHTML = "";
      return;
    }

    wrap.style.display = "block";
    listEl.innerHTML = "";

    tickets.slice(0, 15).forEach(t => {
      const item = document.createElement("div");
      item.className = "support-ticket-item";
      const ticketId = t.id || t.ticketId || "";
      const dateStr = new Date(t.date || t.createdAt || Date.now()).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      item.innerHTML = `
        <div class="support-ticket-head">
          <span class="support-ticket-id">${escapeHtml(ticketId)}</span>
          <div class="support-ticket-head-right">
            <span class="support-ticket-status">${escapeHtml(t.status || "Active & Sent to Support")}</span>
            <button class="support-delete-btn" data-id="${escapeHtml(ticketId)}" type="button" aria-label="Delete support request" title="Delete this support request">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="support-ticket-msg">${escapeHtml(t.message || "")}</div>
        <div class="support-ticket-time">${escapeHtml(dateStr)} &bull; ${escapeHtml(t.email || "")}</div>
      `;
      listEl.appendChild(item);
    });
  }

  const supportModal = document.getElementById("supportModal");
  const supportFabBtn = document.getElementById("supportFabBtn");
  const supportCloseBtn = document.getElementById("supportCloseBtn");
  const supportForm = document.getElementById("supportForm");
  const supportToast = document.getElementById("supportToast");

  async function syncSupportTicketsFromBackend(){
    if (!currentUser || !currentUser.email) return;
    try {
      const res = await safeFetchJson(`/api/support?email=${encodeURIComponent(currentUser.email)}`);
      if (res && res.success && Array.isArray(res.tickets) && res.tickets.length > 0){
        const local = loadSupportTickets();
        const map = new Map();
        res.tickets.forEach(t => map.set(t.id || t.ticketId, t));
        local.forEach(t => {
          const tid = t.id || t.ticketId;
          if (tid && !map.has(tid)) map.set(tid, t);
        });
        const merged = Array.from(map.values()).sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
        saveSupportTickets(merged);
        renderSupportTickets();
      }
    } catch (e){
      console.warn("Support tickets sync notice:", e);
    }
  }

  function openSupport(){
    if (currentUser){
      const nameInput = document.getElementById("supportName");
      const emailInput = document.getElementById("supportEmail");
      if (nameInput) nameInput.value = currentUser.name || "";
      if (emailInput) emailInput.value = currentUser.email || "";
      syncSupportTicketsFromBackend();
    }
    renderSupportTickets();
    supportModal.classList.add("active");
  }
  function closeSupport(){ supportModal.classList.remove("active"); }

  if (supportFabBtn) supportFabBtn.addEventListener("click", openSupport);
  if (supportCloseBtn) supportCloseBtn.addEventListener("click", closeSupport);
  if (supportModal) supportModal.addEventListener("click", (e) => { if (e.target === supportModal) closeSupport(); });

  const supportTicketsListEl = document.getElementById("supportTicketsList");
  if (supportTicketsListEl) {
    supportTicketsListEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".support-delete-btn");
      if (btn) {
        e.stopPropagation();
        const id = btn.dataset.id;
        deleteSupportTicket(id);
      }
    });
  }

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

      safeFetchJson("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: ticketId,
          name: name,
          email: email,
          message: message
        })
      })
      .then(data => {
        if (data && data.success) {
          console.log("Support message sent via backend API");
        } else if (data) {
          console.warn("Support message backend notice:", data.message);
        }
      })
      .catch(err => console.error("Support message backend FAILED:", err));

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





  sessionRestorePromise = restoreSession();

  function setupFirebaseAuthStateListener() {
    const auth = getFirebaseAuth();
    const helpers = getFirebaseAuthHelpers();
    if (auth && helpers && helpers.onAuthStateChanged) {
      helpers.onAuthStateChanged(auth, async (fbUser) => {
        if (fbUser && fbUser.email && !currentUser) {
          const email = normalizeEmail(fbUser.email);
          const token = getAuthToken();
          if (token) {
            await restoreSession();
          } else {
            try {
              const data = await safeFetchJson("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: fbUser.displayName || email.split("@")[0],
                  email: email
                })
              });
              if (data && data.success && data.token) {
                setAuthToken(data.token);
                setLoggedInUser({
                  id: data.user._id || data.user.id || data.user.userId,
                  _id: data.user._id || data.user.id,
                  userId: data.user.userId || data.user._id,
                  name: data.user.name || fbUser.displayName,
                  email: data.user.email || email,
                  provider: data.user.provider || "google",
                  photo: data.user.photo || fbUser.photoURL || "",
                  token: data.token
                });
                fetchHistoryFromBackend();
              }
            } catch (e) {}
          }
        }
      });
    }
  }
  async function checkEmailVerificationURLParams() {
    await checkForVerifyLink();
  }

  setupFirebaseAuthStateListener();
  checkFirebaseRedirectResult();
  checkEmailVerificationURLParams();

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
  checkFirebaseRedirectResult();


  // ---- New Floating Pill Nav Bar Menu & Action Controls ----
  const menuBtn = document.getElementById("menuBtn");
  const navMenuDropdown = document.getElementById("navMenuDropdown");
  const menuWrap = document.getElementById("menuWrap");
  const navActionBtn = document.getElementById("navActionBtn");

  if (menuBtn && navMenuDropdown) {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navMenuDropdown.classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
      if (menuWrap && !menuWrap.contains(e.target)) {
        navMenuDropdown.classList.remove("open");
      }
    });

    const menuItems = navMenuDropdown.querySelectorAll(".menu-item");
    menuItems.forEach(item => {
      item.addEventListener("click", () => {
        navMenuDropdown.classList.remove("open");
      });
    });
  }

  const navSignInBtn = document.getElementById("navSignInBtn");
  if (navSignInBtn) navSignInBtn.addEventListener("click", () => openAuth("signup"));

  async function goHome() {
    if (typeof closeProfilePage === "function") closeProfilePage();
    if (typeof closeHistory === "function") closeHistory();
    if (typeof closeAuth === "function") closeAuth();
    if (typeof closeSupport === "function") closeSupport();
    const profileDropdown = document.getElementById("profileDropdown");
    if (profileDropdown) profileDropdown.classList.remove("open");
    const navMenuDropdown = document.getElementById("navMenuDropdown");
    if (navMenuDropdown) navMenuDropdown.classList.remove("open");

    // Sync user state & history with backend when returning Home
    if (getAuthToken()) {
      try {
        if (typeof restoreSession === "function") await restoreSession();
        if (typeof fetchHistoryFromBackend === "function") await fetchHistoryFromBackend();
      } catch (err) {
        console.warn("Backend sync notice on Home navigation:", err);
      }
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const navHomeBtnRef = document.getElementById("navHomeBtn");
  if (navHomeBtnRef) navHomeBtnRef.addEventListener("click", goHome);

  const userHomeDropdownBtn = document.getElementById("userHomeDropdownBtn");
  if (userHomeDropdownBtn) userHomeDropdownBtn.addEventListener("click", goHome);

  const navBrandLogoRef = document.getElementById("navBrandLogo");
  if (navBrandLogoRef) {
    navBrandLogoRef.addEventListener("click", (e) => {
      e.preventDefault();
      goHome();
    });
  }

  if (navActionBtn) {
    navActionBtn.addEventListener("click", () => {
      const fileInput = document.getElementById("fileInput");
      if (fileInput) fileInput.click();
      const dropzone = document.getElementById("dropzone");
      if (dropzone) dropzone.scrollIntoView({ behavior: "smooth" });
    });
  }
