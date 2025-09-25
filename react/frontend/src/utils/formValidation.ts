/**
 * Form Validation Utilities
 * Centralized validation functions and schema builders for React Hook Form
 */

import { RegisterOptions, FieldValues } from 'react-hook-form';
import { CreateValidationRules } from '../types/forms';

// Common validation patterns
export const ValidationPatterns = {
  username: /^[a-zA-Z0-9_.-]+$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+?[\d\s-()]+$/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  noSpecialChars: /^[a-zA-Z0-9\s]+$/,
  strongPassword: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
} as const;

// Common validation messages
export const ValidationMessages = {
  required: (field: string) => `${field} is required`,
  minLength: (field: string, min: number) => `${field} must be at least ${min} characters`,
  maxLength: (field: string, max: number) => `${field} cannot exceed ${max} characters`,
  pattern: (field: string, pattern: string) => `${field} format is invalid: ${pattern}`,
  email: 'Please enter a valid email address',
  phone: 'Please enter a valid phone number',
  strongPassword: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  dateRange: 'End date must be after start date',
  futureDate: 'Date cannot be in the future',
  pastDate: 'Date cannot be in the past',
} as const;

// Validation rule builders
export class ValidationBuilder<T extends FieldValues> {
  private rules: Partial<CreateValidationRules<T>> = {};

  field(name: keyof T): FieldBuilder<T> {
    return new FieldBuilder<T>(this, name);
  }

  build(): CreateValidationRules<T> {
    return this.rules as CreateValidationRules<T>;
  }

  setRule(name: keyof T, rules: RegisterOptions<T>): this {
    this.rules[name] = rules;
    return this;
  }
}

export class FieldBuilder<T extends FieldValues> {
  private rules: RegisterOptions<T> = {};

  constructor(
    private parent: ValidationBuilder<T>,
    private fieldName: keyof T
  ) {}

  required(message?: string): this {
    this.rules.required = message || ValidationMessages.required(String(this.fieldName));
    return this;
  }

  minLength(min: number, message?: string): this {
    this.rules.minLength = {
      value: min,
      message: message || ValidationMessages.minLength(String(this.fieldName), min)
    };
    return this;
  }

  maxLength(max: number, message?: string): this {
    this.rules.maxLength = {
      value: max,
      message: message || ValidationMessages.maxLength(String(this.fieldName), max)
    };
    return this;
  }

  pattern(pattern: RegExp, message: string): this {
    this.rules.pattern = {
      value: pattern,
      message
    };
    return this;
  }

  email(): this {
    return this.pattern(ValidationPatterns.email, ValidationMessages.email);
  }

  username(): this {
    return this.pattern(
      ValidationPatterns.username,
      'Username can only contain letters, numbers, dots, hyphens, and underscores'
    );
  }

  strongPassword(): this {
    return this.pattern(ValidationPatterns.strongPassword, ValidationMessages.strongPassword);
  }

  custom(validationFn: (value: any) => boolean | string, name?: string): this {
    if (!this.rules.validate) {
      this.rules.validate = {};
    }
    this.rules.validate[name || 'custom'] = validationFn;
    return this;
  }

  dateRange(getEndDate: () => string | Date, allowEqual = false): this {
    return this.custom((startDate: string | Date) => {
      const start = new Date(startDate);
      const end = new Date(getEndDate());

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return true; // Let other validators handle invalid dates
      }

      if (allowEqual) {
        return start <= end || 'Start date cannot be after end date';
      } else {
        return start < end || 'Start date must be before end date';
      }
    }, 'dateRange');
  }

  futureDate(inclusive = false): this {
    return this.custom((value: string | Date) => {
      const date = new Date(value);
      const now = new Date();

      if (isNaN(date.getTime())) {
        return true; // Let other validators handle invalid dates
      }

      if (inclusive) {
        return date >= now || 'Date cannot be in the past';
      } else {
        return date > now || 'Date must be in the future';
      }
    }, 'futureDate');
  }

  pastDate(inclusive = false): this {
    return this.custom((value: string | Date) => {
      const date = new Date(value);
      const now = new Date();

      if (isNaN(date.getTime())) {
        return true; // Let other validators handle invalid dates
      }

      if (inclusive) {
        return date <= now || 'Date cannot be in the future';
      } else {
        return date < now || 'Date must be in the past';
      }
    }, 'pastDate');
  }

  minArray(min: number): this {
    return this.custom((value: any[]) => {
      if (!Array.isArray(value)) {
        return `${String(this.fieldName)} must be an array`;
      }
      return value.length >= min || `Select at least ${min} ${min === 1 ? 'item' : 'items'}`;
    }, 'minArray');
  }

  done(): ValidationBuilder<T> {
    this.parent.setRule(this.fieldName, this.rules);
    return this.parent;
  }
}

// Utility functions for common validation scenarios
export const createLoginValidation = () => {
  return new ValidationBuilder()
    .field('username')
      .required()
      .minLength(2)
      .maxLength(50)
      .username()
      .done()
    .field('password')
      .required()
      .minLength(6)
      .maxLength(128)
      .done()
    .build();
};

export const createFilterValidation = (minDate?: string, maxDate?: string) => {
  const builder = new ValidationBuilder()
    .field('sites')
      .minArray(1)
      .done()
    .field('timeRange')
      .required()
      .done();

  if (minDate && maxDate) {
    builder
      .field('startDate')
        .custom((value: string, formValues: any) => {
          if (formValues.timeRange !== 'Custom Range') return true;
          if (!value) return 'Start date is required for custom range';

          const date = new Date(value);
          const min = new Date(minDate);
          const max = new Date(maxDate);

          if (date < min) return `Start date cannot be before ${minDate}`;
          if (date > max) return `Start date cannot be after ${maxDate}`;

          return true;
        })
        .done()
      .field('endDate')
        .custom((value: string, formValues: any) => {
          if (formValues.timeRange !== 'Custom Range') return true;
          if (!value) return 'End date is required for custom range';

          const date = new Date(value);
          const min = new Date(minDate);
          const max = new Date(maxDate);
          const start = formValues.startDate ? new Date(formValues.startDate) : null;

          if (date < min) return `End date cannot be before ${minDate}`;
          if (date > max) return `End date cannot be after ${maxDate}`;
          if (start && date <= start) return 'End date must be after start date';

          return true;
        })
        .done();
  }

  return builder.build();
};

export const createPresetValidation = () => {
  return new ValidationBuilder()
    .field('name')
      .required()
      .minLength(2)
      .maxLength(50)
      .pattern(ValidationPatterns.noSpecialChars, 'Name can only contain letters, numbers, and spaces')
      .done()
    .field('description')
      .maxLength(200)
      .done()
    .field('category')
      .required()
      .done()
    .build();
};

export const createCreatePresetValidation = () => {
  return new ValidationBuilder()
    .field('name')
      .required()
      .minLength(2)
      .maxLength(50)
      .pattern(ValidationPatterns.noSpecialChars, 'Name can only contain letters, numbers, and spaces')
      .custom((value: string, formValues: any, presets: any) => {
        // Check for duplicate names
        if (presets && Object.values(presets).some((preset: any) => preset.name === value)) {
          return 'A preset with this name already exists';
        }
        return true;
      }, 'uniqueName')
      .done()
    .field('description')
      .maxLength(200)
      .done()
    .build();
};

export const createImportPresetValidation = () => {
  return new ValidationBuilder()
    .field('file')
      .required('Please select a file to import')
      .custom((files: FileList) => {
        if (!files || files.length === 0) {
          return 'Please select a file';
        }

        const file = files[0];

        // Check file type
        if (!file.name.endsWith('.json')) {
          return 'Only JSON files are supported';
        }

        // Check file size (max 1MB)
        if (file.size > 1024 * 1024) {
          return 'File size cannot exceed 1MB';
        }

        return true;
      }, 'fileValidation')
      .done()
    .build();
};

export const createAnalyticsValidation = () => {
  return new ValidationBuilder()
    .field('analysisType')
      .required('Please select an analysis type')
      .done()
    .field('timeRange')
      .required('Please select a time range')
      .done()
    .field('selectedSites')
      .minArray(1)
      .custom((sites: string[]) => {
        if (sites.length > 10) {
          return 'Maximum 10 sites can be selected for optimal performance';
        }
        return true;
      }, 'maxSites')
      .done()
    .field('selectedParameters')
      .minArray(1)
      .custom((params: string[]) => {
        if (params.length > 15) {
          return 'Maximum 15 parameters can be selected for analysis';
        }
        return true;
      }, 'maxParameters')
      .done()
    .field('anomalyThreshold')
      .custom((value: number) => {
        if (value < 0.1 || value > 5.0) {
          return 'Anomaly threshold must be between 0.1 and 5.0';
        }
        return true;
      }, 'thresholdRange')
      .done()
    .field('forecastPeriods')
      .custom((value: number) => {
        if (value < 1 || value > 365) {
          return 'Forecast periods must be between 1 and 365 days';
        }
        return true;
      }, 'forecastRange')
      .done()
    .field('confidenceLevel')
      .custom((value: number) => {
        if (value < 0.5 || value > 0.99) {
          return 'Confidence level must be between 50% and 99%';
        }
        return true;
      }, 'confidenceRange')
      .done()
    .build();
};

export const createSettingsValidation = () => {
  return new ValidationBuilder()
    .field('defaultTimeRange')
      .required('Please select a default time range')
      .done()
    .field('defaultSites')
      .minArray(1)
      .custom((sites: string[]) => {
        if (sites.length > 5) {
          return 'Maximum 5 default sites allowed';
        }
        return true;
      }, 'maxDefaultSites')
      .done()
    .field('refreshInterval')
      .custom((value: number) => {
        if (value < 30 || value > 3600) {
          return 'Refresh interval must be between 30 seconds and 1 hour';
        }
        return true;
      }, 'refreshIntervalRange')
      .done()
    .field('rowsPerPage')
      .custom((value: number) => {
        if (value < 10 || value > 500) {
          return 'Rows per page must be between 10 and 500';
        }
        return true;
      }, 'rowsPerPageRange')
      .done()
    .field('defaultChartType')
      .required('Please select a default chart type')
      .done()
    .field('defaultExportFormat')
      .required('Please select a default export format')
      .done()
    .field('theme')
      .required('Please select a theme preference')
      .done()
    .field('language')
      .required('Please select a language')
      .done()
    .field('timezone')
      .required('Please select a timezone')
      .done()
    .build();
};

// Schema validation helper
export const validateFormData = <T extends FieldValues>(
  data: T,
  rules: CreateValidationRules<T>
): { isValid: boolean; errors: Record<keyof T, string[]> } => {
  const errors: Record<keyof T, string[]> = {} as Record<keyof T, string[]>;
  let isValid = true;

  for (const [fieldName, fieldRules] of Object.entries(rules)) {
    const fieldErrors: string[] = [];
    const value = data[fieldName as keyof T];

    // Required validation
    if (fieldRules.required) {
      const message = typeof fieldRules.required === 'string'
        ? fieldRules.required
        : ValidationMessages.required(fieldName);

      if (!value || (Array.isArray(value) && value.length === 0)) {
        fieldErrors.push(message);
      }
    }

    // Skip other validations if field is empty and not required
    if (!value && !fieldRules.required) {
      continue;
    }

    // Length validations
    if (fieldRules.minLength && typeof value === 'string') {
      if (value.length < fieldRules.minLength.value) {
        fieldErrors.push(fieldRules.minLength.message);
      }
    }

    if (fieldRules.maxLength && typeof value === 'string') {
      if (value.length > fieldRules.maxLength.value) {
        fieldErrors.push(fieldRules.maxLength.message);
      }
    }

    // Pattern validation
    if (fieldRules.pattern && typeof value === 'string') {
      if (!fieldRules.pattern.value.test(value)) {
        fieldErrors.push(fieldRules.pattern.message);
      }
    }

    // Custom validations
    if (fieldRules.validate) {
      for (const [validationName, validationFn] of Object.entries(fieldRules.validate)) {
        const result = validationFn(value);
        if (typeof result === 'string') {
          fieldErrors.push(result);
        } else if (result === false) {
          fieldErrors.push(`${fieldName} validation failed: ${validationName}`);
        }
      }
    }

    if (fieldErrors.length > 0) {
      errors[fieldName as keyof T] = fieldErrors;
      isValid = false;
    }
  }

  return { isValid, errors };
};