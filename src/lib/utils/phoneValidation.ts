/**
 * Phone Number Validation Utility for SSM College Timetable Management System.
 * Supports standard Indian phone numbers (10 digits, optional +91 or 0 prefix, optional spaces/dashes),
 * and standard international E.164 formats without being unnecessarily restrictive.
 */

export interface PhoneValidationResult {
  isValid: boolean;
  cleaned: string;
  error?: string;
}

export function validatePhoneNumber(phone: string | undefined | null): PhoneValidationResult {
  if (!phone || !phone.trim()) {
    return {
      isValid: false,
      cleaned: '',
      error: 'Phone number is required.'
    };
  }

  const raw = phone.trim();

  // Check for invalid characters (only digits, spaces, dashes, parentheses, and leading + are permitted)
  if (!/^\+?[\d\s\-()]+$/.test(raw)) {
    return {
      isValid: false,
      cleaned: raw,
      error: 'Phone number can only contain numbers, spaces, dashes, and optional country code prefix (+91).'
    };
  }

  // Extract pure digits
  const pureDigits = raw.replace(/\D/g, '');

  // Indian numbers: 10 digits starting with 6, 7, 8, 9
  // Or 11 digits with leading 0 (e.g. 09876543210)
  // Or 12 digits with 91 (e.g. 919876543210)
  // Standard international: 10 to 15 digits
  if (pureDigits.length < 10) {
    return {
      isValid: false,
      cleaned: raw,
      error: 'Phone number is too short. Please enter a valid 10-digit mobile number.'
    };
  }

  if (pureDigits.length > 15) {
    return {
      isValid: false,
      cleaned: raw,
      error: 'Phone number is too long. Please enter a valid phone number (max 15 digits).'
    };
  }

  // If 10 digits, verify first digit is valid for Indian mobile (6, 7, 8, 9)
  if (pureDigits.length === 10) {
    if (!/^[6-9]/.test(pureDigits)) {
      return {
        isValid: false,
        cleaned: raw,
        error: 'Invalid mobile number. 10-digit Indian numbers must start with 6, 7, 8, or 9.'
      };
    }
    return { isValid: true, cleaned: pureDigits };
  }

  // If 11 digits with leading 0
  if (pureDigits.length === 11 && pureDigits.startsWith('0')) {
    const withoutZero = pureDigits.slice(1);
    if (!/^[6-9]/.test(withoutZero)) {
      return {
        isValid: false,
        cleaned: raw,
        error: 'Invalid mobile number. Indian mobile numbers must start with 6, 7, 8, or 9.'
      };
    }
    return { isValid: true, cleaned: withoutZero };
  }

  // If 12 digits with 91 prefix
  if (pureDigits.length === 12 && pureDigits.startsWith('91')) {
    const withoutCountryCode = pureDigits.slice(2);
    if (!/^[6-9]/.test(withoutCountryCode)) {
      return {
        isValid: false,
        cleaned: raw,
        error: 'Invalid mobile number. Indian mobile numbers must start with 6, 7, 8, or 9.'
      };
    }
    return { isValid: true, cleaned: withoutCountryCode };
  }

  // Valid international / general format
  return { isValid: true, cleaned: raw.replace(/[\s\-()]/g, '') };
}

