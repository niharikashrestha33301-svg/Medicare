export const SPECIALTIES = ['General Physician', 'Cardiology', 'Dermatology', 'Pediatrics', 'Psychiatry', 'Neurology', 'Endocrinology', 'Allergy & Immunology', 'Gastroenterology', 'Geriatrics', 'Gynecology', 'Orthopedics', 'Nephrology', 'General Surgery'];
export const QUESTIONS = {
  symptoms: 'What symptoms or changes have you noticed? Please describe them in your own words.',
  duration: 'When did this start, and is it getting better, worse, or staying the same?',
  severity: 'How severe is it: mild, moderate, or severe? Is it affecting your usual activities?',
  age: 'What age group is the patient in: infant, child, adult, or older adult? You can skip this.',
  red_flags: 'Are there any warning signs such as chest pain, difficulty breathing, fainting, sudden weakness, heavy bleeding, or a sudden severe headache? If yes, seek emergency help now.',
  context: 'Any other symptoms, recent changes, pregnancy, or existing conditions you would like the clinician to know about? Avoid names, addresses, or ID numbers.'
};

// A conservative safety screen, not a clinical triage or diagnostic instrument.
// These checks run before any optional external model call.
export function emergencyScreen(messages) {
  const text = messages.filter(m => m.role === 'user').map(m => m.content).join('. ').toLowerCase().replace(/[’]/g, "'");
  const clauses = text.split(/(?:[.!?;\n]|\bbut\b|\bhowever\b)/).map(s => s.trim());
  const rules = [
    ['chest symptoms', /\b(chest (?:pain|pressure|tightness)|pain in (?:my |the )?chest|heart attack)\b/],
    ['breathing or airway symptoms', /\b(can'?t breathe|cannot breathe|struggling to breathe|difficulty breathing|trouble breathing|shortness of breath|short of breath|can'?t catch my breath|choking|blue lips|throat (?:is )?swelling|swollen tongue)\b/],
    ['sudden neurological symptoms', /\b(face (?:is )?drooping|slurred speech|sudden (?:weakness|numbness|confusion|vision loss)|one[- ]sided weakness|worst headache|sudden severe headache|stroke|seizure|unconscious|passed out|fainting)\b/],
    ['serious bleeding or injury', /\b(heavy bleeding|severe bleeding|uncontrolled bleeding|vomiting blood|coughing (?:up )?blood|black tarry stool|major injury|severe head injury|overdose|poisoning)\b/],
    ['immediate personal safety', /\b(kill myself|end my life|hurt myself|suicidal|suicide)\b/],
    ['severe allergic reaction', /\b(anaphylaxis|severe allergic reaction)\b/]
  ];
  for (const [reason, pattern] of rules) {
    for (const clause of clauses) {
      const match = pattern.exec(clause);
      if (!match) continue;
      const prefix = clause.slice(Math.max(0, match.index - 35), match.index);
      // Only suppress explicit, nearby negation; ambiguous descriptions escalate.
      if (/\b(no|without|deny|denies|not having|do not have|don't have)\s+(?:any\s+)?$/.test(prefix)) continue;
      return { emergency: true, reason };
    }
  }
  if (/\b(pregnant|pregnancy)\b/.test(text) && /\b(severe (?:abdominal|belly|stomach) pain|heavy bleeding)\b/.test(text)) return { emergency: true, reason: 'pregnancy warning signs' };
  if (/\b(baby|infant|newborn)\b/.test(text) && /\b(not waking|hard to wake|not feeding|high fever)\b/.test(text)) return { emergency: true, reason: 'infant warning signs' };
  return { emergency: false, reason: null };
}

export function guidedAssessment(messages) {
  const userMessages = messages.filter(m => m.role === 'user');
  const text = userMessages.map(m => m.content).join(' ').toLowerCase();
  const categories = [
    ['Dermatology', /rash|itch|skin|acne|eczema/], ['Psychiatry', /anxiety|anxious|depress|panic|mental|mood|stress/],
    ['Neurology', /headache|migraine|tingl|tremor|memory/], ['Gynecology', /period|menstrua|pelvic|vaginal|pregnan/],
    ['Gastroenterology', /stomach|belly|abdom|digest|diarrh|constipat|nausea|vomit/], ['Orthopedics', /joint|back pain|knee|bone|shoulder|sprain/],
    ['Endocrinology', /thyroid|diabet|thirst|weight change|weight gain|weight loss/], ['Allergy & Immunology', /allerg|sneez|hives/],
    ['Nephrology', /kidney|urine|urination/], ['Cardiology', /palpitation|heart racing/]
  ];
  let specialty = categories.find(([, pattern]) => pattern.test(text))?.[0] || 'General Physician';
  if (/\b(child|toddler|infant|newborn|baby)\b/.test(text) && !/pregnan/.test(text)) specialty = 'Pediatrics';
  let question = 'context';
  if (!/\b(\d+\s*(?:hour|day|week|month|year)|today|yesterday|since|started|long time)\b/.test(text)) question = 'duration';
  else if (!/\b(mild|moderate|severe|pain.*\d|\d\s*\/\s*10|slight|not painful)\b/.test(text)) question = 'severity';
  else if (!/\b(adult|child|baby|infant|\d+\s*(?:years? old|yo)|older adult)\b/.test(text) && userMessages.length < 4) question = 'age';
  else question = 'red_flags';
  const ready = userMessages.length >= 3 || (/\b(mild|moderate|severe)\b/.test(text) && /\b(adult|child|\d+\s*years? old)\b/.test(text) && /\d+\s*(?:day|week|month|hour)/.test(text));
  return { specialty, question, ready, emergency: false, urgency: /\b(severe|worsening|getting worse|high fever)\b/.test(text) ? 'urgent' : 'routine' };
}

export const EMERGENCY_REPLY = 'Your description includes possible emergency warning signs. Please call your local emergency service or go to the nearest emergency department now. Do not wait for this chat or a routine appointment. If possible, ask someone nearby to stay with you. This is not a diagnosis.';
