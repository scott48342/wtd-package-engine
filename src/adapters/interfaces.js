/**
 * Adapters are supplier/provider-agnostic interfaces.
 *
 * NOTE: Using JSDoc interfaces for now; can migrate to TypeScript later.
 */

/**
 * @typedef {Object} WheelSupplierAdapter
 * @property {function(): {code:string, mode:"api"|"feed"|"scrape", supportsRealtimeInventory:boolean}} getCapabilities
 * @property {function(query:Object): Promise<Object>} searchWheels
 * @property {function(externalSku:string): Promise<Object>} getWheelDetails
 */

/**
 * @typedef {Object} TireSupplierAdapter
 * @property {function(): {code:string, mode:"api"|"feed"|"scrape", supportsRealtimeInventory:boolean}} getCapabilities
 * @property {function(query:Object): Promise<Object>} searchTires
 * @property {function(externalSku:string): Promise<Object>} getTireDetails
 */

/**
 * @typedef {Object} FitmentProviderAdapter
 * @property {function(): {code:string, mode:"api"|"dataset", supportsVinLookup:boolean}} getCapabilities
 * @property {function(vehicle:Object): Promise<Object>} getFitment
 */

module.exports = {};
