// src/services/MarkupCalculator.js
const User = require('../models/User');
const Company = require('../models/Company');
const CarrierAccount = require('../models/CarrierAccount');

class MarkupCalculator {
  /**
   * Calculate the final price for a quote based on user, company, and carrier
   * @param {Object} quote - The ground quote with raw costs
   * @param {String} userId - User requesting the quote
   * @param {String} companyId - Company of the user (fallback to quote.companyId)
   * @returns {Object} Pricing details with markup applied
   */
  static async calculateQuotePrice(quote, userId, companyId) {
    // Guard values
    const safeCompanyId = companyId || quote?.companyId || null;
    const rawCost = Number(quote?.rawCost?.total || 0);

    // Fetch user & company
    const [user, company] = await Promise.all([
      userId ? User.findById(userId) : null,
      safeCompanyId ? Company.findById(safeCompanyId) : null
    ]);

    // Customer-owned account?
    const isCustomerAccount = quote?.carrier?.accountType === 'customer';

    // Who can see direct costs?
    const showDirectCosts =
      user?.role === 'system_admin' ||
      user?.role === 'conship_employee' ||
      user?.role === 'conship_management' ||
      user?.canSeeDirectCosts === true ||
      company?.canSeeDirectCosts === true ||
      isCustomerAccount; // showing direct costs is true if it's their own account (still no markup)

    // If showing direct costs OR using customer's own account, no markup or fees
    if (showDirectCosts) {
      return {
        subtotal: round2(rawCost),
        markupAmount: 0,
        markupPercentage: 0,
        additionalFees: [],
        totalFees: 0,
        total: round2(rawCost),
        showingDirectCost: true,
        isCustomerAccount,
        accountLabel: isCustomerAccount ? (quote?.carrier?.accountName || 'Your Account') : null
      };
    }

    // If no company context, use default 18% markup
    if (!company) {
      const markupAmount = rawCost * 0.18;
      return {
        subtotal: round2(rawCost),
        markupAmount: round2(markupAmount),
        markupPercentage: 18,
        additionalFees: [],
        totalFees: 0,
        total: round2(rawCost + markupAmount),
        showingDirectCost: false,
        isCustomerAccount: false,
        accountLabel: null
      };
    }

    // Company-specific rules
    const carrierCode = quote?.carrier?.code || 'UNKNOWN';
    const mode = 'road'; // ground/LTL

    const markupRule = this.findBestMarkupRule(
      company.markupRules,
      carrierCode,
      mode
    );

    // Compute markup
    let markupAmount = 0;
    let markupPercentage = 0;

    if (markupRule) {
      markupPercentage = Number(markupRule.percentage || 0);
      markupAmount = rawCost * (markupPercentage / 100);

      // Apply min/max caps
      if (markupRule.minimumMarkup) {
        markupAmount = Math.max(markupAmount, Number(markupRule.minimumMarkup));
      }
      if (markupRule.maximumMarkup) {
        markupAmount = Math.min(markupAmount, Number(markupRule.maximumMarkup));
      }
      // Add flat fee if present
      if (markupRule.flatFee) {
        markupAmount += Number(markupRule.flatFee);
      }
    }

    // Additional fees (company-level)
    const additionalFees = this.getAdditionalFees(
      company.additionalFees,
      mode,
      rawCost + markupAmount
    );
    const totalFees = additionalFees.reduce((sum, f) => sum + Number(f.amount || 0), 0);

    return {
      subtotal: round2(rawCost),
      markupAmount: round2(markupAmount),
      markupPercentage,
      additionalFees,
      totalFees: round2(totalFees),
      total: round2(rawCost + markupAmount + totalFees),
      showingDirectCost: false,
      isCustomerAccount: false,
      accountLabel: null
    };
  }

  /**
   * Find the most specific markup rule for a carrier/mode combination
   * Priority: Specific carrier > ALL carrier for mode > ALL/all
   */
  static findBestMarkupRule(rules, carrierCode, mode) {
    if (!rules || !Array.isArray(rules)) return null;

    const activeRules = rules.filter(r => r.active);

    // 1) Exact carrier + mode
    let rule = activeRules.find(r => r.provider === carrierCode && r.mode === mode);
    if (rule) return rule;

    // 2) Exact carrier + all modes
    rule = activeRules.find(r => r.provider === carrierCode && r.mode === 'all');
    if (rule) return rule;

    // 3) ALL carriers + mode
    rule = activeRules.find(r => r.provider === 'ALL' && r.mode === mode);
    if (rule) return rule;

    // 4) ALL carriers + all modes
    rule = activeRules.find(r => r.provider === 'ALL' && r.mode === 'all');

    return rule || null;
  }

  /**
   * Get applicable additional fees for a mode
   * @param {Array} fees
   * @param {String} mode
   * @param {Number} baseAmount
   */
  static getAdditionalFees(fees, mode, baseAmount) {
    if (!fees || !Array.isArray(fees)) return [];

    return fees
      .filter(fee => fee.active && (fee.appliesTo === mode || fee.appliesTo === 'all'))
      .map(fee => ({
        name: fee.name,
        code: fee.code,
        amount:
          fee.feeType === 'percentage'
            ? round2((Number(baseAmount) || 0) * (Number(fee.amount) || 0) / 100)
            : round2(Number(fee.amount) || 0)
      }));
  }

  /**
   * Check if customer has their own account for a carrier
   */
  static async hasCustomerAccount(userId, companyId, carrierCode) {
    const account = await CarrierAccount.findOne({
      $or: [{ userId }, { companyId }],
      carrier: carrierCode,
      isActive: true,
      useForQuotes: true
    });
    return !!account;
  }
}

/** Helpers */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

module.exports = MarkupCalculator;
