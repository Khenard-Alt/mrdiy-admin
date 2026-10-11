/**
 * The recruitment pipeline: the steps an application goes through from applying until employment.
 * Shared by the admin pages and the server routes, so everything uses the same names and wording.
 *
 *   Pending -> Under Review -> Shortlisted -> Interview Scheduled -> Hired
 *                              (Rejected or On Hold can happen at any step)
 */

export const STATUS_VALUES = [
  "Pending",
  "Reviewed",
  "Shortlisted",
  "Interview Scheduled",
  "Hired",
  "Rejected",
  "On Hold",
  "Withdrawn",
] as const;

export type Status = (typeof STATUS_VALUES)[number];

/** The steps shown on the applicant's timeline, in order. */
export const TIMELINE: { value: Status; label: string }[] = [
  { value: "Pending", label: "Submitted" },
  { value: "Reviewed", label: "Under Review" },
  { value: "Shortlisted", label: "Shortlisted" },
  { value: "Interview Scheduled", label: "Interview" },
  { value: "Hired", label: "Hired" },
];

const LABELS: Record<Status, string> = {
  Pending: "Pending",
  Reviewed: "Under Review",
  Shortlisted: "Shortlisted",
  "Interview Scheduled": "Interview Scheduled",
  Hired: "Hired",
  Rejected: "Rejected",
  "On Hold": "On Hold",
  Withdrawn: "Withdrawn",
};

// Older rows and other names are mapped to the pipeline names.
const ALIASES: Record<string, Status> = {
  approved: "Hired",
  accepted: "Hired",
  "under review": "Reviewed",
  submitted: "Pending",
  "interview": "Interview Scheduled",
  "on-hold": "On Hold",
  onhold: "On Hold",
};

/** Maps any stored status to a pipeline status; unknown or empty values count as Pending. */
export function normalizeStatus(raw: string | null | undefined): Status {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return "Pending";
  const exact = STATUS_VALUES.find((status) => status.toLowerCase() === value);
  return exact ?? ALIASES[value] ?? "Pending";
}

export function isKnownStatus(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  return STATUS_VALUES.some((status) => status.toLowerCase() === value) || value in ALIASES;
}

export function statusLabel(raw: string | null | undefined): string {
  return LABELS[normalizeStatus(raw)];
}

/** Tailwind classes for a status badge. */
export function statusClasses(raw: string | null | undefined): string {
  switch (normalizeStatus(raw)) {
    case "Hired":
      return "border-green-200 bg-green-50 text-green-700";
    case "Rejected":
      return "border-red-200 bg-red-50 text-red-700";
    case "Reviewed":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "Shortlisted":
      return "border-purple-200 bg-purple-50 text-purple-700";
    case "Interview Scheduled":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "On Hold":
      return "border-slate-300 bg-slate-100 text-slate-600";
    case "Withdrawn":
      return "border-slate-300 bg-slate-50 text-slate-500";
    default:
      return "border-yellow-200 bg-yellow-50 text-yellow-700";
  }
}

/**
 * Statuses HR can set with a button. "Interview Scheduled" is set by scheduling an
 * interview, and "Withdrawn" is set by the applicant withdrawing, not by HR.
 */
export const SETTABLE_STATUSES: Status[] = STATUS_VALUES.filter(
  (s) => s !== "Interview Scheduled" && s !== "Withdrawn"
);

// ---------------------------------------------------------------------------
// Wording of the notification, message and email for each status
// ---------------------------------------------------------------------------

export type StatusContent = {
  /** Short title for the in-app notification, the email heading and the subject. */
  title: string;
  /** One-sentence notification text. */
  alert: string;
  /** The full note sent as an HR message and as the email body (starts with the greeting). */
  note: string;
};

export function statusContent(raw: string, jobTitle: string | null, firstName?: string): StatusContent {
  const job = jobTitle ?? "this job";
  const hello = firstName ? `Dear ${firstName}` : "Dear Applicant";

  switch (normalizeStatus(raw)) {
    case "Reviewed":
      return {
        title: "Application under review",
        alert: `Our team is reviewing your application for ${job}. We will update you once a decision is made.`,
        note:
          `${hello}\n\nYour application for ${job} is now under review by our recruitment team. ` +
          "We will continue evaluating it and will update you once a decision has been made.\n\n" +
          "Thank you for your interest in MR.DIY.",
      };
    case "Shortlisted":
      return {
        title: "You are shortlisted",
        alert: `Good news! You are shortlisted for ${job}. We will contact you about the interview.`,
        note:
          `${hello}\n\nGood news! You have been shortlisted for ${job}. ` +
          "Our team will contact you soon with your interview schedule. Please keep your phone and the MR.DIY Careers app handy.\n\n" +
          "Thank you for your interest in MR.DIY.",
      };
    case "Interview Scheduled":
      return {
        title: "Interview scheduled",
        alert: `Your interview for ${job} is scheduled. Open the app to see the details.`,
        note: `${hello}\n\nYour interview for ${job} has been scheduled. Please open the MR.DIY Careers app to see the date, time and venue, and to confirm your attendance.`,
      };
    case "Hired":
      return {
        title: "Congratulations, you are hired!",
        alert: `You are hired for ${job}! Open the app to submit your pre-employment documents.`,
        note:
          `${hello}\n\nCongratulations! You are hired for ${job}.\n\n` +
          "To prepare for your first day, please submit your pre-employment documents (SSS, PhilHealth, Pag-IBIG, NBI clearance, medical, TIN and contract) " +
          "in the MR.DIY Careers app, under your application. You will also see the estimated number of days before you start.\n\n" +
          "Welcome to the MR.DIY team!",
      };
    case "Rejected":
      return {
        title: "Application update",
        alert: `Thank you for applying for ${job}. We decided to proceed with other candidates this time.`,
        note:
          `${hello}\n\nThank you for your interest in MR.DIY. We appreciate the opportunity to consider your application for ${job}.\n\n` +
          "After reviewing your application, we have decided to proceed with other candidates whose qualifications more closely match our current requirements.\n\n" +
          "We wish you the best in your future endeavors.",
      };
    case "On Hold":
      return {
        title: "Application on hold",
        alert: `Your application for ${job} is on hold for now. We will update you when there is progress.`,
        note:
          `${hello}\n\nYour application for ${job} is on hold for now. This does not mean it was declined. ` +
          "We will update you as soon as there is progress.\n\nThank you for your patience.",
      };
    case "Withdrawn":
      return {
        title: "Application withdrawn",
        alert: `Your application for ${job} has been withdrawn.`,
        note: `${hello}\n\nYou have withdrawn your application for ${job}. You're welcome to apply again anytime.`,
      };
    default:
      return {
        title: "Application pending",
        alert: `Your application for ${job} is pending. We will update you once it is reviewed.`,
        note: `${hello}\n\nYour application for ${job} is pending. We will update you once it is reviewed.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Pre-employment documents (created when an applicant is Hired)
// ---------------------------------------------------------------------------

export const PRE_EMPLOYMENT_REQUIREMENTS = [
  "SSS Number / E-1 Form",
  "PhilHealth Member Data Record (MDR)",
  "Pag-IBIG MID Number / Member Data Form",
  "NBI Clearance / Police Clearance",
  "Pre-Employment Medical Exam / Health Permit",
  "BIR Form 1902 / TIN",
  "Signed Employment Contract",
] as const;
