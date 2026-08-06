-- Password recovery via email: 6-digit codes with purpose PASSWORD_RESET.

ALTER TYPE "VerificationPurpose" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';
