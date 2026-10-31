import type { CSSProperties } from "react";

/**
 * Props for inputs that hold API keys and tokens. They are masked like a
 * password field but are plain text inputs, so the browser's password manager
 * does not fill in (and then save) the user's own login password.
 */
export const secretFieldProps = {
  type: "text",
  autoComplete: "off",
  spellCheck: false,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-form-type": "other",
  style: { WebkitTextSecurity: "disc" } as CSSProperties,
} as const;
