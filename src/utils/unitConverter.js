const UnitConverter = {
  // Metric to Imperial
  kgToLbs: (kg) => kg * 2.20462,
  cmToIn: (cm) => cm / 2.54,
  
  // Imperial to Metric  
  lbsToKg: (lbs) => lbs / 2.20462,
  inToCm: (inches) => inches * 2.54,
  
  // Convert commodity object to imperial (for carriers)
  convertCommodityToImperial: (commodity) => {
    // If already in imperial or no metric flag, return as-is
    if (!commodity.useMetric) {
      return commodity;
    }
    
    // Convert metric to imperial
    return {
      ...commodity,
      weight: commodity.weight ? UnitConverter.kgToLbs(parseFloat(commodity.weight)) : commodity.weight,
      length: commodity.length ? UnitConverter.cmToIn(parseFloat(commodity.length)) : commodity.length,
      width: commodity.width ? UnitConverter.cmToIn(parseFloat(commodity.width)) : commodity.width,
      height: commodity.height ? UnitConverter.cmToIn(parseFloat(commodity.height)) : commodity.height,
      useMetric: false // Mark as converted
    };
  },
  
  // Ensure dimensions are within TForce limits
  capDimensions: (value, max = 96) => {
    return Math.min(parseFloat(value) || 0, max);
  }
};

module.exports = UnitConverter;
