// src/routes/companies.js
router.post('/create', authorize(['system_admin']), async (req, res) => {
  try {
    const { 
      companyInfo,
      mainUser,
      markupRules,
      additionalFees 
    } = req.body;
    
    // Create company with markup configuration
    const company = await Company.create({
      ...companyInfo,
      markupRules: markupRules || [
        // Default markup if none provided
        {
          provider: 'ALL',
          mode: 'all',
          percentage: 25,
          minimumMarkup: 50,
          maximumMarkup: 10000,
          flatFee: 0
        }
      ],
      additionalFees: additionalFees || []
    });
    
    // Create main user
    const user = await User.create({
      ...mainUser,
      role: 'company_admin',
      companyId: company._id
    });
    
    // Update company with primary user
    company.primaryUserId = user._id;
    await company.save();
    
    res.json({
      success: true,
      company,
      user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
