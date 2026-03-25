require('dotenv').config();
const { WheelSizeFitmentAdapter } = require('../adapters/fitment/WheelSizeFitmentAdapter');

(async () => {
  const a = new WheelSizeFitmentAdapter({
    baseUrl: process.env.WHEEL_SIZE_BASE_URL,
    apiKey: process.env.WHEEL_SIZE_API_KEY
  });

  const fit = await a.getFitment({
    year: 2020,
    make: 'Chevrolet',
    model: 'Silverado 2500 HD',
    modification: 'c112811761'
  });

  console.log(JSON.stringify(fit, null, 2));
})();
