// src/services/MarkupCalculator.js
const User = require('../models/User');
const Company = require('../models/Company');
const CarrierAccount = require('../models/CarrierAccount');

class MarkupCalculator {
  /**
   * Calculate the final price for a quote based on user, company, and carrier
   * @param {Object} quote - The ground quote with raw costs
   * @param {String} userId - User requesting the quote
   * @param {String} companyId - Company of the user
   * @returns {Object} Pricing details with markup applied
   */
  static async calculateQuotePrice(quote, userId, companyId) {
    // Get user and company details
    const user = await User.findById(userId);
    const company = companyId ? await Company.findById(companyId) : null;
    
    // Check if this is a customer's own carrier account
    const isCustomerAccount = quote.carrier?.accountType === 'customer';
    
    // System admins and Conship employees ALWAYS see raw costs
    const showDirectCosts = 
      user?.role === 'system_admin' || 
      user?.role === 'conship_employee' ||
      user?.role === 'conship_management' ||
      user?.canSeeDirectCosts === true ||
      company?.canSeeDirectCosts === true;
    
    const rawCost = quote.rawCost?.total || 0;
    
    // If showing direct costs OR using customer's own account, no markup
    if (showDirectCosts || isCustomerAccount) {
      return {
        subtotal: rawCost,
        markupAmount: 0,
        markupPercentage: 0,
        additionalFees: [],
        totalFees: 0,
        total: rawCost,
        showingDirectCost: showDirectCosts,
        isCustomerAccount: isCustomerAccount,
        accountLabel: isCustomerAccount ? quote.carrier?.accountName : null
      };
    }
    
    // Calculate markup for customers/partners
    if (!company) {
      // No company = use default markup
      return {
        subtotal: rawCost,
        markupAmount: rawCost * 0.18, // 18% default
        markupPercentage: 18,
        additionalFees: [],
        totalFees: 0,
        total: rawCost * 1.18,
        showingDirectCost: false,
        isCustomerAccount: false
      };
    }
    
    // Find the most specific markup rule
    const carrierCode = quote.carrier?.code || 'UNKNOWN';
    const mode = 'road'; // For ground quotes
    
    const markupRule = this.findBestMarkupRule(
      company.markupRules,
      carrierCode,
      mode
    );
    
    // Calculate markup
    let markupAmount = 0;
    let markupPercentage = 0;
    
    if (markupRule) {
      markupPercentage = markupRule.percentage || 0;
      markupAmount = rawCost * (markupPercentage / 100);
      
      // Apply min/max constraints
      if (markupRule.minimumMarkup) {
        markupAmount = Math.max(markupAmount, markupRule.minimumMarkup);
      }
      if (markupRule.maximumMarkup) {
        markupAmount = Math.min(markupAmount, markupRule.maximumMarkup);
      }
      
      // Add flat fee if any
      if (markupRule.flatFee) {
        markupAmount += markupRule.flatFee;
      }
    }
    
    // Get additional fees for this mode
    const additionalFees = this.getAdditionalFees(
      company.additionalFees,
      mode,
      rawCost + markupAmount
    );
    
    const totalFees = additionalFees.reduce((sum, fee) => sum + fee.amount, 0);
    
    return {
      subtotal: rawCost,
      markupAmount: Math.round(markupAmount * 100) / 100,
      markupPercentage,
      additionalFees,
      totalFees: Math.round(totalFees * 100) / 100,
      total: Math.round((rawCost + markupAmount + totalFees) * 100) / 100,
      showingDirectCost: false,
      isCustomerAccount: false
    };
  }
  
  /**
   * Find the most specific markup rule for a carrier/mode combination
   * Priority: Specific carrier > ALL carrier for mode > ALL/all
   */
  static findBestMarkupRule(rules, carrierCode, mode) {
    if (!rules || !Array.isArray(rules)) return null;
    
    const activeRules = rules.filter(r => r.active);
    
    // Priority 1: Exact carrier and mode match
    let rule = activeRules.find(r => 
      r.provider === carrierCode && r.mode === mode
    );
    if (rule) return rule;
    
    // Priority 2: Exact carrier, all modes
    rule = activeRules.find(r => 
      r.provider === carrierCode && r.mode === 'all'
    );
    if (rule) return rule;
    
    // Priority 3: ALL carriers, specific mode
    rule = activeRules.find(r => 
      r.provider === 'ALL' && r.mode === mode
    );
    if (rule) return rule;
    
    // Priority 4: ALL carriers, all modes
    rule = activeRules.find(r => 
      r.provider === 'ALL' && r.mode === 'all'
    );
    
    return rule;
  }
  
  /**
   * Get applicable additional fees for a mode
   */
  static getAdditionalFees(fees, mode, baseAmount) {
    if (!fees || !Array.isArray(fees)) return [];
    
    return fees
      .filter(fee => 
        fee.active && 
        (fee.appliesTo === mode || fee.appliesTo === 'all')
      )
      .map(fee => ({
        name: fee.name,
        code: fee.code,
        amount: fee.feeType === 'percentage' 
          ? Math.round(baseAmount * fee.amount / 100 * 100) / 100
          : fee.amount
      }));
  }
  
  /**
   * Check if customer has their own account for a carrier
   */
  static async hasCustomerAccount(userId, companyId, carrierCode) {
    const account = await CarrierAccount.findOne({
      $or: [
        { userId: userId },
        { companyId: companyId }
      ],
      carrier: carrierCode,
      isActive: true,
      useForQuotes: true
    });
    
    return !!account;
  }
}

module.exports = MarkupCalculator;
