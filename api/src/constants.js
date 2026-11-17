export const STATUSES = {
  submitted: 'Submitted',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  reopened: 'Reopened',
  needs_info: 'Needs clarification',
  duplicate: 'Duplicate',
};

// statuses that count as "acknowledged or later"
export const ACK_STATUSES = ['acknowledged', 'in_progress', 'resolved'];

export const FLAG_REASONS = {
  personal_accusation: 'Unsupported personal accusation',
  harassment: 'Harassment',
  privacy: 'Personal information or identifiable person',
  spam: 'Spam or advertising',
  off_topic: 'Off topic',
  duplicate: 'Possible duplicate',
  no_evidence: 'Status change without evidence',
  misleading: 'Misleading or false',
  other: 'Other',
};

export const HIGH_PRIORITY_REASONS = new Set(['personal_accusation', 'harassment', 'privacy']);

export const REASON_CODES = {
  personal_accusation: 'Unsupported personal accusation',
  harassment: 'Harassment',
  privacy: 'Privacy: personal information',
  spam: 'Spam',
  off_topic: 'Off topic',
  duplicate: 'Duplicate',
  no_evidence: 'No evidence provided',
  no_violation: 'No rule broken',
  other: 'Other (explained in note)',
};

export const PII_PATTERNS = [
  { re: /(\+?27|\b0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/, msg: 'Please remove phone numbers.' },
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/, msg: 'Please remove email addresses.' },
];

export function piiError(text) {
  for (const p of PII_PATTERNS) if (p.re.test(text || '')) return p.msg;
  return null;
}

export const refOf = (id) => `CW-${String(id).padStart(6, '0')}`;
