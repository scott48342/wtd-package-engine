const { z } = require('zod');

const ProductIdentitySchema = z.object({
  supplier: z.string().min(1),
  externalSku: z.string().min(1),
  internalProductId: z.string().uuid().optional()
});

module.exports = {
  ProductIdentitySchema
};
