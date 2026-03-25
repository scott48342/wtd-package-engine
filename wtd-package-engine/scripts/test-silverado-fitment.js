require('dotenv').config();
const { loadConfig } = require('../src/config');
const { WheelSizeFitmentAdapter } = require('../src/adapters/fitment/WheelSizeFitmentAdapter');

(async () => {
  const cfg = loadConfig();
  const a = new WheelSizeFitmentAdapter({
    baseUrl: cfg.WHEEL_SIZE_BASE_URL,
    apiKey: cfg.WHEEL_SIZE_API_KEY
  });

  const fit = await a.getFitment({
    year: 2020,
    make: 'Chevrolet',
    model: 'Silverado 2500 HD',
    // from quote debug screenshot
    modification: 'c112811761'
  });

  console.log(JSON.stringify(fit, null, 2));
})();
