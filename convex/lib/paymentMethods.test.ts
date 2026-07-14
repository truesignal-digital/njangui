import { describe, expect, test } from 'bun:test';

import {
  availableMobileMoneyMethod,
  detectMobileOperator,
  mobileMoneyAvailability,
  normalizeCameroonMobile,
} from './paymentMethods';

describe('normalizeCameroonMobile', () => {
  test('accepts E.164, bare-country, and local forms', () => {
    expect(normalizeCameroonMobile('+237670123456')).toBe('670123456');
    expect(normalizeCameroonMobile('237670123456')).toBe('670123456');
    expect(normalizeCameroonMobile('670123456')).toBe('670123456');
    expect(normalizeCameroonMobile('+237 670 12 34 56')).toBe('670123456');
  });

  test('rejects missing, short, landline, and foreign numbers', () => {
    expect(normalizeCameroonMobile(undefined)).toBeNull();
    expect(normalizeCameroonMobile('')).toBeNull();
    expect(normalizeCameroonMobile('67012345')).toBeNull();
    expect(normalizeCameroonMobile('+237222123456')).toBeNull();
    expect(normalizeCameroonMobile('+33612345678')).toBeNull();
    expect(normalizeCameroonMobile('—')).toBeNull();
  });
});

describe('detectMobileOperator', () => {
  test('MTN ranges 650–654, 67x, 680–684', () => {
    expect(detectMobileOperator('+237650000000')).toBe('mtn');
    expect(detectMobileOperator('+237654999999')).toBe('mtn');
    expect(detectMobileOperator('+237671234567')).toBe('mtn');
    expect(detectMobileOperator('+237684000000')).toBe('mtn');
  });

  test('Orange ranges 655–659, 685–689, 69x', () => {
    expect(detectMobileOperator('+237655000000')).toBe('orange');
    expect(detectMobileOperator('+237659999999')).toBe('orange');
    expect(detectMobileOperator('+237685000000')).toBe('orange');
    expect(detectMobileOperator('+237691234567')).toBe('orange');
  });

  test('Nexttel/Camtel ranges are other; invalid is null', () => {
    expect(detectMobileOperator('+237660000000')).toBe('other');
    expect(detectMobileOperator('+237620000000')).toBe('other');
    expect(detectMobileOperator(undefined)).toBeNull();
    expect(detectMobileOperator('not-a-number')).toBeNull();
  });
});

describe('mobileMoneyAvailability', () => {
  test('missing phone blocks both mobile-money methods', () => {
    expect(mobileMoneyAvailability('momo_mtn', undefined)).toEqual({
      available: false,
      reason: 'missing_phone',
    });
    expect(mobileMoneyAvailability('orange_money', '')).toEqual({
      available: false,
      reason: 'missing_phone',
    });
  });

  test('invalid phone blocks both', () => {
    expect(mobileMoneyAvailability('momo_mtn', '+33612345678')).toEqual({
      available: false,
      reason: 'invalid_phone',
    });
  });

  test('matching operator is available', () => {
    expect(mobileMoneyAvailability('momo_mtn', '+237671234567')).toEqual({
      available: true,
    });
    expect(mobileMoneyAvailability('orange_money', '+237691234567')).toEqual({
      available: true,
    });
  });

  test('cross-operator number is a mismatch', () => {
    expect(mobileMoneyAvailability('momo_mtn', '+237691234567')).toEqual({
      available: false,
      reason: 'operator_mismatch',
    });
    expect(mobileMoneyAvailability('orange_money', '+237671234567')).toEqual({
      available: false,
      reason: 'operator_mismatch',
    });
  });

  test('non-mobile-money operator is unsupported for both', () => {
    expect(mobileMoneyAvailability('momo_mtn', '+237660000000')).toEqual({
      available: false,
      reason: 'operator_unsupported',
    });
    expect(mobileMoneyAvailability('orange_money', '+237660000000')).toEqual({
      available: false,
      reason: 'operator_unsupported',
    });
  });
});

describe('availableMobileMoneyMethod', () => {
  test('suggests the reachable method or null', () => {
    expect(availableMobileMoneyMethod('+237671234567')).toBe('momo_mtn');
    expect(availableMobileMoneyMethod('+237691234567')).toBe('orange_money');
    expect(availableMobileMoneyMethod('+237660000000')).toBeNull();
    expect(availableMobileMoneyMethod(undefined)).toBeNull();
  });
});
