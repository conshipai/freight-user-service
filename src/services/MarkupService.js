// src/services/MarkupService.js
class MarkupService {
  async calculateMarkupForUser(cost, userId) {
    const user = await User.findById(userId).populate('companyId');
    
    // System admins see direct costs
    if (user.role === 'system_admin' || user.canSeeDirectCosts) {
      return {
        markupAmount: 0,
        additionalFees: [],
        totalMarkup: 0,
        showingDirectCost: true
      };
    }
    
    const company = user.companyId;
    if (!company) {
      throw new Error('User has no associated company');
    }
    
    // Company can see direct costs
    if (company.canSeeDirectCosts) {
      return {
        markupAmount: 0,
        additionalFees: [],
        totalMarkup: 0,
        showingDirectCost: true
      };
    }
    
    // Find applicable markup rule
    const rule = company.markupRules.find(r => 
      r.active &&
      (r.provider === 'ALL' || r.provider === cost.provider) &&
      (r.mode === 'all' || r.mode === cost.service.toLowerCase())
    );
    
    if (!rule) {
      return { markupAmount: 0, additionalFees: [], totalMarkup: 0 };
    }
    
    // Calculate markup
    let markupAmount = cost.costs.totalCost * (rule.percentage / 100);
    markupAmount = Math.max(markupAmount, rule.minimumMarkup);
    markupAmount = Math.min(markupAmount, rule.maximumMarkup);
    markupAmount += rule.flatFee;
    
    // Add company-specific fees
    const additionalFees = company.additionalFees
      .filter(fee => 
        fee.active && 
        (fee.appliesTo === 'all' || fee.appliesTo === cost.service.toLowerCase())
      )
      .map(fee => ({
        name: fee.name,
        code: fee.code,
        amount: fee.feeType === 'percentage' 
          ? cost.costs.totalCost * (fee.amount / 100)
          : fee.amount
      }));
    
    const totalFees = additionalFees.reduce((sum, fee) => sum + fee.amount, 0);
    
    return {
      markupAmount: Math.round(markupAmount * 100) / 100,
      additionalFees,
      totalMarkup: Math.round((markupAmount + totalFees) * 100) / 100,
      showingDirectCost: false
    };
  }
}
