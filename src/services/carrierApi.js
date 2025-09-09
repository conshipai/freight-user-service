// src/services/carrierApi.js - NEW BACKEND SERVICE
class CarrierAPI {
  constructor() {
    // In production, this would be from database
    // For now, we'll use hardcoded carriers
    this.carriers = [
      {
        id: 'carrier-1',
        name: 'Swift Transportation',
        email: 'quotes@swift.com',
        phone: '(800) 555-1234',
        services: ['ftl'],
        equipment: ['dry_van', 'reefer', 'flatbed'],
        active: true
      },
      {
        id: 'carrier-2',
        name: 'Express Logistics',
        email: 'dispatch@expresslog.com',
        phone: '(888) 555-5678',
        services: ['expedited', 'ftl'],
        equipment: ['sprinter', 'box_truck', 'straight_truck'],
        active: true
      },
      {
        id: 'carrier-3',
        name: 'Lightning Transport',
        email: 'quotes@lightning.com',
        phone: '(877) 555-9012',
        services: ['expedited'],
        equipment: ['sprinter', 'cargo_van'],
        active: true
      },
      {
        id: 'carrier-4',
        name: 'National Freight',
        email: 'dispatch@nationalfreight.com',
        phone: '(866) 555-3456',
        services: ['ftl'],
        equipment: ['dry_van', 'reefer', 'flatbed', 'step_deck'],
        active: true
      }
    ];
  }

  async getCarriers() {
    // Simulate async database call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          carriers: this.carriers
        });
      }, 100);
    });
  }

  async getCarriersForService(serviceType) {
    // Filter carriers by service type
    return new Promise((resolve) => {
      setTimeout(() => {
        const filtered = this.carriers.filter(c => 
          c.active && c.services.includes(serviceType)
        );
        resolve({
          success: true,
          carriers: filtered
        });
      }, 100);
    });
  }

  async getCarrierById(carrierId) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const carrier = this.carriers.find(c => c.id === carrierId);
        resolve({
          success: true,
          carrier
        });
      }, 100);
    });
  }

  async saveCarrier(carrierData) {
    // In production, save to database
    const newCarrier = {
      ...carrierData,
      id: `carrier-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    this.carriers.push(newCarrier);
    
    return {
      success: true,
      carrier: newCarrier
    };
  }

  async updateCarrier(carrierId, updates) {
    const index = this.carriers.findIndex(c => c.id === carrierId);
    if (index !== -1) {
      this.carriers[index] = {
        ...this.carriers[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      return {
        success: true,
        carrier: this.carriers[index]
      };
    }
    return {
      success: false,
      error: 'Carrier not found'
    };
  }

  async deleteCarrier(carrierId) {
    const index = this.carriers.findIndex(c => c.id === carrierId);
    if (index !== -1) {
      this.carriers.splice(index, 1);
      return { success: true };
    }
    return {
      success: false,
      error: 'Carrier not found'
    };
  }
}

// Export singleton instance
module.exports = new CarrierAPI();
