// src/controllers/airportController.js - UPDATED getNearestAirport function
const getNearestAirport = async (req, res) => {
  try {
    const { zipCode } = req.body;
    
    if (!zipCode || zipCode.length !== 5) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid 5-digit ZIP code is required' 
      });
    }
    
    // Find the BEST airport for this ZIP (closest delivery zone)
    const zipMapping = await ZipCodeAirport.findBestAirport(zipCode);
    
    if (zipMapping) {
      // Get the full airport details from us_gateways collection
      const airport = await Airport.findOne({ 
        code: zipMapping.airportCode,
        active: true,
        country: 'US' // Ensure it's a domestic airport
      });
      
      if (airport) {
        return res.json({
          success: true,
          airport: {
            code: airport.code,
            name: airport.name,
            city: airport.city,
            state: airport.state,
            country: airport.country,
            deliveryZone: zipMapping.deliveryZone, // Include delivery zone
            distance: zipMapping.distance
          }
        });
      }
    }
    
    // If no mapping found, return error
    res.status(404).json({
      success: false,
      error: `No airport mapping found for ZIP code ${zipCode}`,
      message: 'Please enter the origin airport code manually'
    });
  } catch (error) {
    console.error('Error finding nearest airport:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to find nearest airport' 
    });
  }
};
